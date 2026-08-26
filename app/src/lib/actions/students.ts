'use server';

import bcrypt from 'bcryptjs';
import { createAdminClient, getEffectiveOrgId } from '@/lib/supabase/admin';
import { getSessionUser } from '@/lib/session';
import { ActionResponse } from '@/lib/types/actions';
import { BadgeStudent, MemberStatus, ScannerStudent, Student, YearLevel } from '@/lib/types/models';
import { studentSchema } from '@/lib/validations/students';
import { revalidatePath } from 'next/cache';
import { allocateStudentUid } from '@/lib/students/uid';
import { withServerTiming } from '@/lib/server-timing';

const STUDENT_PROJECTION = 'id, organization_id, uid, student_number, first_name, last_name, full_name, course, year, section, status, is_first_login, avatar_url, created_at, updated_at';

const SCANNER_PROJECTION = 'id, organization_id, uid, student_number, full_name, status, avatar_url';
const BADGE_PROJECTION = 'id, uid, student_number, full_name, course, year, section, status, avatar_url';

export async function getStudentsAction(): Promise<ActionResponse<Student[]>> {
  const user = await getSessionUser();
  if (!user) return { success: false, error: 'Unauthorized' };

  const orgId = await getEffectiveOrgId(user.organization_id);
  const admin = createAdminClient();
  const { data, error } = await withServerTiming('students', async () => admin
    .from('students')
    .select(STUDENT_PROJECTION)
    .eq('organization_id', orgId)
    .order('full_name', { ascending: true }));

  if (error) return { success: false, error: error.message };
  return { success: true, data: data as Student[] };
}

export async function getScannerStudentsAction(): Promise<ActionResponse<ScannerStudent[]>> {
  const user = await getSessionUser();
  if (!user) return { success: false, error: 'Unauthorized' };
  const orgId = await getEffectiveOrgId(user.organization_id);
  const admin = createAdminClient();
  const { data, error } = await admin.from('students').select(SCANNER_PROJECTION).eq('organization_id', orgId).eq('status', 'Active').order('full_name', { ascending: true });
  if (error) return { success: false, error: error.message };
  return { success: true, data: (data || []) as ScannerStudent[] };
}

export async function getBadgeStudentsAction(): Promise<ActionResponse<BadgeStudent[]>> {
  const user = await getSessionUser();
  if (!user) return { success: false, error: 'Unauthorized' };
  const orgId = await getEffectiveOrgId(user.organization_id);
  const admin = createAdminClient();
  const { data, error } = await admin.from('students').select(BADGE_PROJECTION).eq('organization_id', orgId).order('full_name', { ascending: true });
  if (error) return { success: false, error: error.message };
  return { success: true, data: (data || []) as BadgeStudent[] };
}

export async function createStudentAction(rawInput: unknown): Promise<ActionResponse<Student>> {
  const user = await getSessionUser();
  if (!user || user.role !== 'admin') return { success: false, error: 'Only admins can add students.' };

  const parsed = studentSchema.safeParse(rawInput);
  if (!parsed.success) return { success: false, error: parsed.error.issues[0].message };

  const orgId = await getEffectiveOrgId(user.organization_id);
  const admin = createAdminClient();

  let finalUid = parsed.data.uid?.trim();
  if (!finalUid) {
    finalUid = await allocateStudentUid(orgId);
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
      avatar_url: parsed.data.avatar_url || null,
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

  const updatePayload: Record<string, unknown> = {
    student_number: parsed.data.student_number.trim(),
    first_name: firstName,
    last_name: lastName,
    full_name: computedFullName,
    course: parsed.data.course,
    year: parsed.data.year,
    section: parsed.data.section.trim(),
    status: parsed.data.status,
  };

  if (parsed.data.avatar_url !== undefined) {
    updatePayload.avatar_url = parsed.data.avatar_url || null;
  }

  const { error } = await admin
    .from('students')
    .update(updatePayload)
    .eq('id', id)
    .eq('organization_id', orgId);

  if (error) return { success: false, error: error.message };
  revalidatePath('/students');
  return { success: true, data: undefined };
}

export async function uploadStudentAvatarAction(formData: FormData): Promise<ActionResponse<{ publicUrl: string }>> {
  try {
    const user = await getSessionUser();
    if (!user || (user.role !== 'admin' && user.role !== 'officer')) {
      return { success: false, error: 'Unauthorized. Admin or officer access required.' };
    }

    const file = formData.get('file') as File | null;
    if (!file) {
      return { success: false, error: 'No image file provided.' };
    }

    // Size limit: 2MB (2 * 1024 * 1024 bytes)
    const MAX_SIZE = 2 * 1024 * 1024;
    if (file.size > MAX_SIZE) {
      return { success: false, error: 'Image size exceeds the 2MB limit. Please upload a smaller image.' };
    }

    // MIME type validation: strictly JPEG, PNG, WebP (GIF explicitly blocked)
    const allowedTypes = ['image/jpeg', 'image/jpg', 'image/png', 'image/webp'];
    if (!allowedTypes.includes(file.type.toLowerCase()) || file.type.toLowerCase() === 'image/gif') {
      return { success: false, error: 'Invalid file format. Only JPG, PNG, and WebP images are allowed (no GIFs).' };
    }

    const orgId = await getEffectiveOrgId(user.organization_id);
    const admin = createAdminClient();

    // Ensure bucket exists
    const { data: buckets } = await admin.storage.listBuckets();
    if (!buckets?.some((b) => b.name === 'student-avatars')) {
      await admin.storage.createBucket('student-avatars', {
        public: true,
        fileSizeLimit: MAX_SIZE,
        allowedMimeTypes: allowedTypes,
      });
    }

    const ext = file.name.split('.').pop()?.toLowerCase() || 'jpg';
    const cleanExt = ext === 'jpeg' ? 'jpg' : ext;
    const studentUid = (formData.get('student_uid') as string) || 'avatar';
    const filePath = `${orgId}/${studentUid}_${Date.now()}.${cleanExt}`;

    const buffer = Buffer.from(await file.arrayBuffer());

    const { error: uploadError } = await admin.storage
      .from('student-avatars')
      .upload(filePath, buffer, {
        contentType: file.type,
        upsert: true,
      });

    if (uploadError) {
      console.error('Storage upload error:', uploadError);
      return { success: false, error: `Failed to upload image: ${uploadError.message}` };
    }

    const { data: { publicUrl } } = admin.storage
      .from('student-avatars')
      .getPublicUrl(filePath);

    return { success: true, data: { publicUrl } };
  } catch (err: unknown) {
    console.error('uploadStudentAvatarAction error:', err);
    return { success: false, error: err instanceof Error ? err.message : 'Failed to upload student photo.' };
  }
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
    year: YearLevel;
    section: string;
    status?: MemberStatus;
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
