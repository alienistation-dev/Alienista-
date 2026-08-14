'use server';

import bcrypt from 'bcryptjs';
import { createAdminClient, getEffectiveOrgId } from '@/lib/supabase/admin';
import { getSessionUser } from '@/lib/session';
import { ActionResponse } from '@/lib/types/actions';
import { Student } from '@/lib/types/models';
import { studentSchema } from '@/lib/validations/students';
import { revalidatePath } from 'next/cache';

export async function getStudentsAction(): Promise<ActionResponse<Student[]>> {
  const user = await getSessionUser();
  if (!user) return { success: false, error: 'Unauthorized' };

  const orgId = await getEffectiveOrgId(user.organization_id);
  const admin = createAdminClient();
  const { data, error } = await admin
    .from('students')
    .select('*')
    .eq('organization_id', orgId)
    .order('full_name', { ascending: true });

  if (error) return { success: false, error: error.message };
  return { success: true, data: data as Student[] };
}

export async function createStudentAction(rawInput: unknown): Promise<ActionResponse<Student>> {
  const user = await getSessionUser();
  if (!user || user.role !== 'admin') return { success: false, error: 'Only admins can add students.' };

  const parsed = studentSchema.safeParse(rawInput);
  if (!parsed.success) return { success: false, error: parsed.error.issues[0].message };

  const orgId = await getEffectiveOrgId(user.organization_id);
  const admin = createAdminClient();
  const defaultPass = (parsed.data.full_name.trim().split(' ').pop() || 'STUDENT').toUpperCase();
  const passHash = await bcrypt.hash(defaultPass, 10);

  const { data, error } = await admin
    .from('students')
    .insert({
      organization_id: orgId,
      uid: parsed.data.uid.trim(),
      student_number: parsed.data.student_number.trim(),
      full_name: parsed.data.full_name.trim(),
      course: parsed.data.course,
      year: parsed.data.year,
      section: parsed.data.section.trim(),
      status: parsed.data.status,
      password_hash: passHash,
      is_first_login: true,
    })
    .select()
    .single();

  if (error) {
    if (error.code === '23505') {
      return { success: false, error: 'A student with this UID or Student Number already exists.' };
    }
    return { success: false, error: error.message };
  }

  revalidatePath('/students');
  return { success: true, data: data as Student };
}

export async function updateStudentAction(id: string, rawInput: unknown): Promise<ActionResponse> {
  const user = await getSessionUser();
  if (!user || user.role !== 'admin') return { success: false, error: 'Unauthorized.' };

  const parsed = studentSchema.safeParse(rawInput);
  if (!parsed.success) return { success: false, error: parsed.error.issues[0].message };

  const orgId = await getEffectiveOrgId(user.organization_id);
  const admin = createAdminClient();
  const { error } = await admin
    .from('students')
    .update({
      uid: parsed.data.uid.trim(),
      student_number: parsed.data.student_number.trim(),
      full_name: parsed.data.full_name.trim(),
      course: parsed.data.course,
      year: parsed.data.year,
      section: parsed.data.section.trim(),
      status: parsed.data.status,
    })
    .eq('id', id)
    .eq('organization_id', orgId);

  if (error) return { success: false, error: error.message };
  revalidatePath('/students');
  return { success: true, data: undefined };
}

export async function deleteStudentAction(id: string): Promise<ActionResponse> {
  const user = await getSessionUser();
  if (!user || user.role !== 'admin') return { success: false, error: 'Unauthorized.' };

  const orgId = await getEffectiveOrgId(user.organization_id);
  const admin = createAdminClient();
  const { error } = await admin
    .from('students')
    .delete()
    .eq('id', id)
    .eq('organization_id', orgId);

  if (error) return { success: false, error: error.message };
  revalidatePath('/students');
  return { success: true, data: undefined };
}

export async function resetStudentPasswordAction(id: string): Promise<ActionResponse<string>> {
  const user = await getSessionUser();
  if (!user || user.role !== 'admin') return { success: false, error: 'Unauthorized.' };

  const orgId = await getEffectiveOrgId(user.organization_id);
  const admin = createAdminClient();
  const { data: student } = await admin
    .from('students')
    .select('id, full_name, last_name')
    .eq('id', id)
    .eq('organization_id', orgId)
    .single();

  if (!student) return { success: false, error: 'Student not found.' };

  const defaultPass = (student.last_name || student.full_name.trim().split(' ').pop() || 'STUDENT').toUpperCase();
  const passHash = await bcrypt.hash(defaultPass, 10);

  const { error } = await admin
    .from('students')
    .update({
      password_hash: passHash,
      is_first_login: true,
    })
    .eq('id', id);

  if (error) return { success: false, error: error.message };

  return { success: true, data: defaultPass, message: `Password reset to: ${defaultPass}` };
}

export async function bulkImportStudentsCsvAction(
  csvRows: Array<{
    uid: string;
    student_number: string;
    full_name: string;
    course?: string;
    year: any;
    section: string;
    status?: any;
  }>
): Promise<ActionResponse<{ imported: number; failed: number; errors: string[] }>> {
  const user = await getSessionUser();
  if (!user || user.role !== 'admin') return { success: false, error: 'Unauthorized.' };

  const orgId = await getEffectiveOrgId(user.organization_id);
  const admin = createAdminClient();
  let imported = 0;
  let failed = 0;
  const errors: string[] = [];

  for (const row of csvRows) {
    const defaultPass = (row.full_name.trim().split(' ').pop() || 'STUDENT').toUpperCase();
    const passHash = await bcrypt.hash(defaultPass, 10);

    const { error } = await admin.from('students').insert({
      organization_id: orgId,
      uid: row.uid.trim(),
      student_number: row.student_number.trim(),
      full_name: row.full_name.trim(),
      course: row.course || 'BS Computer Science',
      year: row.year || '1st Year',
      section: row.section.trim(),
      status: row.status || 'Active',
      password_hash: passHash,
      is_first_login: true,
    });

    if (error) {
      failed++;
      errors.push(`Row ${row.uid} (${row.full_name}): ${error.message}`);
    } else {
      imported++;
    }
  }

  revalidatePath('/students');
  return { success: true, data: { imported, failed, errors } };
}
