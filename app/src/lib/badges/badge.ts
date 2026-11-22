import type { BadgeData, BadgeStudent } from '@/lib/types/models';

export const BADGE_SPEC = {
  width: 400,
  height: 640,
  qr_size: 280,
  colors: {
    // ACS logo palette; matches the tokens in globals.css.
    brand: '#1A3822',
    brandSecondary: '#383830',
    accent: '#FFFFFF',
    surface: '#FFFFFF',
    mutedSurface: '#F0F0EC',
    border: '#E0E2DC',
    text: '#080808',
    mutedText: '#383830',
    qr_dark: '#080808',
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
