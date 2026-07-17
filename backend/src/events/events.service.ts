import {
  Injectable,
  NotFoundException,
  BadRequestException,
  ConflictException,
} from '@nestjs/common';
import { Prisma } from '../../generated/prisma/client';
import { PrismaService } from '../prisma.service';
import { CreateEventDto } from './dto/create-event.dto';
import { UpdateEventDto } from './dto/update-event.dto';
import { SlackChannelsService } from '../slack-channels/slack-channels.service';
import { SlackService } from '../slack/slack.service';
import { BalanceService } from '../balance/balance.service';
import { AirtableService } from '../airtable/airtable.service';

@Injectable()
export class EventsService {
  constructor(
    private prisma: PrismaService,
    private slackChannelsService: SlackChannelsService,
    private slackService: SlackService,
    private balanceService: BalanceService,
    private airtableService: AirtableService,
  ) {}

  // ── Admin CRUD ──

  async getEvents() {
    return this.prisma.event.findMany({
      orderBy: { startDate: 'asc' },
      include: { _count: { select: { pinnedBy: true } } },
    });
  }

  async getEvent(slug: string) {
    const event = await this.prisma.event.findUnique({
      where: { slug },
      include: { _count: { select: { pinnedBy: true } } },
    });
    if (!event) {
      throw new NotFoundException('Event not found');
    }
    return event;
  }

  async createEvent(dto: CreateEventDto) {
    return this.prisma.event.create({
      data: {
        slug: dto.slug,
        title: dto.title,
        description: dto.description,
        imageUrl: dto.imageUrl,
        location: dto.location,
        startDate: new Date(dto.startDate),
        endDate: new Date(dto.endDate),
        hourCost: dto.hourCost,
        ticketThreshold: dto.ticketThreshold ?? null,
        ticketCost: dto.ticketCost ?? null,
        ticketEnabled: dto.ticketEnabled ?? false,
      },
    });
  }

  async updateEvent(slug: string, dto: UpdateEventDto) {
    const event = await this.prisma.event.findUnique({ where: { slug } });
    if (!event) {
      throw new NotFoundException('Event not found');
    }

    const data: any = { ...dto };
    if (dto.startDate) {
      data.startDate = new Date(dto.startDate);
    }
    if (dto.endDate) {
      data.endDate = new Date(dto.endDate);
    }

    return this.prisma.event.update({
      where: { slug },
      data,
    });
  }

  async deleteEvent(slug: string) {
    const event = await this.prisma.event.findUnique({ where: { slug } });
    if (!event) {
      throw new NotFoundException('Event not found');
    }
    await this.prisma.event.delete({ where: { slug } });
    return { deleted: true, slug };
  }

  // ── User-facing ──

  async getActiveEvents() {
    return this.prisma.event.findMany({
      where: { isActive: true },
      orderBy: { startDate: 'asc' },
    });
  }

  async getPinnedEvent(userId: number) {
    return this.prisma.pinnedEvent.findUnique({
      where: { userId },
      include: {
        event: {
          select: {
            eventId: true,
            slug: true,
            title: true,
            description: true,
            imageUrl: true,
            startDate: true,
            endDate: true,
            hourCost: true,
            isActive: true,
          },
        },
      },
    });
  }

  async setPinnedEvent(userId: number, slug: string) {
    const event = await this.prisma.event.findUnique({ where: { slug } });
    if (!event) {
      throw new NotFoundException('Event not found');
    }
    if (!event.isActive) {
      throw new BadRequestException('Event is not active');
    }

    const result = await this.prisma.pinnedEvent.upsert({
      where: { userId },
      create: { userId, eventId: event.eventId },
      update: { eventId: event.eventId },
      include: {
        event: {
          select: {
            eventId: true,
            slug: true,
            title: true,
            description: true,
            imageUrl: true,
            startDate: true,
            endDate: true,
            hourCost: true,
            isActive: true,
          },
        },
      },
    });

    this.slackChannelsService
      .inviteToSubeventChannel(userId)
      .catch((err) =>
        console.error('[SlackChannels] inviteToSubeventChannel failed:', err),
      );
    void this.syncChosenEventToAirtable(userId);

    return result;
  }

  async removePinnedEvent(userId: number) {
    const pinned = await this.prisma.pinnedEvent.findUnique({
      where: { userId },
    });
    if (!pinned) {
      throw new NotFoundException('No pinned event found');
    }
    await this.prisma.pinnedEvent.delete({ where: { userId } });
    void this.syncChosenEventToAirtable(userId);
    return { removed: true };
  }

  private async syncChosenEventToAirtable(userId: number) {
    try {
      const user = await this.prisma.user.findUnique({
        where: { userId },
        select: { email: true },
      });
      if (!user?.email) return;
      await this.airtableService.syncUserStats(user.email);
    } catch (err) {
      console.error('[Events] Airtable chosen-event sync failed:', err);
    }
  }

  // ── Ticketing ──

  async getTicketStatus(userId: number, slug: string) {
    const event = await this.prisma.event.findUnique({ where: { slug } });
    if (!event) {
      throw new NotFoundException('Event not found');
    }

    const hasTicketTxn = await this.prisma.transaction.findFirst({
      where: {
        userId,
        eventId: event.eventId,
        kind: 'EventTicket',
        refundedAt: null,
      },
      select: { transactionId: true },
    });

    const { balance, totalApprovedHours } =
      await this.balanceService.getUserBalance(userId);

    return {
      slug: event.slug,
      ticketThreshold: event.ticketThreshold,
      ticketCost: event.ticketCost,
      ticketEnabled: event.ticketEnabled,
      hasTicket: !!hasTicketTxn,
      balance,
      approvedHours: Math.round(totalApprovedHours * 10) / 10,
    };
  }

  async buyTicket(userId: number, slug: string) {
    const event = await this.prisma.event.findUnique({ where: { slug } });
    if (!event) {
      throw new NotFoundException('Event not found');
    }
    if (!event.isActive) {
      throw new BadRequestException('Event is not active');
    }
    if (event.ticketCost === null) {
      throw new BadRequestException(
        'This event does not have a ticket for purchase',
      );
    }
    if (!event.ticketEnabled) {
      throw new BadRequestException(
        'Ticket sales are not currently open for this event',
      );
    }

    await this.balanceService.verifyEligibility(userId, 'Event Ticket');

    // Threshold gates eligibility on approved hours earned, not on balance —
    // users may still buy when their balance can't cover the full price
    // (balance is allowed to go negative).
    if (event.ticketThreshold !== null) {
      const { totalApprovedHours } =
        await this.balanceService.getUserBalance(userId);
      if (totalApprovedHours < event.ticketThreshold) {
        throw new BadRequestException(
          `You need ${event.ticketThreshold} approved hours to buy a ticket. You have ${Math.round(totalApprovedHours * 10) / 10}.`,
        );
      }
    }

    // A refunded ticket keeps its row (the unique constraint on
    // user+event+kind forbids a second one), so re-purchase reactivates the
    // existing refunded row rather than creating a new transaction. Only an
    // active (non-refunded) ticket blocks the purchase.
    const activeTicket = await this.prisma.transaction.findFirst({
      where: {
        userId,
        eventId: event.eventId,
        kind: 'EventTicket',
        refundedAt: null,
      },
      select: { transactionId: true },
    });
    if (activeTicket) {
      throw new ConflictException('You already have a ticket for this event');
    }

    let transaction;
    try {
      transaction = await this.prisma.$transaction(async (tx) => {
        const txn = await tx.transaction.upsert({
          where: {
            uniq_user_event_kind: {
              userId,
              eventId: event.eventId,
              kind: 'EventTicket',
            },
          },
          create: {
            userId,
            eventId: event.eventId,
            kind: 'EventTicket',
            itemDescription: `Ticket — ${event.title}`,
            cost: event.ticketCost!,
          },
          // Reactivate a previously refunded ticket as a fresh purchase.
          update: {
            itemDescription: `Ticket — ${event.title}`,
            cost: event.ticketCost!,
            refundedAt: null,
            isFulfilled: false,
            fulfilledAt: null,
            createdAt: new Date(),
          },
        });
        await tx.pinnedEvent.upsert({
          where: { userId },
          create: { userId, eventId: event.eventId },
          update: { eventId: event.eventId },
        });
        return txn;
      });
    } catch (err) {
      if (
        err instanceof Prisma.PrismaClientKnownRequestError &&
        err.code === 'P2002'
      ) {
        throw new ConflictException(
          'You already have a ticket for this event',
        );
      }
      throw err;
    }

    this.slackChannelsService
      .inviteToSubeventChannel(userId)
      .catch((err) =>
        console.error('[SlackChannels] inviteToSubeventChannel failed:', err),
      );
    this.sendTicketConfirmation(userId, event.title).catch((err) =>
      console.error('[Events] ticket confirmation Slack DM failed:', err),
    );
    // Stamp the Airtable Loops field so the user is added to the
    // ticket-purchase email cohort. Lookup email first since syncUserEvent
    // is keyed on it; failures are non-fatal.
    void this.syncTicketPurchaseToAirtable(userId);
    void this.airtableService
      .syncTransaction(transaction.transactionId)
      .catch((err) => console.error('[Events] Airtable txn sync failed:', err));

    const newBalance = await this.balanceService.getUserBalance(userId);
    return {
      transactionId: transaction.transactionId,
      newBalance: newBalance.balance,
    };
  }

  private async syncTicketPurchaseToAirtable(userId: number) {
    try {
      const user = await this.prisma.user.findUnique({
        where: { userId },
        select: { email: true },
      });
      if (!user?.email) return;
      await this.airtableService.syncUserEvent(
        user.email,
        userId,
        'eventTicketPurchased',
      );
    } catch (err) {
      console.error('[Events] Airtable ticket-purchase sync failed:', err);
    }
  }

  async getEventAttendees(slug: string) {
    const event = await this.prisma.event.findUnique({ where: { slug } });
    if (!event) {
      throw new NotFoundException('Event not found');
    }

    const txns = await this.prisma.transaction.findMany({
      where: {
        eventId: event.eventId,
        kind: 'EventTicket',
      },
      include: {
        user: {
          select: {
            userId: true,
            email: true,
            firstName: true,
            lastName: true,
          },
        },
      },
      orderBy: { createdAt: 'asc' },
    });

    return txns.map((t) => ({
      userId: t.user.userId,
      email: t.user.email,
      firstName: t.user.firstName,
      lastName: t.user.lastName,
      ticketAt: t.createdAt,
      totalSpent: Math.round(t.cost * 10) / 10,
    }));
  }

  async pushAttendeesToAttend(
    slug: string,
    attendApiKey: string,
    attendEventName?: string,
  ) {
    const event = await this.prisma.event.findUnique({ where: { slug } });
    if (!event) {
      throw new NotFoundException('Event not found');
    }

    const apiKey = attendApiKey.trim();
    if (!apiKey) {
      throw new BadRequestException('Attend API key is required');
    }

    const targetName = attendEventName?.trim() || `horizons-${event.slug}`;
    const url = `https://attend.hackclub.com/api/v1/events/${encodeURIComponent(targetName)}/participants`;

    // Only active (non-refunded) tickets count as attendance.
    const txns = await this.prisma.transaction.findMany({
      where: {
        eventId: event.eventId,
        kind: 'EventTicket',
        refundedAt: null,
      },
      include: {
        user: {
          select: { email: true, firstName: true, lastName: true },
        },
      },
      orderBy: { createdAt: 'asc' },
    });

    let pushed = 0;
    let alreadyAdded = 0;
    const failures: { email: string; error: string }[] = [];
    for (const txn of txns) {
      try {
        const res = await fetch(url, {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${apiKey}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            first_name: txn.user.firstName,
            last_name: txn.user.lastName,
            email: txn.user.email,
          }),
        });
        if (res.status === 409) {
          // Participant already exists on Attend
          alreadyAdded++;
          continue;
        }
        if (!res.ok) {
          const body = await res.text().catch(() => '');
          failures.push({
            email: txn.user.email,
            error: `HTTP ${res.status}${body ? `: ${body.slice(0, 200)}` : ''}`,
          });
          continue;
        }
        pushed++;
      } catch (err) {
        failures.push({
          email: txn.user.email,
          error: err instanceof Error ? err.message : 'Request failed',
        });
      }
    }

    return {
      attendEventName: targetName,
      total: txns.length,
      pushed,
      alreadyAdded,
      failures,
    };
  }

  private async sendTicketConfirmation(userId: number, eventTitle: string) {
    const user = await this.prisma.user.findUnique({
      where: { userId },
      select: { slackUserId: true },
    });
    if (!user?.slackUserId) return;
    await this.slackService.sendDirectMessage(
      user.slackUserId,
      `🎟️ Your full ticket for *${eventTitle}* is confirmed. See you there!`,
    );
  }
}
