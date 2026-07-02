import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma.service';
import { CreateAnnouncementDto } from './dto/create-announcement.dto';
import { UpdateAnnouncementDto } from './dto/update-announcement.dto';

@Injectable()
export class AnnouncementsService {
  constructor(private prisma: PrismaService) {}

  // ---- Admin ----------------------------------------------------------------

  async list() {
    const rows = await this.prisma.announcement.findMany({
      orderBy: { createdAt: 'desc' },
    });
    return rows.map((a) => this.toAdminResponse(a));
  }

  async getOne(id: number) {
    const a = await this.prisma.announcement.findUnique({
      where: { announcementId: id },
    });
    if (!a) throw new NotFoundException('Announcement not found');
    return this.toAdminResponse(a);
  }

  async create(dto: CreateAnnouncementDto) {
    const a = await this.prisma.announcement.create({
      data: {
        title: dto.title,
        previewText: dto.previewText,
        body: dto.body,
        showOnOpen: dto.showOnOpen ?? false,
        showAsTag: dto.showAsTag ?? false,
        isActive: dto.isActive ?? true,
        eventSlugs: dto.eventSlugs ?? [],
      },
    });
    return this.toAdminResponse(a);
  }

  async update(id: number, dto: UpdateAnnouncementDto) {
    const existing = await this.prisma.announcement.findUnique({
      where: { announcementId: id },
      select: { announcementId: true },
    });
    if (!existing) throw new NotFoundException('Announcement not found');

    const a = await this.prisma.announcement.update({
      where: { announcementId: id },
      data: {
        title: dto.title,
        previewText: dto.previewText,
        body: dto.body,
        showOnOpen: dto.showOnOpen,
        showAsTag: dto.showAsTag,
        isActive: dto.isActive,
        // Replace the whole tag set only when eventSlugs is explicitly provided.
        ...(dto.eventSlugs !== undefined ? { eventSlugs: dto.eventSlugs } : {}),
      },
    });
    return this.toAdminResponse(a);
  }

  async remove(id: number) {
    const existing = await this.prisma.announcement.findUnique({
      where: { announcementId: id },
      select: { announcementId: true },
    });
    if (!existing) throw new NotFoundException('Announcement not found');
    await this.prisma.announcement.delete({ where: { announcementId: id } });
    return { success: true };
  }

  // ---- User -----------------------------------------------------------------

  /**
   * Announcements visible to a user: active ones that are either global
   * (no event tags) or tagged for the user's currently pinned event slug.
   */
  async listForUser(userId: number) {
    const pinned = await this.prisma.pinnedEvent.findUnique({
      where: { userId },
      select: { event: { select: { slug: true } } },
    });
    const pinnedSlug = pinned?.event?.slug ?? null;

    const rows = await this.prisma.announcement.findMany({
      where: {
        isActive: true,
        OR: [
          { eventSlugs: { isEmpty: true } },
          ...(pinnedSlug ? [{ eventSlugs: { has: pinnedSlug } }] : []),
        ],
      },
      orderBy: { createdAt: 'desc' },
      include: { reads: { where: { userId }, select: { id: true } } },
    });

    // Resolve slug -> title for the event pills in one batch query.
    const slugs = [...new Set(rows.flatMap((r) => r.eventSlugs))];
    const titleMap = await this.slugTitleMap(slugs);

    return rows.map((a) => ({
      announcementId: a.announcementId,
      title: a.title,
      previewText: a.previewText,
      body: a.body,
      showOnOpen: a.showOnOpen,
      showAsTag: a.showAsTag,
      createdAt: a.createdAt,
      events: a.eventSlugs.map((slug) => ({ slug, title: titleMap[slug] ?? slug })),
      isRead: a.reads.length > 0,
    }));
  }

  async markRead(userId: number, id: number) {
    const a = await this.prisma.announcement.findUnique({
      where: { announcementId: id },
      select: { announcementId: true },
    });
    if (!a) throw new NotFoundException('Announcement not found');
    await this.prisma.announcementRead.upsert({
      where: { userId_announcementId: { userId, announcementId: id } },
      create: { userId, announcementId: id },
      update: {},
    });
    return { success: true, isRead: true };
  }

  // ---- Helpers --------------------------------------------------------------

  private async slugTitleMap(slugs: string[]): Promise<Record<string, string>> {
    if (!slugs.length) return {};
    const events = await this.prisma.event.findMany({
      where: { slug: { in: slugs } },
      select: { slug: true, title: true },
    });
    return Object.fromEntries(events.map((e) => [e.slug, e.title]));
  }

  private toAdminResponse(a: any) {
    return {
      announcementId: a.announcementId,
      title: a.title,
      previewText: a.previewText,
      body: a.body,
      showOnOpen: a.showOnOpen,
      showAsTag: a.showAsTag,
      isActive: a.isActive,
      createdAt: a.createdAt,
      updatedAt: a.updatedAt,
      eventSlugs: a.eventSlugs,
    };
  }
}
