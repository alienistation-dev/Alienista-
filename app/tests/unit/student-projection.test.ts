import { describe, expect, it, vi } from 'vitest';

const selections: Array<string | undefined> = [];

vi.mock('@/lib/session', () => ({
  getSessionUser: async () => ({ id: 'admin-1', organization_id: 'org-1', role: 'admin' }),
}));
vi.mock('@/lib/supabase/admin', () => ({
  getEffectiveOrgId: async () => 'org-1',
  createAdminClient: () => ({
    from: () => {
      const builder: Record<string, unknown> = {
        insert: () => builder,
        select: (columns?: string) => { selections.push(columns); return builder; },
        single: async () => ({ data: { id: 'student-1' }, error: null }),
      };
      return builder;
    },
  }),
}));
vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }));

import { createStudentAction } from '@/lib/actions/students';

describe('student projections', () => {
  it('returns a created student without the password hash', async () => {
    const result = await createStudentAction({
      uid: 'ST-001', student_number: '2026-0001', first_name: 'Ada', last_name: 'Lovelace',
      course: 'BSCS', year: '1st Year', section: 'A', status: 'Active',
    });

    expect(result.success).toBe(true);
    expect(selections.at(-1)).toBeTruthy();
    expect(selections.at(-1)).not.toMatch(/password_hash|\*/);
  });
});
