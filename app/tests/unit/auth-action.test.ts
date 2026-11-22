import bcrypt from 'bcryptjs';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  setSessionCookie: vi.fn(),
  clearLoginFailures: vi.fn(),
  recordLoginFailure: vi.fn(),
  isLoginRateLimited: vi.fn().mockResolvedValue(false),
}));

let rows: Record<string, Array<Record<string, unknown>>> = {};

function queryFor(table: string) {
  const filters: Array<(row: Record<string, unknown>) => boolean> = [];
  let rowLimit: number | undefined;
  const matchingRows = () => {
    const data = (rows[table] || []).filter((row) => filters.every((filter) => filter(row)));
    return rowLimit === undefined ? data : data.slice(0, rowLimit);
  };
  const query: Record<string, unknown> = {};
  Object.assign(query, {
    select: () => query,
    limit: (limit: number) => {
      rowLimit = limit;
      return query;
    },
    ilike: (column: string, value: string) => {
      // PostgREST ILIKE: * and % match any run, _ matches one character, backslash escapes.
      const source = value.replace(/\\(.)|([*%])|(_)|([^\\*%_])/g, (_m, escaped, many, one, plain) => {
        const literal = escaped ?? plain;
        if (literal !== undefined) return literal.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
        return many ? '.*' : one ? '.' : '';
      });
      const pattern = new RegExp(`^${source}$`, 'i');
      filters.push((row) => pattern.test(String(row[column] ?? '')));
      return query;
    },
    update: () => query,
    eq: (column: string, value: unknown) => {
      filters.push((row) => row[column] === value);
      return query;
    },
    maybeSingle: async () => {
      const data = matchingRows();
      return { data: data.length === 1 ? data[0] : null, error: null };
    },
    then: (resolve: (value: unknown) => unknown) => resolve({ data: matchingRows(), error: null }),
  });
  return query;
}

vi.mock('@/lib/supabase/admin', () => ({
  createAdminClient: () => ({ from: (table: string) => queryFor(table) }),
  getEffectiveOrgId: async (organizationId?: string) => organizationId || 'org-default',
}));

vi.mock('@/lib/session', () => ({
  setSessionCookie: mocks.setSessionCookie,
  clearSessionCookie: vi.fn(),
  getSessionUser: vi.fn(),
}));

vi.mock('@/lib/auth/rate-limit', () => ({
  clearLoginFailures: mocks.clearLoginFailures,
  recordLoginFailure: mocks.recordLoginFailure,
  isLoginRateLimited: mocks.isLoginRateLimited,
}));

import { changeStudentPasswordAction, loginAction } from '@/lib/actions/auth';

async function firstLoginStudent(status = 'Active') {
  return {
    id: 'student-1',
    organization_id: 'org-1',
    uid: 'ST-001',
    student_number: '2026-0001',
    full_name: 'Ada Lovelace',
    last_name: 'Lovelace',
    password_hash: null,
    is_first_login: true,
    status,
  };
}

describe('identifier-based login action', () => {
  beforeEach(() => {
    rows = { organization_settings: [], officers: [], students: [] };
    mocks.setSessionCookie.mockClear();
    mocks.clearLoginFailures.mockClear();
    mocks.recordLoginFailure.mockClear();
    mocks.isLoginRateLimited.mockClear();
    mocks.isLoginRateLimited.mockResolvedValue(false);
  });

  it('resolves an admin from one identifier field and issues a session', async () => {
    rows.organization_settings = [{
      id: 'settings-1',
      organization_id: 'org-1',
      admin_username: 'admin',
      admin_password_hash: await bcrypt.hash('correct-password', 4),
    }];

    const result = await loginAction({ identifier: 'ADMIN', password: 'correct-password' });

    expect(result.success).toBe(true);
    if (result.success) expect(result.data.role).toBe('admin');
    expect(mocks.setSessionCookie).toHaveBeenCalledOnce();
  });

  it('does not accept the legacy admin123 fallback when a password hash exists', async () => {
    rows.organization_settings = [{
      id: 'settings-1',
      organization_id: 'org-1',
      admin_username: 'admin',
      admin_password_hash: await bcrypt.hash('correct-password', 4),
    }];

    const result = await loginAction({ identifier: 'admin', password: 'admin123' });

    expect(result).toMatchObject({ success: false, error: 'Invalid identifier or password.' });
    expect(mocks.setSessionCookie).not.toHaveBeenCalled();
  });

  it('rejects credentials that match more than one account', async () => {
    const sharedHash = await bcrypt.hash('same-secret', 4);
    rows.organization_settings = [{
      id: 'settings-1',
      organization_id: 'org-1',
      admin_username: 'shared',
      admin_password_hash: sharedHash,
    }];
    rows.officers = [{
      id: 'officer-1',
      organization_id: 'org-1',
      name: 'shared',
      pin_hash: sharedHash,
      status: 'Active',
    }];

    const result = await loginAction({ identifier: 'shared', password: 'same-secret' });

    expect(result).toMatchObject({
      success: false,
      error: 'This identifier matches multiple accounts. Contact an administrator.',
    });
    expect(mocks.setSessionCookie).not.toHaveBeenCalled();
  });

  it('rejects the same officer identifier in multiple organizations', async () => {
    const pinHash = await bcrypt.hash('1234', 4);
    rows.officers = [
      { id: 'officer-1', organization_id: 'org-1', name: 'Alex Cruz', pin_hash: pinHash, status: 'Active' },
      { id: 'officer-2', organization_id: 'org-2', name: 'Alex Cruz', pin_hash: pinHash, status: 'Active' },
    ];

    const result = await loginAction({ identifier: 'alex cruz', password: '1234' });

    expect(result).toMatchObject({
      success: false,
      error: 'This identifier matches multiple accounts. Contact an administrator.',
    });
  });

  it('rejects the surname default after a student has changed their password', async () => {
    rows.students = [{
      id: 'student-1',
      organization_id: 'org-1',
      uid: 'ST-001',
      student_number: '2026-0001',
      full_name: 'Ada Lovelace',
      last_name: 'Lovelace',
      password_hash: await bcrypt.hash('new-private-password', 4),
      is_first_login: false,
      status: 'Active',
    }];

    const result = await loginAction({ identifier: '2026-0001', password: 'LOVELACE' });

    expect(result).toMatchObject({ success: false, error: 'Invalid identifier or password.' });
    expect(mocks.setSessionCookie).not.toHaveBeenCalled();
  });

  it('allows the surname default only while the student is on first login', async () => {
    rows.students = [{
      id: 'student-1',
      organization_id: 'org-1',
      uid: 'ST-001',
      student_number: '2026-0001',
      full_name: 'Ada Lovelace',
      last_name: 'Lovelace',
      password_hash: null,
      is_first_login: true,
      status: 'Active',
    }];

    const result = await loginAction({ identifier: 'ST-001', password: 'lovelace' });

    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data).toMatchObject({ role: 'student', must_change_password: true });
    }
  });

  it('does not give officers a plaintext fallback when no PIN hash exists', async () => {
    rows.officers = [{
      id: 'officer-1',
      organization_id: 'org-1',
      name: 'Officer One',
      pin_hash: null,
      status: 'Active',
    }];

    const result = await loginAction({ identifier: 'Officer One', password: '1234' });

    expect(result).toMatchObject({ success: false, error: 'Invalid identifier or password.' });
  });

  it('does not give admins a plaintext fallback when no password hash exists', async () => {
    rows.organization_settings = [{
      id: 'settings-1',
      organization_id: 'org-1',
      admin_username: 'admin',
      admin_password_hash: null,
    }];

    const result = await loginAction({ identifier: 'admin', password: 'admin123' });

    expect(result).toMatchObject({ success: false, error: 'Invalid identifier or password.' });
  });

  it('matches LIKE wildcards in the identifier as literal text', async () => {
    rows.students = [await firstLoginStudent()];

    for (const identifier of ['2026-%', '2026-000_', 'ST-*']) {
      const result = await loginAction({ identifier, password: 'lovelace' });
      expect(result).toMatchObject({ success: false, error: 'Invalid identifier or password.' });
    }
    expect(mocks.setSessionCookie).not.toHaveBeenCalled();
  });
});

describe('student password change action', () => {
  const change = (identifier = '2026-0001', currentPassword = 'LOVELACE') =>
    changeStudentPasswordAction({ identifier, currentPassword, newPassword: 'a-new-private-pass', confirmPassword: 'a-new-private-pass' });

  beforeEach(() => {
    rows = { organization_settings: [], officers: [], students: [] };
    mocks.setSessionCookie.mockClear();
    mocks.recordLoginFailure.mockClear();
    mocks.isLoginRateLimited.mockReset().mockResolvedValue(false);
  });

  it('changes the password and signs in an active student', async () => {
    rows.students = [await firstLoginStudent()];
    await expect(change()).resolves.toMatchObject({ success: true });
    expect(mocks.setSessionCookie).toHaveBeenCalledOnce();
  });

  it('refuses an inactive student', async () => {
    rows.students = [await firstLoginStudent('Inactive')];
    await expect(change()).resolves.toMatchObject({ success: false });
    expect(mocks.setSessionCookie).not.toHaveBeenCalled();
  });

  it('shares the login rate limit', async () => {
    rows.students = [await firstLoginStudent()];
    await expect(change('2026-0001', 'WRONG')).resolves.toMatchObject({ success: false });
    expect(mocks.recordLoginFailure).toHaveBeenCalledWith('2026-0001');

    mocks.isLoginRateLimited.mockResolvedValue(true);
    await expect(change()).resolves.toMatchObject({ success: false });
    expect(mocks.setSessionCookie).not.toHaveBeenCalled();
  });

  it('does not let an officer identifier change a password', async () => {
    rows.officers = [{ id: 'officer-1', organization_id: 'org-1', name: 'Officer One', pin_hash: await bcrypt.hash('1234', 4), status: 'Active' }];
    await expect(change('Officer One', '1234')).resolves.toMatchObject({ success: false });
    expect(mocks.setSessionCookie).not.toHaveBeenCalled();
  });
});
