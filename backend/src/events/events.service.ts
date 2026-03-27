import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import { PrismaService } from '../prisma.service';
import { CreateEventDto } from './dto/create-event.dto';
import { UpdateEventDto } from './dto/update-event.dto';

@Injectable()
export class EventsService {
  constructor(private prisma: PrismaService) {}

  // ── Admin CRUD ──

  async getEvents() {
    return this.prisma.event.findMany({
      orderBy: { date: 'asc' },
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
        date: new Date(dto.date),
        hourCost: dto.hourCost,
      },
    });
  }

  async updateEvent(slug: string, dto: UpdateEventDto) {
    const event = await this.prisma.event.findUnique({ where: { slug } });
    if (!event) {
      throw new NotFoundException('Event not found');
    }

    const data: any = { ...dto };
    if (dto.date) {
      data.date = new Date(dto.date);
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
      orderBy: { date: 'asc' },
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
            date: true,
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

    return this.prisma.pinnedEvent.upsert({
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
            date: true,
            hourCost: true,
            isActive: true,
          },
        },
      },
    });
  }

  async removePinnedEvent(userId: number) {
    const pinned = await this.prisma.pinnedEvent.findUnique({ where: { userId } });
    if (!pinned) {
      throw new NotFoundException('No pinned event found');
    }
    await this.prisma.pinnedEvent.delete({ where: { userId } });
    return { removed: true };
  }
}
