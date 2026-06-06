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

  // ── Event hour progress ──

  async getEventHoursCredit(userId: number, eventSlug: string): Promise<number> {
    const result = await this.prisma.transaction.aggregate({
      where: {
        userId,
        kind: 'ShopItem',
        refundedAt: null,
        eventHoursCredit: { not: null },
        item: { shop: { slug: eventSlug } },
      },
      _sum: { eventHoursCredit: true },
    });
    return Math.round((result._sum.eventHoursCredit ?? 0) * 10) / 10;
  }

  // ── Ticketing ──

  async getTicketStatus(userId: number, slug: string) {
    const event = await this.prisma.event.findUnique({ where: { slug } });
    if (!event) {
      throw new NotFoundException('Event not found');
    }

    const hasTicketTxn = await this.prisma.transaction.findUnique({
      where: {
        uniq_user_event_kind: {
          userId,
          eventId: event.eventId,
          kind: 'EventTicket',
        },
      },
      select: { transactionId: true },
    });

    const [{ balance, totalApprovedHours }, eventHoursCredit] =
      await Promise.all([
        this.balanceService.getUserBalance(userId),
        this.getEventHoursCredit(userId, event.slug),
      ]);

    return {
      slug: event.slug,
      ticketThreshold: event.ticketThreshold,
      ticketCost: event.ticketCost,
      ticketEnabled: event.ticketEnabled,
      hasTicket: !!hasTicketTxn,
      balance,
      approvedHours: Math.round(totalApprovedHours * 10) / 10,
      eventHoursCredit,
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
      const eventHoursCredit = await this.getEventHoursCredit(
        userId,
        event.slug,
      );
      const totalEligibleHours = totalApprovedHours + eventHoursCredit;
      if (totalEligibleHours < event.ticketThreshold) {
        throw new BadRequestException(
          `You need ${event.ticketThreshold} approved hours to buy a ticket. You have ${Math.round(totalEligibleHours * 10) / 10}.`,
        );
      }
    }

    // Sum up all event hours credits for this specific event and reduce the ticket cost
    const eventHoursCredits = await this.prisma.transaction.findMany({
      where: {
        userId,
        eventId: event.eventId,
        eventHoursCredit: { not: null },
        refundedAt: null,
      },
      select: { eventHoursCredit: true },
    });
    const totalEventHoursCredit = eventHoursCredits.reduce(
      (sum, txn) => sum + (txn.eventHoursCredit ?? 0),
      0,
    );
    const netTicketCost = Math.max(0, event.ticketCost! - totalEventHoursCredit);

    // Verify the user has sufficient balance to pay for the ticket
    const { balance } = await this.balanceService.getUserBalance(userId);
    if (balance < netTicketCost) {
      throw new BadRequestException(
        `Insufficient balance. You need ${netTicketCost} hours to buy a ticket, but you have ${Math.round(balance * 10) / 10} hours.`,
      );
    }

    let transaction;
    try {
      transaction = await this.prisma.$transaction(async (tx) => {
        const txn = await tx.transaction.create({
          data: {
            userId,
            eventId: event.eventId,
            kind: 'EventTicket',
            itemDescription: `Ticket — ${event.title}`,
            cost: netTicketCost,
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
