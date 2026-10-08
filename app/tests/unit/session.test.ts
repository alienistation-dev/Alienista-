import { describe, it, expect } from 'vitest';
import { signSession, verifySession } from '@/lib/session';
import { isSecureOrigin } from '@/lib/env';
import { SessionUser } from '@/lib/types/actions';

describe('HMAC Session Token Management', () => {
  const now = 1_800_000_000_000;
  const mockUser: SessionUser = {
    id: 'usr_test_123',
    subject_id: 'usr_test_123',
    subject_type: 'officer',
    organization_id: 'org_acs_psu',
    role: 'officer',
    name: 'Juan Dela Cruz',
    issued_at: now,
    expires_at: now + 60_000,
  };

  it('should sign and verify valid session payload correctly', async () => {
    const token = await signSession(mockUser);
    expect(token).toBeDefined();
    expect(typeof token).toBe('string');
    expect(token.includes('.')).toBe(true);

    const verified = await verifySession(token, now + 1_000);
    expect(verified).not.toBeNull();
    expect(verified?.id).toBe(mockUser.id);
    expect(verified?.organization_id).toBe(mockUser.organization_id);
    expect(verified?.role).toBe('officer');
    expect(verified?.name).toBe('Juan Dela Cruz');
  });

  it('should reject tampered session payload', async () => {
    const token = await signSession(mockUser);
    const [b64Data, b64Sig] = token.split('.');

    // Tamper with data payload by decoding and changing role to admin
    const raw = Buffer.from(b64Data, 'base64url').toString('utf-8');
    const tamperedObj = JSON.parse(raw);
    tamperedObj.role = 'admin';
    const tamperedB64 = Buffer.from(JSON.stringify(tamperedObj)).toString('base64url');
    const tamperedToken = `${tamperedB64}.${b64Sig}`;

    const result = await verifySession(tamperedToken, now + 1_000);
    expect(result).toBeNull();
  });

  it('rejects a correctly signed session after its expiry time', async () => {
    const token = await signSession(mockUser);

    expect(await verifySession(token, mockUser.expires_at + 1)).toBeNull();
  });

  it('should reject invalid or malformed tokens', async () => {
    expect(await verifySession('')).toBeNull();
    expect(await verifySession('invalid-token-without-dot')).toBeNull();
    expect(await verifySession('abc.def.extra')).toBeNull();
  });

  it('should detect secure origins such as ngrok HTTPS URLs', () => {
    expect(isSecureOrigin('https://abc123.ngrok-free.app')).toBe(true);
    expect(isSecureOrigin('https://example.com')).toBe(true);
    expect(isSecureOrigin('http://localhost:3000')).toBe(false);
  });
});
