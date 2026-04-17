import { Injectable, Logger } from '@nestjs/common';

@Injectable()
export class CachetService {
  private readonly logger = new Logger(CachetService.name);

  async getDisplayName(slackUserId: string): Promise<string | null> {
    try {
      const res = await fetch(
        `https://cachet.dunkirk.sh/users/${slackUserId}`,
      );
      if (!res.ok) return null;
      const data = await res.json();
      return data?.displayName ?? null;
    } catch (e) {
      this.logger.warn(
        `Failed to fetch Cachet profile for ${slackUserId}: ${e}`,
      );
      return null;
    }
  }

  async getDisplayNames(
    slackUserIds: string[],
  ): Promise<Map<string, string>> {
    const results = await Promise.allSettled(
      slackUserIds.map(async (id) => ({
        id,
        name: await this.getDisplayName(id),
      })),
    );
    const map = new Map<string, string>();
    for (const result of results) {
      if (result.status === 'fulfilled' && result.value.name) {
        map.set(result.value.id, result.value.name);
      }
    }
    return map;
  }
}
