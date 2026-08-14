'use server';

import bcrypt from 'bcryptjs';
import { createAdminClient } from '@/lib/supabase/admin';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import { setSessionCookie, clearSessionCookie } from '@/lib/session';
import { loginSchema, changePasswordSchema } from '@/lib/validations/auth';
import { ActionResponse, SessionUser } from '@/lib/types/actions';

const failedAttemptsMap = new Map<string, number[]>();

function checkRateLimit(key: string): boolean {
  const now = Date.now();
  const windowMs = 5 * 60 * 1000; // 5 minutes
  const attempts = (failedAttemptsMap.get(key) || []).filter((t) => now - t < windowMs);
  failedAttemptsMap.set(key, attempts);
  return attempts.length >= 5;
}

function recordFailedAttempt(key: string) {
  const attempts = failedAttemptsMap.get(key) || [];
  attempts.push(Date.now());
  failedAttemptsMap.set(key, attempts);
}

export async function loginAction(rawInput: unknown): Promise<ActionResponse<SessionUser>> {
  const parsed = loginSchema.safeParse(rawInput);
  if (!parsed.success) {
    return { success: false, error: parsed.error.issues[0].message };
  }

  const { role, identifier, password } = parsed.data;
  const lookupKey = `${role}:${identifier.trim().toLowerCase()}`;

  if (checkRateLimit(lookupKey)) {
    return {
      success: false,
      error: 'Too many failed login attempts. Please wait 5 minutes before trying again.',
    };
  }

  const admin = createAdminClient();

  // 1. Admin Authentication (Supabase Auth)
  if (role === 'admin') {
    const supabase = await createServerSupabaseClient();
    const { data: authData, error: authError } = await supabase.auth.signInWithPassword({
      email: identifier,
      password,
    });

    if (authError || !authData.user) {
      recordFailedAttempt(lookupKey);
      return { success: false, error: 'Invalid admin credentials.' };
    }

    const { data: profile } = await admin
      .from('profiles')
      .select('organization_id, role, display_name')
      .eq('id', authData.user.id)
      .single();

    const sessionUser: SessionUser = {
      id: authData.user.id,
      organization_id: profile?.organization_id || '',
      role: 'admin',
      name: profile?.display_name || authData.user.email || 'Admin',
    };

    await setSessionCookie(sessionUser);
    return { success: true, data: sessionUser };
  }

  // 2. Officer Authentication (Name + PIN)
  if (role === 'officer') {
    const { data: officer } = await admin
      .from('officers')
      .select('id, organization_id, name, pin_hash, status')
      .ilike('name', identifier.trim())
      .eq('status', 'Active')
      .single();

    if (!officer || !officer.pin_hash) {
      recordFailedAttempt(lookupKey);
      return { success: false, error: 'Invalid officer name or PIN.' };
    }

    const isValidPin = await bcrypt.compare(password, officer.pin_hash);
    if (!isValidPin) {
      recordFailedAttempt(lookupKey);
      return { success: false, error: 'Invalid officer name or PIN.' };
    }

    const sessionUser: SessionUser = {
      id: officer.id,
      organization_id: officer.organization_id,
      role: 'officer',
      name: officer.name,
    };

    await setSessionCookie(sessionUser);
    return { success: true, data: sessionUser };
  }

  // 3. Student Authentication (UID / Student Number + Password)
  if (role === 'student') {
    const { data: student } = await admin
      .from('students')
      .select('id, organization_id, uid, student_number, full_name, first_name, last_name, password_hash, is_first_login, status')
      .or(`uid.ilike.${identifier.trim()},student_number.ilike.${identifier.trim()}`)
      .eq('status', 'Active')
      .single();

    if (!student) {
      recordFailedAttempt(lookupKey);
      return { success: false, error: 'Student account not found or inactive.' };
    }

    let isValid = false;

    if (student.password_hash) {
      isValid = await bcrypt.compare(password, student.password_hash);
    }

    // Default password fallback for first login (last name uppercase)
    if (!isValid && student.is_first_login) {
      const defaultPass = (student.last_name || student.full_name.split(' ').pop() || '').trim().toUpperCase();
      if (password.trim().toUpperCase() === defaultPass) {
        isValid = true;
      }
    }

    if (!isValid) {
      recordFailedAttempt(lookupKey);
      return { success: false, error: 'Incorrect student credentials.' };
    }

    const sessionUser: SessionUser = {
      id: student.id,
      organization_id: student.organization_id,
      role: 'student',
      name: student.full_name,
      uid: student.uid,
      student_number: student.student_number,
      must_change_password: student.is_first_login,
    };

    await setSessionCookie(sessionUser);
    return { success: true, data: sessionUser };
  }

  return { success: false, error: 'Invalid login role.' };
}

export async function logoutAction(): Promise<ActionResponse> {
  const supabase = await createServerSupabaseClient();
  await supabase.auth.signOut();
  await clearSessionCookie();
  return { success: true, data: undefined };
}

export async function changeStudentPasswordAction(rawInput: unknown): Promise<ActionResponse> {
  const parsed = changePasswordSchema.safeParse(rawInput);
  if (!parsed.success) {
    return { success: false, error: parsed.error.issues[0].message };
  }

  const { identifier, currentPassword, newPassword } = parsed.data;
  const admin = createAdminClient();

  const { data: student } = await admin
    .from('students')
    .select('id, last_name, full_name, password_hash, is_first_login')
    .or(`uid.ilike.${identifier.trim()},student_number.ilike.${identifier.trim()}`)
    .single();

  if (!student) {
    return { success: false, error: 'Student not found.' };
  }

  let valid = false;
  if (student.password_hash) {
    valid = await bcrypt.compare(currentPassword, student.password_hash);
  }
  if (!valid && student.is_first_login) {
    const defaultPass = (student.last_name || student.full_name.split(' ').pop() || '').trim().toUpperCase();
    if (currentPassword.trim().toUpperCase() === defaultPass) {
      valid = true;
    }
  }

  if (!valid) {
    return { success: false, error: 'Current password is incorrect.' };
  }

  const newHash = await bcrypt.hash(newPassword, 10);

  const { error } = await admin
    .from('students')
    .update({ password_hash: newHash, is_first_login: false })
    .eq('id', student.id);

  if (error) {
    return { success: false, error: 'Failed to update password.' };
  }

  return { success: true, data: undefined, message: 'Password updated successfully!' };
}
