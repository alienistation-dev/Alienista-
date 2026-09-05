import { describe, it, expect } from 'vitest';
import crypto from 'node:crypto';
import { createGoogleWalletJwtPayload, signGoogleWalletJwt } from '@/lib/badges/google-wallet';
import type { Student } from '@/lib/types/models';

describe('Google Wallet Pass Generation', () => {
  const mockStudent: Student = {
    id: '123e4567-e89b-12d3-a456-426614174000',
    organization_id: 'org-1',
    uid: '2024-0042',
    student_number: '2024-00042',
    full_name: 'Nestor Jann Asag',
    course: 'BSIT',
    year: '3rd Year',
    section: 'Block A',
    status: 'Active',
    is_first_login: false,
    avatar_url: 'https://example.com/avatar.png',
    created_at: '2026-01-01T00:00:00Z',
    updated_at: '2026-01-01T00:00:00Z',
  };

  const mockConfig = {
    issuerId: '3388000000012345678',
    classId: 'student_badge_dev',
    clientEmail: 'wallet-dev@test.iam.gserviceaccount.com',
    appUrl: 'https://alienista.edu',
  };

  it('creates deterministic generic object id and embeds student.uid in QR barcode', () => {
    const payload = createGoogleWalletJwtPayload(mockStudent, mockConfig);

    expect(payload.iss).toBe(mockConfig.clientEmail);
    expect(payload.typ).toBe('savetowallet');

    const genericObject = payload.payload.genericObjects[0];
    expect(genericObject.id).toBe(`${mockConfig.issuerId}.${mockStudent.id}`);
    expect(genericObject.classId).toBe(`${mockConfig.issuerId}.${mockConfig.classId}`);
    expect(genericObject.barcode).toEqual({
      type: 'QR_CODE',
      value: '2024-0042',
      alternateText: '2024-0042',
    });
    expect(genericObject.header.defaultValue.value).toBe('Nestor Jann Asag');
  });

  it('signs valid RS256 JWT using node:crypto without external libraries', () => {
    const { privateKey, publicKey } = crypto.generateKeyPairSync('rsa', {
      modulusLength: 2048,
    });
    const privateKeyPem = privateKey.export({ type: 'pkcs8', format: 'pem' }) as string;
    const publicKeyPem = publicKey.export({ type: 'spki', format: 'pem' }) as string;

    const payload = createGoogleWalletJwtPayload(mockStudent, mockConfig);
    const token = signGoogleWalletJwt(payload, privateKeyPem);

    const parts = token.split('.');
    expect(parts).toHaveLength(3);

    // Verify signature with public key
    const verifier = crypto.createVerify('RSA-SHA256');
    verifier.update(`${parts[0]}.${parts[1]}`);
    const signature = Buffer.from(parts[2].replace(/-/g, '+').replace(/_/g, '/'), 'base64');
    expect(verifier.verify(publicKeyPem, signature)).toBe(true);
  });
});
