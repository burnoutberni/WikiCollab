import { isIPv4, isIPv6 } from 'node:net';

/** Normalizes IPv4-mapped IPv6 addresses so downstream comparisons stay consistent. */
function normalizeIp(ip: string): string {
  const v4mapped = ip.match(/^::ffff:(\d+\.\d+\.\d+\.\d+)$/i);
  if (v4mapped) return v4mapped[1];
  return ip;
}

function netmask(bits: number, isV6: boolean): number[] {
  const totalBytes = isV6 ? 16 : 4;
  const mask: number[] = [];
  for (let i = 0; i < totalBytes; i++) {
    const remaining = bits - i * 8;
    if (remaining >= 8) {
      mask.push(0xff);
    } else if (remaining > 0) {
      mask.push((0xff << (8 - remaining)) & 0xff);
    } else {
      mask.push(0);
    }
  }
  return mask;
}

function hexToBytes(ip: string): number[] {
  return ip.split(':').flatMap((seg) => {
    const n = Number.parseInt(seg, 16);
    return [(n >> 8) & 0xff, n & 0xff];
  });
}

function expandIPv6(ip: string): string {
  if (!ip.includes('::')) return ip;
  const parts = ip.split('::');
  const left = parts[0] ? parts[0].split(':') : [];
  const right = parts[1] ? parts[1].split(':') : [];
  const missing = 8 - left.length - right.length;
  return [...left, ...Array(missing).fill('0'), ...right].join(':');
}

function ipToBytes(ip: string): number[] {
  if (isIPv4(ip)) {
    return ip.split('.').map((s) => Number.parseInt(s, 10));
  }
  return hexToBytes(expandIPv6(ip));
}

/** Checks whether an IP address falls within a literal address or CIDR range. */
export function cidrMatch(ip: string, cidr: string): boolean {
  const normalizedIp = normalizeIp(ip);
  const [range, bitsStr] = cidr.split('/');
  if (!range || !bitsStr) return normalizedIp === cidr;

  const isV4 = isIPv4(range);
  const isV6 = isIPv6(range);
  if (!isV4 && !isV6) return false;
  if (isV4 && !isIPv4(normalizedIp)) return false;
  if (isV6 && !isIPv6(normalizedIp)) return false;

  const bits = Number.parseInt(bitsStr, 10);
  if (Number.isNaN(bits) || bits < 0) return false;
  if (isV4 && bits > 32) return false;
  if (isV6 && bits > 128) return false;

  const mask = netmask(bits, isV6);
  const ipB = ipToBytes(normalizedIp);
  const rangeB = ipToBytes(range);

  if (ipB.length !== rangeB.length) return false;

  return ipB.every((b, i) => (b & mask[i]) === (rangeB[i] & mask[i]));
}

/** Parses trusted proxy entries used to decide whether forwarding headers are honored. */
export function parseTrustedProxies(): string[] {
  const raw = process.env.TRUSTED_PROXIES;
  if (!raw) return [];
  return raw
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);
}

/** Matches a proxy IP against exact entries or CIDR ranges. */
export function isTrustedProxy(ip: string, trustedProxies: string[]): boolean {
  const normalizedIp = normalizeIp(ip);
  return trustedProxies.some((entry) => {
    if (entry.includes('/')) return cidrMatch(normalizedIp, entry);
    return normalizedIp === entry;
  });
}

/**
 * Resolves the originating client IP from socket and forwarding headers.
 * When trusted proxies are configured, the rightmost untrusted forwarded hop wins.
 */
export function getClientIp(
  xForwardedFor: string | undefined,
  xRealIp: string | undefined,
  connectionIp: string | undefined
): string {
  const trustedProxies = parseTrustedProxies();

  if (trustedProxies.length === 0) {
    if (connectionIp) return connectionIp;
    return xRealIp || xForwardedFor?.split(',')[0]?.trim() || 'unknown';
  }

  if (!connectionIp) return 'unknown';

  if (isTrustedProxy(connectionIp, trustedProxies)) {
    const ips = xForwardedFor
      ?.split(',')
      .map((s) => s.trim())
      .filter(Boolean);
    if (ips && ips.length > 0) {
      for (let i = ips.length - 1; i >= 0; i--) {
        if (!isTrustedProxy(ips[i], trustedProxies)) {
          return ips[i];
        }
      }
    }
    if (xRealIp) return xRealIp;
  }

  return connectionIp;
}
