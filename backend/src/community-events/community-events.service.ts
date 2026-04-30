import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma.service';
import { CreateCommunityEventDto } from './dto/create-community-event.dto';
import { UpdateCommunityEventDto } from './dto/update-community-event.dto';

@Injectable()
export class CommunityEventsService {
  constructor(private prisma: PrismaService) {}

  // ── User-facing ──

  async getActiveEvents() {
    return this.prisma.communityEvent.findMany({
      where: {
        isActive: true,
        end: { gte: new Date() },
      },
      orderBy: { start: 'asc' },
    });
  }

  // ── Admin CRUD ──

  async getEvents() {
    return this.prisma.communityEvent.findMany({
      orderBy: { start: 'asc' },
    });
  }

  async getEvent(communityEventId: string) {
    const event = await this.prisma.communityEvent.findUnique({
      where: { communityEventId },
    });
    if (!event) {
      throw new NotFoundException('Community event not found');
    }
    return event;
  }

  async createEvent(dto: CreateCommunityEventDto) {
    const start = new Date(dto.start);
    const end = new Date(dto.end);
    if (end < start) {
      throw new BadRequestException('End must be on or after start');
    }
    return this.prisma.communityEvent.create({
      data: {
        name: dto.name,
        start,
        end,
        tagline: dto.tagline,
        joinInfo: dto.joinInfo,
        actionUrl: dto.actionUrl,
        actionLabel: dto.actionLabel,
        description: dto.description,
        isActive: dto.isActive ?? true,
      },
    });
  }

  async updateEvent(communityEventId: string, dto: UpdateCommunityEventDto) {
    const existing = await this.prisma.communityEvent.findUnique({
      where: { communityEventId },
    });
    if (!existing) {
      throw new NotFoundException('Community event not found');
    }

    const data: Record<string, unknown> = { ...dto };
    if (dto.start) data.start = new Date(dto.start);
    if (dto.end) data.end = new Date(dto.end);

    const nextStart = (data.start as Date | undefined) ?? existing.start;
    const nextEnd = (data.end as Date | undefined) ?? existing.end;
    if (nextEnd < nextStart) {
      throw new BadRequestException('End must be on or after start');
    }

    return this.prisma.communityEvent.update({
      where: { communityEventId },
      data,
    });
  }

  async deleteEvent(communityEventId: string) {
    const existing = await this.prisma.communityEvent.findUnique({
      where: { communityEventId },
    });
    if (!existing) {
      throw new NotFoundException('Community event not found');
    }
    await this.prisma.communityEvent.delete({ where: { communityEventId } });
    return { deleted: true, communityEventId };
  }
}
