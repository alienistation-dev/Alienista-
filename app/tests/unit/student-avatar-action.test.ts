import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  getSessionUser: vi.fn(),
  upload: vi.fn(),
  remove: vi.fn(),
  updateStudent: vi.fn(),
  updateError: null as { message: string } | null,
}));

vi.mock('@/lib/session', () => ({ getSessionUser: mocks.getSessionUser }));
vi.mock('@/lib/supabase/admin', () => ({
  getEffectiveOrgId: async (organizationId?: string) => organizationId || 'org-1',
  createAdminClient: () => ({
    storage: {
      from: () => ({
        upload: mocks.upload,
        remove: mocks.remove,
        getPublicUrl: (path: string) => ({ data: { publicUrl: `https://project.supabase.co/storage/v1/object/public/student-avatars/${path}` } }),
      }),
    },
    from: () => {
      const filters: Array<[string, unknown]> = [];
      let updatePayload: unknown;
      const builder: Record<string, unknown> = {
        select: () => builder,
        update: (payload: unknown) => { updatePayload = payload; return builder; },
        eq: (column: string, value: unknown) => { filters.push([column, value]); return builder; },
        maybeSingle: async () => {
          if (updatePayload) {
            mocks.updateStudent(updatePayload, filters);
            return { data: mocks.updateError ? null : { id: 'student-1' }, error: mocks.updateError };
          }
          return {
            data: {
              id: 'student-1',
              avatar_url: 'https://project.supabase.co/storage/v1/object/public/student-avatars/org-1/student-1/old.webp',
            },
            error: null,
          };
        },
      };
      return builder;
    },
  }),
}));
vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }));

import { replaceStudentAvatarAction } from '@/lib/actions/students';

function avatarFormData() {
  const formData = new FormData();
  formData.append('file', new File(['image'], 'photo.webp', { type: 'image/webp' }));
  return formData;
}

describe('replaceStudentAvatarAction', () => {
  beforeEach(() => {
    mocks.getSessionUser.mockResolvedValue({ id: 'admin-1', organization_id: 'org-1', role: 'admin' });
    mocks.upload.mockReset().mockResolvedValue({ error: null });
    mocks.remove.mockReset().mockResolvedValue({ error: null });
    mocks.updateStudent.mockReset();
    mocks.updateError = null;
  });

  it('updates the verified student and removes the previous avatar after success', async () => {
    const result = await replaceStudentAvatarAction('student-1', avatarFormData());

    expect(result.success).toBe(true);
    expect(mocks.updateStudent).toHaveBeenCalledWith(
      expect.objectContaining({ avatar_url: expect.stringContaining('/org-1/student-1/avatar-') }),
      expect.arrayContaining([['id', 'student-1'], ['organization_id', 'org-1']])
    );
    expect(mocks.remove).toHaveBeenCalledWith(['org-1/student-1/old.webp']);
  });

  it('removes the newly uploaded object when the database update fails', async () => {
    mocks.updateError = { message: 'database unavailable' };

    const result = await replaceStudentAvatarAction('student-1', avatarFormData());

    expect(result).toEqual({ success: false, error: 'database unavailable' });
    expect(mocks.remove).toHaveBeenCalledWith([
      expect.stringMatching(/^org-1\/student-1\/avatar-\d+\.webp$/),
    ]);
    expect(mocks.remove).not.toHaveBeenCalledWith(['org-1/student-1/old.webp']);
  });

  it('rejects officer callers before touching Storage', async () => {
    mocks.getSessionUser.mockResolvedValue({ id: 'officer-1', organization_id: 'org-1', role: 'officer' });

    const result = await replaceStudentAvatarAction('student-1', avatarFormData());

    expect(result).toEqual({ success: false, error: 'Only admins can replace student photos.' });
    expect(mocks.upload).not.toHaveBeenCalled();
  });
});
