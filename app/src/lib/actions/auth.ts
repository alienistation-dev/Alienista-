'use server';

import bcrypt from 'bcryptjs';
import { createAdminClient, getEffectiveOrgId } from '@/lib/supabase/admin';
import { setSessionCookie, clearSessionCookie, getSessionUser } from '@/lib/session';
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
  try {
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

    // 1. Admin Authentication (Username + Password via Organization Settings)
    if (role === 'admin') {
      const { data: settings } = await admin
        .from('organization_settings')
        .select('id, organization_id, admin_username, admin_password_hash')
        .limit(1)
        .maybeSingle();

      const expectedUsername = (settings?.admin_username || 'admin').trim().toLowerCase();
      const inputUsername = identifier.trim().toLowerCase();

      if (inputUsername !== expectedUsername) {
        recordFailedAttempt(lookupKey);
        return { success: false, error: 'Invalid admin username or password.' };
      }

      let isValid = false;
      if (settings?.admin_password_hash) {
        isValid = await bcrypt.compare(password, settings.admin_password_hash);
      }

      // Default password fallback: 'admin123'
      if (!isValid && (password === 'admin123' || !settings?.admin_password_hash)) {
        isValid = true;
      }

      if (!isValid) {
        recordFailedAttempt(lookupKey);
        return { success: false, error: 'Invalid admin username or password.' };
      }

      const orgId = await getEffectiveOrgId(settings?.organization_id);

      const sessionUser: SessionUser = {
        id: settings?.id || 'admin_session',
        organization_id: orgId,
        role: 'admin',
        name: settings?.admin_username || 'Admin',
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
        .maybeSingle();

      if (!officer || !officer.pin_hash) {
        recordFailedAttempt(lookupKey);
        return { success: false, error: 'Invalid officer name or PIN.' };
      }

      const isValidPin = await bcrypt.compare(password, officer.pin_hash);
      if (!isValidPin) {
        recordFailedAttempt(lookupKey);
        return { success: false, error: 'Invalid officer name or PIN.' };
      }

      const orgId = await getEffectiveOrgId(officer.organization_id);

      const sessionUser: SessionUser = {
        id: officer.id,
        organization_id: orgId,
        role: 'officer',
        name: officer.name,
      };

      await setSessionCookie(sessionUser);
      return { success: true, data: sessionUser };
    }

    // 3. Student Authentication (Student Number + Password)
    if (role === 'student') {
      const cleanStudentNumber = identifier.trim();
      let { data: student } = await admin
        .from('students')
        .select('id, organization_id, uid, student_number, full_name, first_name, last_name, password_hash, is_first_login, status')
        .ilike('student_number', cleanStudentNumber)
        .eq('status', 'Active')
        .maybeSingle();

      // Fallback: Check if UID was entered
      if (!student) {
        const { data: byUid } = await admin
          .from('students')
          .select('id, organization_id, uid, student_number, full_name, first_name, last_name, password_hash, is_first_login, status')
          .ilike('uid', cleanStudentNumber)
          .eq('status', 'Active')
          .maybeSingle();
        student = byUid;
      }

      if (!student) {
        recordFailedAttempt(lookupKey);
        return { success: false, error: 'Student number not found or account inactive.' };
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

      const orgId = await getEffectiveOrgId(student.organization_id);

      const sessionUser: SessionUser = {
        id: student.id,
        organization_id: orgId,
        role: 'student',
        name: student.full_name,
        uid: student.uid,
        student_number: student.student_number,
        must_change_password: Boolean(student.is_first_login),
      };

      // IMPORTANT: Do NOT set session cookie if must_change_password is true.
      // The student is still on /login and needs to call changeStudentPasswordAction
      // as a server action. If we set the cookie now, the middleware will see the
      // student as logged in and redirect /login requests to /my-qr, which kills
      // the server action call and produces "An unexpected response from the server".
      if (!sessionUser.must_change_password) {
        await setSessionCookie(sessionUser);
      }
      return { success: true, data: sessionUser };
    }

    return { success: false, error: 'Invalid login role.' };
  } catch (err: any) {
    console.error('loginAction error:', err);
    return { success: false, error: err?.message || 'Login failed due to a server error.' };
  }
}

export async function logoutAction(): Promise<ActionResponse> {
  try {
    await clearSessionCookie();
    return { success: true, data: undefined };
  } catch (err: any) {
    return { success: false, error: err?.message || 'Logout failed.' };
  }
}

export async function changeStudentPasswordAction(rawInput: unknown): Promise<ActionResponse> {
  try {
    const parsed = changePasswordSchema.safeParse(rawInput);
    if (!parsed.success) {
      return { success: false, error: parsed.error.issues[0].message };
    }

    const { identifier, newPassword } = parsed.data;
    const admin = createAdminClient();
    const cleanIdentifier = identifier.trim();

    let { data: student } = await admin
      .from('students')
      .select('id, organization_id, last_name, first_name, full_name, uid, student_number, password_hash, is_first_login')
      .ilike('student_number', cleanIdentifier)
      .maybeSingle();

    // Fallback: Check by UID
    if (!student) {
      const { data: byUid } = await admin
        .from('students')
        .select('id, organization_id, last_name, first_name, full_name, uid, student_number, password_hash, is_first_login')
        .ilike('uid', cleanIdentifier)
        .maybeSingle();
      student = byUid;
    }

    // Fallback: Check if session user matches
    if (!student) {
      const sessionUser = await getSessionUser();
      if (sessionUser && sessionUser.role === 'student') {
        const { data: fallback } = await admin
          .from('students')
          .select('id, organization_id, last_name, first_name, full_name, uid, student_number, password_hash, is_first_login')
          .eq('id', sessionUser.id)
          .maybeSingle();
        student = fallback;
      }
    }

    if (!student) {
      return { success: false, error: 'Student record not found.' };
    }

    const newHash = await bcrypt.hash(newPassword, 10);

    const { error: updateError } = await admin
      .from('students')
      .update({ password_hash: newHash, is_first_login: false })
      .eq('id', student.id);

    if (updateError) {
      console.error('Database update error:', updateError);
      return { success: false, error: 'Failed to update password in database.' };
    }

    // Update session cookie immediately so must_change_password is false
    const orgId = await getEffectiveOrgId(student.organization_id);
    const sessionUser: SessionUser = {
      id: student.id,
      organization_id: orgId,
      role: 'student',
      name: student.full_name,
      uid: student.uid,
      student_number: student.student_number,
      must_change_password: false,
    };
    await setSessionCookie(sessionUser);

    return { success: true, data: undefined, message: 'Password updated successfully!' };
  } catch (err: any) {
    console.error('changeStudentPasswordAction error:', err);
    return { success: false, error: err?.message || 'Password update failed due to a server error.' };
  }
}
