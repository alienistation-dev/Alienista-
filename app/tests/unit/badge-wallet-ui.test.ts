import { describe, it, expect } from 'vitest';
import React from 'react';
import { renderToString } from 'react-dom/server';
import { BadgeCard } from '@/components/badges/badge-card';
import type { BadgeStudent } from '@/lib/types/models';

describe('BadgeCard UI', () => {
  const student: BadgeStudent = {
    id: 's-1',
    uid: '2024-001',
    student_number: '2024-00001',
    full_name: 'Test Student',
    course: 'BSIT',
    year: '1st Year',
    section: '1',
    status: 'Active',
    avatar_url: null,
  };

  it('renders Google Wallet button when walletSaveUrl is passed', () => {
    const element = React.createElement(BadgeCard, {
      student,
      walletSaveUrl: 'https://pay.google.com/gp/v/save/test-jwt',
    });
    const html = renderToString(element);
    expect(html).toContain('Save to Google Wallet');
    expect(html).toContain('href="https://pay.google.com/gp/v/save/test-jwt"');
  });

  it('does not render Google Wallet button when walletSaveUrl is null or omitted', () => {
    const element = React.createElement(BadgeCard, {
      student,
      walletSaveUrl: null,
    });
    const html = renderToString(element);
    expect(html).not.toContain('Save to Google Wallet');
  });
});
