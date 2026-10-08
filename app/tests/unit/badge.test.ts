import { describe, expect, it } from 'vitest';
import { BADGE_SPEC, buildBadgeData, buildBadgeFilename, serializeBadgePayload } from '@/lib/badges/badge';

const student = {
  id: 'student-1',
  organization_id: 'org-1',
  uid: 'ST-2026-0001',
  student_number: '2026-12345',
  full_name: 'Ada Lovelace',
  course: 'BS Computer Science',
  year: '4th Year' as const,
  section: '1',
  status: 'Active' as const,
  is_first_login: false,
  avatar_url: null,
  created_at: '2026-08-22T00:00:00.000Z',
  updated_at: '2026-08-22T00:00:00.000Z',
};

describe('canonical badge data', () => {
  it('uses one stable QR payload and normalized identity model', () => {
    const badge = buildBadgeData(student);

    expect(badge).toMatchObject({
      qr_payload: 'ST-2026-0001',
      uid: 'ST-2026-0001',
      student_number: '2026-12345',
      full_name: 'Ada Lovelace',
      block_label: 'Block 1',
    });
    expect(serializeBadgePayload(badge)).toBe(badge.qr_payload);
  });

  it('defines stable dimensions, brand colors, and export naming for every output', () => {
    expect(BADGE_SPEC).toMatchObject({
      width: 400,
      height: 640,
      qr_size: 280,
      colors: { brand: '#1B4332', accent: '#D4AF37', qr_dark: '#111827' },
    });
    expect(buildBadgeFilename(buildBadgeData(student))).toBe('ST-2026-0001_Ada_Lovelace_badge.png');
  });
});
