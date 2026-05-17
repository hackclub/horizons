import {
  Controller,
  Get,
  Query,
  BadRequestException,
  InternalServerErrorException,
  Logger,
} from '@nestjs/common';
import {
  ApiTags,
  ApiOperation,
  ApiQuery,
  ApiOkResponse,
  ApiProperty,
  ApiPropertyOptional,
} from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';

class UrlCheckResponse {
  @ApiProperty({ description: 'Whether the URL is reachable' })
  ok: boolean;

  @ApiProperty({
    description:
      'Status bucket: 200 (reachable), 400 (4xx), 500 (5xx), 0 (no response)',
  })
  status: number;

  @ApiPropertyOptional({ description: 'Error message if URL is not reachable' })
  error?: string;

  @ApiPropertyOptional({ description: 'Favicon URL (e.g. origin/favicon.ico)' })
  favicon?: string | null;
}

const WORKER_TIMEOUT_MS = 15_000;

@ApiTags('Utils')
@Controller('api/utils')
export class UrlCheckController {
  private readonly logger = new Logger(UrlCheckController.name);

  @Get('check-url')
  @Throttle({ default: { limit: 30, ttl: 60_000 } })
  @ApiOperation({
    summary: 'Check if a URL is reachable (forwarded to isolated worker)',
  })
  @ApiQuery({ name: 'url', required: true, description: 'URL to check' })
  @ApiQuery({
    name: 'type',
    required: false,
    description: 'Check type: "url" (default) or "repo"',
  })
  @ApiOkResponse({ description: 'URL check result', type: UrlCheckResponse })
  async checkUrl(
    @Query('url') url: string,
    @Query('type') type?: string,
  ): Promise<UrlCheckResponse> {
    if (!url) {
      throw new BadRequestException('url query parameter is required');
    }

    // Fast UX rejections — saves a worker round-trip on obvious bad input.
    let parsed: URL;
    try {
      parsed = new URL(url);
    } catch {
      return { ok: false, status: 0, error: 'Invalid URL format' };
    }
    if (!['http:', 'https:'].includes(parsed.protocol)) {
      return {
        ok: false,
        status: 0,
        error: 'Only HTTP and HTTPS URLs are allowed',
      };
    }

    const workerUrl = process.env.URL_CHECK_WORKER_URL;
    const workerSecret = process.env.URL_CHECK_WORKER_SECRET;
    if (!workerUrl || !workerSecret) {
      this.logger.error(
        'URL_CHECK_WORKER_URL and URL_CHECK_WORKER_SECRET must be set',
      );
      throw new InternalServerErrorException('URL check service unavailable');
    }

    try {
      const res = await fetch(workerUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${workerSecret}`,
        },
        body: JSON.stringify({ url, type: type ?? 'url' }),
        signal: AbortSignal.timeout(WORKER_TIMEOUT_MS),
      });

      if (!res.ok) {
        const detail = await res.text().catch(() => '<unreadable>');
        this.logger.error(
          `URL check worker returned ${res.status}: ${detail.slice(0, 200)}`,
        );
        return this.unreachable();
      }

      return (await res.json()) as UrlCheckResponse;
    } catch (err: any) {
      this.logger.error('URL check worker call failed', err?.stack ?? err);
      return this.unreachable();
    }
  }

  private unreachable(): UrlCheckResponse {
    return {
      ok: false,
      status: 0,
      error:
        "Hmm, something's not right. We couldn't reach your site — please make sure the URL is correct and reachable.",
    };
  }
}
