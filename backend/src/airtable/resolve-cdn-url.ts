/**
 * Resolve a Hack Club CDN URL to its final, properly-encoded form before
 * handing it to Airtable as a Screenshot attachment.
 *
 * cdn.hackclub.com 302s every upload to user-cdn.hackclub-assets.com with a
 * Location header that contains *unencoded* spaces, apostrophes, and (for
 * filenames with non-ASCII) raw Latin-1 bytes. That's a malformed URI per
 * RFC 3986. Airtable's async attachment downloader can't follow it, so a
 * naive PATCH/POST succeeds but the attachment vanishes a few seconds later.
 *
 * This is a backend port of `airtable/lib/resolve-url.ts` so future writes
 * are pre-resolved and we don't accrete more rows for the cleanup script
 * (`airtable/scripts/fix-screenshots.ts`) to fix up.
 */

export interface ResolveResult {
  ok: boolean;
  url: string;
  status: number;
  contentType?: string;
  reason?: string;
}

const MAX_HOPS = 5;
const UA =
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36';
const REQ_HEADERS = { 'User-Agent': UA, Accept: 'image/*,*/*;q=0.8' };

/**
 * Percent-encode a `Location` header value treating each character as a raw
 * byte (Latin-1). HTTP/1.1 header values are ISO-8859-1, so the cdn.hackclub
 * 302's path comes through as one-char-per-byte. `new URL(...).toString()`
 * would re-encode those chars as their own UTF-8 sequences and miss the
 * underlying object on the bucket — we need to emit the original bytes back
 * out unchanged.
 */
function encodeLocationBytes(loc: string): string {
  const m = loc.match(/^([a-z][a-z0-9+.-]*:\/\/[^/]+)(.*)$/i);
  const origin = m ? m[1] : '';
  const rest = m ? m[2] : loc;

  let out = '';
  for (let i = 0; i < rest.length; i++) {
    const code = rest.charCodeAt(i);
    const ch = rest[i];
    if (
      (code >= 0x30 && code <= 0x39) ||
      (code >= 0x41 && code <= 0x5a) ||
      (code >= 0x61 && code <= 0x7a) ||
      ch === '-' ||
      ch === '.' ||
      ch === '_' ||
      ch === '~' ||
      ch === '/' ||
      ch === ':' ||
      ch === '@' ||
      ch === '!' ||
      ch === '$' ||
      ch === '&' ||
      ch === "'" ||
      ch === '(' ||
      ch === ')' ||
      ch === '*' ||
      ch === '+' ||
      ch === ',' ||
      ch === ';' ||
      ch === '=' ||
      ch === '?' ||
      ch === '#' ||
      ch === '%'
    ) {
      out += ch;
    } else if (code <= 0xff) {
      out += '%' + code.toString(16).padStart(2, '0').toUpperCase();
    } else {
      const bytes = new TextEncoder().encode(ch);
      for (const b of bytes) {
        out += '%' + b.toString(16).padStart(2, '0').toUpperCase();
      }
    }
  }
  return origin + out;
}

export async function resolveCdnUrl(input: string): Promise<ResolveResult> {
  let url = input;
  let lastStatus = 0;
  let lastContentType: string | undefined;

  for (let hop = 0; hop < MAX_HOPS; hop++) {
    let res: Response;
    try {
      res = await fetch(url, {
        method: 'HEAD',
        redirect: 'manual',
        headers: REQ_HEADERS,
      });
      if (res.status === 405 || res.status === 404) {
        try {
          await res.body?.cancel();
        } catch {
          /* noop */
        }
        res = await fetch(url, {
          method: 'GET',
          redirect: 'manual',
          headers: REQ_HEADERS,
        });
        try {
          await res.body?.cancel();
        } catch {
          /* noop */
        }
      }
    } catch (err) {
      return {
        ok: false,
        url,
        status: 0,
        reason: `fetch threw: ${(err as Error).message}`,
      };
    }

    lastStatus = res.status;
    lastContentType = res.headers.get('content-type') ?? undefined;

    if (res.status >= 300 && res.status < 400) {
      const loc = res.headers.get('location');
      if (!loc) {
        return {
          ok: false,
          url,
          status: res.status,
          contentType: lastContentType,
          reason: 'redirect missing Location',
        };
      }
      let resolved: string;
      if (/^[a-z][a-z0-9+.-]*:\/\//i.test(loc)) {
        resolved = encodeLocationBytes(loc);
      } else {
        try {
          resolved = encodeLocationBytes(new URL(loc, url).toString());
        } catch (err) {
          return {
            ok: false,
            url,
            status: res.status,
            contentType: lastContentType,
            reason: `bad Location header: ${(err as Error).message}`,
          };
        }
      }
      url = resolved;
      continue;
    }

    if (res.ok) {
      if (lastContentType && !lastContentType.startsWith('image/')) {
        return {
          ok: false,
          url,
          status: res.status,
          contentType: lastContentType,
          reason: `non-image content-type: ${lastContentType}`,
        };
      }
      return {
        ok: true,
        url,
        status: res.status,
        contentType: lastContentType,
      };
    }

    return {
      ok: false,
      url,
      status: res.status,
      contentType: lastContentType,
      reason: `non-ok status ${res.status}`,
    };
  }

  return {
    ok: false,
    url,
    status: lastStatus,
    contentType: lastContentType,
    reason: `too many redirects (>${MAX_HOPS})`,
  };
}

/**
 * Best-effort resolve for an Airtable Screenshot attachment URL. Falls back
 * to the raw input on failure (so approval flows are never blocked) but logs
 * a warning — those rows will need the `fix-screenshots.ts` cleanup pass.
 */
export async function resolveAttachmentUrl(input: string): Promise<string> {
  if (!input) return input;
  try {
    const r = await resolveCdnUrl(input);
    if (r.ok) return r.url;
    console.warn(
      `[airtable] CDN resolve failed for ${input} (status=${r.status}, reason=${r.reason ?? 'unknown'}) — sending raw URL to Airtable; attachment may be silently dropped`,
    );
    return input;
  } catch (err) {
    console.warn(
      `[airtable] CDN resolve threw for ${input}: ${(err as Error).message} — sending raw URL`,
    );
    return input;
  }
}
