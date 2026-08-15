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

  // Auto-generate incremental UID if omitted or empty (e.g. ST-2026-0001)
  let finalUid = parsed.data.uid?.trim();
  if (!finalUid) {
    const currentYear = new Date().getFullYear();
    const prefix = `ST-${currentYear}-`;
    const { data: latestStudents } = await admin
      .from('students')
      .select('uid')
      .eq('organization_id', orgId)
      .ilike('uid', `${prefix}%`)
      .order('created_at', { ascending: false })
      .limit(50);

    let maxSeq = 0;
    if (latestStudents && latestStudents.length > 0) {
      for (const s of latestStudents) {
        const parts = s.uid.split('-');
        const num = parseInt(parts[parts.length - 1], 10);
        if (!isNaN(num) && num > maxSeq) {
          maxSeq = num;
        }
      }
    }
    if (maxSeq === 0) {
      const { count } = await admin
        .from('students')
        .select('*', { count: 'exact', head: true })
        .eq('organization_id', orgId);
      maxSeq = count || 0;
    }
    finalUid = `${prefix}${String(maxSeq + 1).padStart(4, '0')}`;
  }

  const firstName = parsed.data.first_name.trim();
  const lastName = parsed.data.last_name.trim();
  const computedFullName = `${firstName} ${lastName}`;
  const defaultPass = lastName.toUpperCase();
  const passHash = await bcrypt.hash(defaultPass, 10);

  const { data, error } = await admin
    .from('students')
    .insert({
      organization_id: orgId,
      uid: finalUid,
      student_number: parsed.data.student_number.trim(),
      first_name: firstName,
      last_name: lastName,
      full_name: computedFullName,
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

  const firstName = parsed.data.first_name.trim();
  const lastName = parsed.data.last_name.trim();
  const computedFullName = `${firstName} ${lastName}`;

  const { error } = await admin
    .from('students')
    .update({
      ...(parsed.data.uid ? { uid: parsed.data.uid.trim() } : {}),
      student_number: parsed.data.student_number.trim(),
      first_name: firstName,
      last_name: lastName,
      full_name: computedFullName,
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
    .select('id, full_name, last_name, first_name')
    .eq('id', id)
    .eq('organization_id', orgId)
    .single();

  if (!student) return { success: false, error: 'Student not found.' };

  const defaultPass = (student.last_name || student.full_name.trim().split(' ').pop() || 'STUDENT').trim().toUpperCase();
  const passHash = await bcrypt.hash(defaultPass, 10);

  const { error } = await admin
    .from('students')
    .update({
      password_hash: passHash,
      is_first_login: true,
    })
    .eq('id', id);

  if (error) return { success: false, error: error.message };

  return { success: true, data: defaultPass, message: `Password reset to default (${defaultPass})` };
}

export async function bulkImportStudentsCsvAction(
  csvRows: Array<{
    uid?: string;
    student_number: string;
    first_name?: string;
    last_name?: string;
    full_name?: string;
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
    let firstName = (row.first_name || '').trim();
    let lastName = (row.last_name || '').trim();
    let fullName = (row.full_name || '').trim();

    if (!firstName || !lastName) {
      if (fullName) {
        const parts = fullName.split(' ');
        lastName = parts.pop() || 'STUDENT';
        firstName = parts.join(' ') || lastName;
      } else {
        firstName = 'Student';
        lastName = 'Member';
        fullName = 'Student Member';
      }
    } else {
      fullName = `${firstName} ${lastName}`;
    }

    const defaultPass = lastName.toUpperCase();
    const passHash = await bcrypt.hash(defaultPass, 10);

    let uid = (row.uid || '').trim();
    if (!uid) {
      uid = `ST-${new Date().getFullYear()}-${Math.random().toString(36).slice(2, 6).toUpperCase()}`;
    }

    const { error } = await admin.from('students').insert({
      organization_id: orgId,
      uid,
      student_number: row.student_number.trim(),
      first_name: firstName,
      last_name: lastName,
      full_name: fullName,
      course: row.course || 'BS Computer Science',
      year: row.year || '1st Year',
      section: row.section.trim(),
      status: row.status || 'Active',
      password_hash: passHash,
      is_first_login: true,
    });

    if (error) {
      failed++;
      errors.push(`Row ${row.student_number} (${fullName}): ${error.message}`);
    } else {
      imported++;
    }
  }

  revalidatePath('/students');
  return { success: true, data: { imported, failed, errors } };
}
