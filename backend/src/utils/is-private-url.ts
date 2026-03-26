import { lookup } from 'node:dns/promises';
import { isIP } from 'node:net';

const PRIVATE_HOSTNAME_PATTERNS = [
  'localhost',
  '127.0.0.1',
  '[::1]',
  '0.0.0.0',
  'metadata.google.internal',
];

/**
 * Returns true if the hostname resolves to a private/internal IP range.
 * Checks both the raw hostname and DNS resolution.
 */
export function isPrivateUrl(parsed: URL): boolean {
  const hostname = parsed.hostname.toLowerCase();

  if (PRIVATE_HOSTNAME_PATTERNS.includes(hostname)) {
    return true;
  }

  // Check if the hostname is an IP literal in a private range
  if (isIP(hostname)) {
    return isPrivateIP(hostname);
  }

  return false;
}

/**
 * Async check that also resolves DNS to catch hostnames pointing to private IPs
 * (e.g. attacker.com -> 127.0.0.1). Call this before making the actual fetch.
 */
export async function resolveAndCheckPrivate(parsed: URL): Promise<boolean> {
  if (isPrivateUrl(parsed)) return true;

  const hostname = parsed.hostname;
  if (isIP(hostname)) return false; // already checked above

  try {
    const { address } = await lookup(hostname);
    return isPrivateIP(address);
  } catch {
    // DNS resolution failed — let the fetch itself handle the error
    return false;
  }
}

function isPrivateIP(ip: string): boolean {
  const parts = ip.split('.').map(Number);

  if (parts.length === 4) {
    // 10.0.0.0/8
    if (parts[0] === 10) return true;
    // 172.16.0.0/12
    if (parts[0] === 172 && parts[1] >= 16 && parts[1] <= 31) return true;
    // 192.168.0.0/16
    if (parts[0] === 192 && parts[1] === 168) return true;
    // 127.0.0.0/8
    if (parts[0] === 127) return true;
    // 169.254.0.0/16 (link-local / cloud metadata)
    if (parts[0] === 169 && parts[1] === 254) return true;
    // 0.0.0.0
    if (parts.every((p) => p === 0)) return true;
  }

  // IPv6 loopback
  if (ip === '::1' || ip === '::') return true;

  return false;
}
