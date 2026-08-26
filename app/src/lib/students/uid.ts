import { createAdminClient } from '@/lib/supabase/admin';

export async function allocateStudentUid(
  organizationId: string,
  year: number = new Date().getFullYear()
): Promise<string> {
  const admin = createAdminClient();
  const { data, error } = await admin.rpc('allocate_student_uid', {
    p_organization_id: organizationId,
    p_year: year,
  });

  if (error || typeof data !== 'string') {
    throw new Error(error?.message || 'Failed to allocate a student UID.');
  }
  return data;
}
