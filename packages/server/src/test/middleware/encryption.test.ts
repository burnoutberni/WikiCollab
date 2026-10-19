import { afterEach, describe, expect, it, vi } from 'vitest';

import { decryptSecret, encryptSecret } from '../../middleware/encryption.js';

describe('secret encryption', () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it('round-trips AES-256-GCM encrypted values without storing plaintext', () => {
    vi.stubEnv('ENCRYPTION_KEY', Buffer.alloc(32, 11).toString('base64'));

    const encrypted = encryptSecret('very-secret-value');

    expect(encrypted).not.toContain('very-secret-value');
    expect(encrypted.split(':')).toHaveLength(3);
    expect(decryptSecret(encrypted)).toBe('very-secret-value');
  });

  it('rejects invalid key lengths', () => {
    vi.stubEnv('ENCRYPTION_KEY', Buffer.alloc(16).toString('base64'));
    expect(() => encryptSecret('secret')).toThrow(/32 bytes/);
  });
});
