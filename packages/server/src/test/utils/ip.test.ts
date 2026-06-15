import { afterEach, describe, expect, it } from 'vitest';

import { cidrMatch, getClientIp, isTrustedProxy, parseTrustedProxies } from '../../utils/ip.js';

describe('cidrMatch', () => {
  it('matches exact IP', () => {
    expect(cidrMatch('10.0.0.1', '10.0.0.1')).toBe(true);
  });

  it('rejects different IP', () => {
    expect(cidrMatch('10.0.0.2', '10.0.0.1')).toBe(false);
  });

  it('matches IP within /24 range', () => {
    expect(cidrMatch('10.0.0.50', '10.0.0.0/24')).toBe(true);
  });

  it('rejects IP outside /24 range', () => {
    expect(cidrMatch('10.0.1.1', '10.0.0.0/24')).toBe(false);
  });

  it('matches IP within /16 range', () => {
    expect(cidrMatch('172.16.5.5', '172.16.0.0/16')).toBe(true);
  });

  it('rejects IP outside /16 range', () => {
    expect(cidrMatch('172.17.0.1', '172.16.0.0/16')).toBe(false);
  });

  it('handles /32 exact match', () => {
    expect(cidrMatch('192.168.1.1', '192.168.1.1/32')).toBe(true);
  });

  it('matches IPv6 within range', () => {
    expect(cidrMatch('2001:db8::1', '2001:db8::/32')).toBe(true);
  });

  it('matches IPv4-mapped IPv6 against IPv4 CIDR', () => {
    expect(cidrMatch('::ffff:10.0.0.50', '10.0.0.0/24')).toBe(true);
  });

  it('rejects IPv4-mapped IPv6 outside IPv4 CIDR', () => {
    expect(cidrMatch('::ffff:10.0.1.1', '10.0.0.0/24')).toBe(false);
  });
});

describe('parseTrustedProxies', () => {
  afterEach(() => {
    delete process.env.TRUSTED_PROXIES;
  });

  it('returns empty array when env not set', () => {
    delete process.env.TRUSTED_PROXIES;
    expect(parseTrustedProxies()).toEqual([]);
  });

  it('parses comma-separated IPs', () => {
    process.env.TRUSTED_PROXIES = '10.0.0.1, 10.0.0.2';
    expect(parseTrustedProxies()).toEqual(['10.0.0.1', '10.0.0.2']);
  });

  it('parses CIDR ranges', () => {
    process.env.TRUSTED_PROXIES = '10.0.0.0/8,172.16.0.0/12';
    expect(parseTrustedProxies()).toEqual(['10.0.0.0/8', '172.16.0.0/12']);
  });

  it('filters empty entries', () => {
    process.env.TRUSTED_PROXIES = '10.0.0.1,,,10.0.0.2';
    expect(parseTrustedProxies()).toEqual(['10.0.0.1', '10.0.0.2']);
  });
});

describe('isTrustedProxy', () => {
  it('matches exact IP', () => {
    expect(isTrustedProxy('10.0.0.1', ['10.0.0.1'])).toBe(true);
  });

  it('matches IPv4-mapped IPv6 against exact IPv4', () => {
    expect(isTrustedProxy('::ffff:10.0.0.1', ['10.0.0.1'])).toBe(true);
  });

  it('matches CIDR range', () => {
    expect(isTrustedProxy('10.0.5.5', ['10.0.0.0/8'])).toBe(true);
  });

  it('rejects non-matching IP', () => {
    expect(isTrustedProxy('1.2.3.4', ['10.0.0.0/8'])).toBe(false);
  });

  it('matches IPv4-mapped IPv6 against IPv4 CIDR', () => {
    expect(isTrustedProxy('::ffff:10.0.5.5', ['10.0.0.0/8'])).toBe(true);
  });
});

describe('getClientIp', () => {
  afterEach(() => {
    delete process.env.TRUSTED_PROXIES;
  });

  describe('no trusted proxies configured', () => {
    it('uses x-forwarded-for when available', () => {
      delete process.env.TRUSTED_PROXIES;
      expect(getClientIp('1.2.3.4', undefined, undefined)).toBe('1.2.3.4');
    });

    it('uses x-real-ip when x-forwarded-for not set', () => {
      delete process.env.TRUSTED_PROXIES;
      expect(getClientIp(undefined, '5.6.7.8', undefined)).toBe('5.6.7.8');
    });

    it('uses connection ip when no headers', () => {
      delete process.env.TRUSTED_PROXIES;
      expect(getClientIp(undefined, undefined, '192.168.1.1')).toBe('192.168.1.1');
    });

    it('returns unknown when no IP available', () => {
      delete process.env.TRUSTED_PROXIES;
      expect(getClientIp(undefined, undefined, undefined)).toBe('unknown');
    });
  });

  describe('trusted proxies configured', () => {
    it('uses forwarded IP from trusted proxy', () => {
      process.env.TRUSTED_PROXIES = '10.0.0.0/8';
      expect(getClientIp('1.2.3.4', undefined, '10.0.0.1')).toBe('1.2.3.4');
    });

    it('uses leftmost IP from X-Forwarded-For', () => {
      process.env.TRUSTED_PROXIES = '10.0.0.0/8';
      expect(getClientIp('1.2.3.4, 10.0.0.5', undefined, '10.0.0.1')).toBe('1.2.3.4');
    });

    it('uses x-real-ip as fallback when no x-forwarded-for', () => {
      process.env.TRUSTED_PROXIES = '10.0.0.0/8';
      expect(getClientIp(undefined, '5.6.7.8', '10.0.0.1')).toBe('5.6.7.8');
    });

    it('ignores forwarded headers from non-trusted IP', () => {
      process.env.TRUSTED_PROXIES = '10.0.0.0/8';
      expect(getClientIp('1.2.3.4', undefined, '203.0.113.5')).toBe('203.0.113.5');
    });

    it('returns unknown when no connection IP', () => {
      process.env.TRUSTED_PROXIES = '10.0.0.0/8';
      expect(getClientIp('1.2.3.4', undefined, undefined)).toBe('unknown');
    });

    it('returns connection IP when trusted but no forwarded headers', () => {
      process.env.TRUSTED_PROXIES = '10.0.0.0/8';
      expect(getClientIp(undefined, undefined, '10.0.0.1')).toBe('10.0.0.1');
    });
  });
});
