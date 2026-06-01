/**
 * Resolve a Hack Club CDN URL to its final, properly-encoded form.
 *
 * cdn.hackclub.com responds to image GETs with a 302 redirect whose
 * `Location` header contains *unencoded* spaces, apostrophes, and (for
 * uploads with unicode in the filename) raw mojibake bytes. That's a
 * malformed URI per RFC 3986. Most HTTP clients — including Airtable's
 * async attachment downloader and curl — fail to follow it, so the
 * attachment we PATCH gets silently cleared a few seconds later.
 *
 * This helper walks the redirect chain by hand: read the Location header
 * as raw text, normalize it through `new URL(...)` (which percent-encodes
 * path characters), and return the encoded final URL — so we can hand
 * Airtable something it can actually fetch.
 */

export interface ResolveResult {
  ok: boolean;
  /** Final, properly-encoded URL. Only meaningful when ok=true. */
  url: string;
  /** Status of the last response we saw. */
  status: number;
  /** Content-Type of the last response, when available. */
  contentType?: string;
  /** Reason we gave up — populated when ok=false. */
  reason?: string;
}

const MAX_HOPS = 5;

const UA =
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36';
const REQ_HEADERS = { 'User-Agent': UA, Accept: 'image/*,*/*;q=0.8' };

/**
 * Percent-encode a `Location` header value treating each character as a
 * raw byte (Latin-1). This is what most HTTP clients actually want here.
 *
 * Why this instead of `new URL(loc).toString()`: per HTTP/1.1, header
 * values are ISO-8859-1 byte sequences, so fetch exposes the Location
 * bytes one-char-per-byte. The cdn.hackclub.com 302 to user-cdn includes
 * the raw filename bytes — for `Capture d'\xC3\x83\xC2\xA9cran ...`, fetch
 * gives us a 4-char string (Ã, U+0083, Â, ©). `new URL(...).toString()`
 * would then re-encode each of those chars as its own UTF-8 byte sequence
 * (`%C3%83%C2%83%C3%82%C2%A9`), which doesn't exist on the bucket. We
 * need to emit the original bytes back out unchanged (`%C3%83%C2%A9`).
 */
function encodeLocationBytes(loc: string): string {
  // Split scheme://host from the rest (path/query/fragment).
  const m = loc.match(/^([a-z][a-z0-9+.-]*:\/\/[^/]+)(.*)$/i);
  const origin = m ? m[1] : '';
  const rest = m ? m[2] : loc;

  let out = '';
  for (let i = 0; i < rest.length; i++) {
    const code = rest.charCodeAt(i);
    const ch = rest[i];
    // RFC 3986 unreserved + sub-delims + path/query/fragment delimiters.
    // Also keep `%` so any pre-existing percent-encodings pass through.
    if (
      (code >= 0x30 && code <= 0x39) || // 0-9
      (code >= 0x41 && code <= 0x5a) || // A-Z
      (code >= 0x61 && code <= 0x7a) || // a-z
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
      // Multi-byte char in header (shouldn't happen for HTTP/1.1 Latin-1
      // values, but fall back to UTF-8 if we ever see one).
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
      // Some origins 404/405 HEAD even when GET works (Cloudflare cache
      // quirks, S3-style buckets). Retry as a body-less GET.
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
      // Byte-encode the Location header value (see encodeLocationBytes
      // for why we can't use new URL().toString() here). Relative
      // Locations get resolved against the current URL first.
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
