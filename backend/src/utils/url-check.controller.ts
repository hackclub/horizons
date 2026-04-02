import { Controller, Get, Query, BadRequestException } from '@nestjs/common';
import {
  ApiTags,
  ApiOperation,
  ApiQuery,
  ApiOkResponse,
  ApiProperty,
  ApiPropertyOptional,
} from '@nestjs/swagger';
import { Public } from '../auth/public.decorator';
import { resolveAndCheckPrivate } from './is-private-url';

class UrlCheckResponse {
  @ApiProperty({ description: 'Whether the URL is reachable' })
  ok: boolean;

  @ApiProperty({ description: 'HTTP status code (0 if request failed)' })
  status: number;

  @ApiPropertyOptional({ description: 'Error message if URL is not reachable' })
  error?: string;

  @ApiPropertyOptional({ description: 'Favicon URL extracted from the page' })
  favicon?: string | null;
}

@ApiTags('Utils')
@Controller('api/utils')
@Public()
export class UrlCheckController {
  @Get('check-url')
  @ApiOperation({ summary: 'Check if a URL is reachable' })
  @ApiQuery({ name: 'url', required: true, description: 'URL to check' })
  @ApiQuery({
    name: 'type',
    required: false,
    description:
      'Check type: "url" (default) or "repo" (verify git repository)',
  })
  @ApiOkResponse({ description: 'URL check result', type: UrlCheckResponse })
  async checkUrl(
    @Query('url') url: string,
    @Query('type') type?: string,
  ): Promise<UrlCheckResponse> {
    if (!url) {
      throw new BadRequestException('url query parameter is required');
    }

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

    if (await resolveAndCheckPrivate(parsed)) {
      return {
        ok: false,
        status: 0,
        error: 'URLs pointing to private/internal addresses are not allowed',
      };
    }

    // For repo checks on non-GitHub URLs, verify it's actually a git repository
    const isGitHub =
      parsed.hostname === 'github.com' || parsed.hostname === 'www.github.com';
    if (type === 'repo' && !isGitHub) {
      return this.checkGitRepo(url);
    }

    try {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 8000);

      // Always use GET so we can read the HTML for favicon extraction
      const response = await fetch(url, {
        method: 'GET',
        signal: controller.signal,
        redirect: 'follow',
        headers: {
          'User-Agent': 'Mozilla/5.0 (compatible; HorizonBot/1.0)',
          Accept: 'text/html,*/*',
        },
      });

      clearTimeout(timeout);

      if (!response.ok) {
        return {
          ok: false,
          status: response.status,
          error: `Hmm, something's not right. Your site returned a status code of ${response.status}, please resolve the error and make sure it's reachable.`,
        };
      }

      // Try to extract favicon from the HTML
      const favicon = await this.extractFavicon(response, parsed);

      return { ok: true, status: response.status, favicon };
    } catch (err: any) {
      return { ok: false, status: 0, error: this.friendlyFetchError(err) };
    }
  }

  private async checkGitRepo(url: string): Promise<UrlCheckResponse> {
    // First check basic reachability
    try {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 8000);

      const response = await fetch(url, {
        method: 'GET',
        signal: controller.signal,
        redirect: 'follow',
        headers: { 'User-Agent': 'Mozilla/5.0 (compatible; HorizonBot/1.0)' },
      });

      clearTimeout(timeout);

      if (!response.ok) {
        return {
          ok: false,
          status: response.status,
          error: `Hmm, something's not right. Your repository returned a status code of ${response.status}, please make sure it's publicly accessible.`,
        };
      }
    } catch (err: any) {
      return { ok: false, status: 0, error: this.friendlyFetchError(err) };
    }

    // Probe the git smart HTTP info/refs endpoint to verify it's a git repo
    const base = url.replace(/\/+$/, '');
    const infoRefsUrl = `${base}/info/refs?service=git-upload-pack`;

    try {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 8000);

      const response = await fetch(infoRefsUrl, {
        method: 'GET',
        signal: controller.signal,
        redirect: 'follow',
        headers: { 'User-Agent': 'git/2.0' },
      });

      clearTimeout(timeout);

      if (response.ok) {
        return { ok: true, status: response.status };
      }

      // info/refs failed — not a git repo
      return {
        ok: false,
        status: 0,
        error:
          "This URL doesn't appear to be a git repository. Please provide a link to a git repo (GitHub, GitLab, etc.).",
      };
    } catch {
      // info/refs not reachable — not a git repo
      return {
        ok: false,
        status: 0,
        error:
          "This URL doesn't appear to be a git repository. Please provide a link to a git repo (GitHub, GitLab, etc.).",
      };
    }
  }

  private friendlyFetchError(err: any): string {
    if (err.name === 'AbortError') {
      return "Hmm, something's not right. Your site took too long to respond — please make sure it's reachable.";
    } else if (err.cause?.code === 'ENOTFOUND') {
      return "Hmm, something's not right. The domain couldn't be found — please double-check the URL.";
    } else if (err.cause?.code === 'ECONNREFUSED') {
      return "Hmm, something's not right. The connection was refused — please make sure your site is running.";
    }
    return "Hmm, something's not right. We couldn't reach your site — please make sure the URL is correct and reachable.";
  }

  private async extractFavicon(
    response: Response,
    parsed: URL,
  ): Promise<string | null> {
    const contentType = response.headers.get('content-type') || '';
    if (!contentType.includes('text/html')) {
      return `${parsed.origin}/favicon.ico`;
    }

    try {
      const html = await response.text();

      // Look for <link rel="icon" ...> or <link rel="shortcut icon" ...>
      const linkRegex =
        /<link\s[^>]*rel\s*=\s*["'](?:shortcut\s+)?icon["'][^>]*>/gi;
      const matches = html.matchAll(linkRegex);

      for (const match of matches) {
        const hrefMatch = match[0].match(/href\s*=\s*["']([^"']+)["']/i);
        if (hrefMatch?.[1]) {
          const href = hrefMatch[1];
          // Resolve relative URLs
          try {
            return new URL(href, parsed.origin).href;
          } catch {
            continue;
          }
        }
      }

      // Also check for <link rel="apple-touch-icon" ...> as fallback
      const appleRegex =
        /<link\s[^>]*rel\s*=\s*["']apple-touch-icon["'][^>]*>/gi;
      const appleMatches = html.matchAll(appleRegex);

      for (const match of appleMatches) {
        const hrefMatch = match[0].match(/href\s*=\s*["']([^"']+)["']/i);
        if (hrefMatch?.[1]) {
          try {
            return new URL(hrefMatch[1], parsed.origin).href;
          } catch {
            continue;
          }
        }
      }
    } catch {
      // Failed to read body, fall through
    }

    // Default fallback
    return `${parsed.origin}/favicon.ico`;
  }
}
