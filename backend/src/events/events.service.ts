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

@Injectable()
export class EventsService {
  constructor(
    private prisma: PrismaService,
    private slackChannelsService: SlackChannelsService,
    private slackService: SlackService,
    private balanceService: BalanceService,
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
        rsvpCost: dto.rsvpCost ?? null,
        ticketCost: dto.ticketCost ?? null,
        rsvpEnabled: dto.rsvpEnabled ?? false,
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
    if (event.rsvpCost !== null) {
      throw new BadRequestException(
        'This event requires an RSVP to attend. Please RSVP instead.',
      );
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
    return { removed: true };
  }

  // ── Ticketing ──

  async getTicketStatus(userId: number, slug: string) {
    const event = await this.prisma.event.findUnique({ where: { slug } });
    if (!event) {
      throw new NotFoundException('Event not found');
    }

    const txns = await this.prisma.transaction.findMany({
      where: {
        userId,
        eventId: event.eventId,
        kind: { in: ['EventRsvp', 'EventTicket'] },
      },
      select: { kind: true },
    });

    const { balance } = await this.balanceService.getUserBalance(userId);

    return {
      slug: event.slug,
      rsvpCost: event.rsvpCost,
      ticketCost: event.ticketCost,
      hasRsvp: txns.some((t) => t.kind === 'EventRsvp'),
      hasTicket: txns.some((t) => t.kind === 'EventTicket'),
      balance,
    };
  }

  async rsvpToEvent(userId: number, slug: string) {
    const event = await this.prisma.event.findUnique({ where: { slug } });
    if (!event) {
      throw new NotFoundException('Event not found');
    }
    if (!event.isActive) {
      throw new BadRequestException('Event is not active');
    }
    if (event.rsvpCost === null) {
      throw new BadRequestException(
        'This event does not require an RSVP — pin it instead',
      );
    }
    if (!event.rsvpEnabled) {
      throw new BadRequestException('RSVPs are not currently open for this event');
    }

    await this.balanceService.verifyEligibility(userId, 'Event RSVP');

    const { balance } = await this.balanceService.getUserBalance(userId);
    if (balance < event.rsvpCost) {
      throw new BadRequestException(
        `Insufficient balance. You have ${balance} hours but RSVP costs ${event.rsvpCost} hours.`,
      );
    }

    let transaction;
    try {
      transaction = await this.prisma.$transaction(async (tx) => {
        const txn = await tx.transaction.create({
          data: {
            userId,
            eventId: event.eventId,
            kind: 'EventRsvp',
            itemDescription: `RSVP — ${event.title}`,
            cost: event.rsvpCost!,
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
        throw new ConflictException("You've already RSVP'd to this event");
      }
      throw err;
    }

    this.slackChannelsService
      .inviteToSubeventChannel(userId)
      .catch((err) =>
        console.error('[SlackChannels] inviteToSubeventChannel failed:', err),
      );

    const newBalance = await this.balanceService.getUserBalance(userId);
    return {
      transactionId: transaction.transactionId,
      newBalance: newBalance.balance,
    };
  }

  async upgradeToTicket(userId: number, slug: string) {
    const event = await this.prisma.event.findUnique({ where: { slug } });
    if (!event) {
      throw new NotFoundException('Event not found');
    }
    if (!event.isActive) {
      throw new BadRequestException('Event is not active');
    }
    if (event.ticketCost === null) {
      throw new BadRequestException(
        'This event does not have a full ticket stage',
      );
    }
    if (!event.ticketEnabled) {
      throw new BadRequestException(
        'Ticket sales are not currently open for this event',
      );
    }

    const rsvp = await this.prisma.transaction.findUnique({
      where: {
        uniq_user_event_kind: {
          userId,
          eventId: event.eventId,
          kind: 'EventRsvp',
        },
      },
    });
    if (!rsvp) {
      throw new BadRequestException(
        'You must RSVP to this event before buying the full ticket',
      );
    }

    await this.balanceService.verifyEligibility(userId, 'Event Ticket');

    const { balance } = await this.balanceService.getUserBalance(userId);
    if (balance < event.ticketCost) {
      throw new BadRequestException(
        `Insufficient balance. You have ${balance} hours but the ticket costs ${event.ticketCost} hours.`,
      );
    }

    let transaction;
    try {
      transaction = await this.prisma.transaction.create({
        data: {
          userId,
          eventId: event.eventId,
          kind: 'EventTicket',
          itemDescription: `Ticket — ${event.title}`,
          cost: event.ticketCost,
        },
      });
    } catch (err) {
      if (
        err instanceof Prisma.PrismaClientKnownRequestError &&
        err.code === 'P2002'
      ) {
        throw new ConflictException(
          'You already have a full ticket for this event',
        );
      }
      throw err;
    }

    this.sendTicketConfirmation(userId, event.title).catch((err) =>
      console.error('[Events] ticket confirmation Slack DM failed:', err),
    );

    const newBalance = await this.balanceService.getUserBalance(userId);
    return {
      transactionId: transaction.transactionId,
      newBalance: newBalance.balance,
    };
  }

  async getEventAttendees(slug: string) {
    const event = await this.prisma.event.findUnique({ where: { slug } });
    if (!event) {
      throw new NotFoundException('Event not found');
    }

    const txns = await this.prisma.transaction.findMany({
      where: {
        eventId: event.eventId,
        kind: { in: ['EventRsvp', 'EventTicket'] },
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

    const byUser = new Map<
      number,
      {
        userId: number;
        email: string;
        firstName: string;
        lastName: string;
        rsvpAt: Date | null;
        ticketAt: Date | null;
        totalSpent: number;
      }
    >();
    for (const t of txns) {
      const row = byUser.get(t.userId) ?? {
        userId: t.user.userId,
        email: t.user.email,
        firstName: t.user.firstName,
        lastName: t.user.lastName,
        rsvpAt: null,
        ticketAt: null,
        totalSpent: 0,
      };
      if (t.kind === 'EventRsvp') row.rsvpAt = t.createdAt;
      if (t.kind === 'EventTicket') row.ticketAt = t.createdAt;
      row.totalSpent = Math.round((row.totalSpent + t.cost) * 10) / 10;
      byUser.set(t.userId, row);
    }
    return Array.from(byUser.values());
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
