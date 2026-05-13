import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma.service';
import { LoopsService } from '../loops/loops.service';

/**
 * Sends the one-shot "you hit the approved-hours bar — buy your ticket" Loops
 * email. Idempotent per user via the `ticketQualifyEmailSentAt` column.
 *
 * Called from two trigger points:
 *  - SubmissionApprovalService — when a project approval pushes a user's
 *    total approved hours across the bar
 *  - AuthService — at HCA login, to backfill users who were already past
 *    the bar before this email existed
 *
 * Both call `tryNotify(userId)` as fire-and-forget; this service decides
 * whether the user is actually eligible.
 */
@Injectable()
export class TicketQualifyEmailService {
  /** Hour threshold at which the email fires. */
  static readonly QUALIFY_HOURS = 15;

  constructor(
    private prisma: PrismaService,
    private loopsService: LoopsService,
  ) {}

  /**
   * Try to send the qualify email for the user with this email. Skipped
   * silently when:
   * - The user has already been sent the email
   * - The user has no pinned event (we have no event name to put in the copy)
   * - The pinned event isn't open for ticket sales (`ticketEnabled = false`)
   * - The user already bought a ticket for the pinned event
   * - The user's total approved hours are still below the bar
   *
   * Returns `true` iff the email was sent (and the flag stamped) on this
   * call. Callers can use this to suppress overlapping notifications — e.g.
   * the submission-approved email at the moment a user crosses the bar.
   */
  async tryNotify(email: string): Promise<boolean> {
    const user = await this.prisma.user.findUnique({
      where: { email },
      select: {
        userId: true,
        email: true,
        ticketQualifyEmailSentAt: true,
        projects: { select: { approvedHours: true } },
        pinnedEvent: {
          select: {
            eventId: true,
            event: {
              select: { slug: true, title: true, ticketEnabled: true },
            },
          },
        },
      },
    });
    if (!user) return false;
    if (user.ticketQualifyEmailSentAt) return false;
    if (!user.pinnedEvent?.event?.ticketEnabled) return false;

    const existingTicket = await this.prisma.transaction.findUnique({
      where: {
        uniq_user_event_kind: {
          userId: user.userId,
          eventId: user.pinnedEvent.eventId,
          kind: 'EventTicket',
        },
      },
      select: { transactionId: true },
    });
    if (existingTicket) return false;

    const totalApproved = user.projects.reduce(
      (sum, p) => sum + (p.approvedHours ?? 0),
      0,
    );
    if (totalApproved < TicketQualifyEmailService.QUALIFY_HOURS) return false;

    const result = await this.loopsService.sendTicketQualifyEmail(
      user.email,
      {
        eventName: `Horizons ${user.pinnedEvent.event.title}`,
        rsvpQualificationBar: TicketQualifyEmailService.QUALIFY_HOURS,
      },
      { idempotencyKey: `ticket-qualify:${user.userId}` },
    );
    if (!result.success) {
      console.warn(
        `[TicketQualifyEmail] send failed for ${user.email}: ${result.message ?? 'unknown'} (status ${result.status})`,
      );
      return false;
    }
    await this.prisma.user.update({
      where: { userId: user.userId },
      data: { ticketQualifyEmailSentAt: new Date() },
    });
    return true;
  }
}
