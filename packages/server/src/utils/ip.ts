import { isIPv4, isIPv6 } from 'node:net';

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

export function cidrMatch(ip: string, cidr: string): boolean {
  const [range, bitsStr] = cidr.split('/');
  if (!range || !bitsStr) return ip === cidr;

  const isV4 = isIPv4(range);
  const isV6 = isIPv6(range);
  if (!isV4 && !isV6) return false;
  if (isV4 && !isIPv4(ip)) return false;
  if (isV6 && !isIPv6(ip)) return false;

  const bits = Number.parseInt(bitsStr, 10);
  if (Number.isNaN(bits) || bits < 0) return false;
  if (isV4 && bits > 32) return false;
  if (isV6 && bits > 128) return false;

  const mask = netmask(bits, isV6);
  const ipB = ipToBytes(ip);
  const rangeB = ipToBytes(range);

  if (ipB.length !== rangeB.length) return false;

  return ipB.every((b, i) => (b & mask[i]) === (rangeB[i] & mask[i]));
}

export function parseTrustedProxies(): string[] {
  const raw = process.env.TRUSTED_PROXIES;
  if (!raw) return [];
  return raw
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);
}

export function isTrustedProxy(ip: string, trustedProxies: string[]): boolean {
  return trustedProxies.some((entry) => {
    if (entry.includes('/')) return cidrMatch(ip, entry);
    return ip === entry;
  });
}

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
      return ips[ips.length - 1];
    }
    if (xRealIp) return xRealIp;
  }

  return connectionIp;
}
