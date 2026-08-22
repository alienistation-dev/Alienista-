import type { BadgeData, BadgeStudent } from '@/lib/types/models';

export const BADGE_SPEC = {
  width: 400,
  height: 640,
  qr_size: 280,
  colors: {
    brand: '#1B4332',
    brandSecondary: '#2D6A4F',
    accent: '#D4AF37',
    surface: '#FFFFFF',
    mutedSurface: '#F8FAF9',
    border: '#E5EBE5',
    text: '#111827',
    mutedText: '#6B7280',
    qr_dark: '#111827',
    qr_light: '#FFFFFF',
  },
} as const;

export function buildBadgeData(student: BadgeStudent): BadgeData {
  const section = student.section || '1';
  return {
    qr_payload: student.uid,
    uid: student.uid,
    student_number: student.student_number,
    full_name: student.full_name,
    course: student.course,
    year: student.year,
    block_label: section.startsWith('Block') ? section : `Block ${section}`,
    status: student.status,
    avatar_url: student.avatar_url,
  };
}

export function serializeBadgePayload(badge: BadgeData): string {
  return badge.qr_payload;
}

export function buildBadgeFilename(badge: BadgeData): string {
  return `${badge.uid}_${badge.full_name.replace(/[^a-z0-9]+/gi, '_').replace(/^_+|_+$/g, '')}_badge.png`;
}
