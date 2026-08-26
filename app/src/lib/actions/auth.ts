'use server';

import bcrypt from 'bcryptjs';
import { createAdminClient, getEffectiveOrgId } from '@/lib/supabase/admin';
import { setSessionCookie, clearSessionCookie, getSessionUser } from '@/lib/session';
import { loginSchema, changePasswordSchema } from '@/lib/validations/auth';
import { ActionResponse, SessionUser } from '@/lib/types/actions';
import {
  AmbiguousLoginIdentifierError,
  InvalidLoginCredentialsError,
  resolveLoginIdentifier,
} from '@/lib/auth/resolve-login-identifier';
import {
  clearLoginFailures,
  isLoginRateLimited,
  recordLoginFailure,
} from '@/lib/auth/rate-limit';

function errorMessage(error: unknown, fallback: string): string {
  return error instanceof Error ? error.message : fallback;
}

export async function loginAction(rawInput: unknown): Promise<ActionResponse<SessionUser>> {
  try {
    const parsed = loginSchema.safeParse(rawInput);
    if (!parsed.success) {
      return { success: false, error: parsed.error.issues[0].message };
    }

    const { identifier, password } = parsed.data;

    if (await isLoginRateLimited(identifier)) {
      return {
        success: false,
        error: 'Too many failed login attempts. Please wait 5 minutes before trying again.',
      };
    }

    try {
      const sessionUser = await resolveLoginIdentifier(identifier, password);
      await clearLoginFailures(identifier);
      if (!sessionUser.must_change_password) await setSessionCookie(sessionUser);
      return { success: true, data: sessionUser };
    } catch (error) {
      if (error instanceof AmbiguousLoginIdentifierError) {
        await recordLoginFailure(identifier);
        return {
          success: false,
          error: 'This identifier matches multiple accounts. Contact an administrator.',
        };
      }
      if (error instanceof InvalidLoginCredentialsError) {
        await recordLoginFailure(identifier);
        return { success: false, error: 'Invalid identifier or password.' };
      }
      throw error;
    }
  } catch (error: unknown) {
    console.error('loginAction error:', error);
    return { success: false, error: errorMessage(error, 'Login failed due to a server error.') };
  }
}

export async function logoutAction(): Promise<ActionResponse> {
  try {
    await clearSessionCookie();
    return { success: true, data: undefined };
  } catch (error: unknown) {
    return { success: false, error: errorMessage(error, 'Logout failed.') };
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
      subject_id: student.id,
      subject_type: 'student',
      organization_id: orgId,
      role: 'student',
      name: student.full_name,
      issued_at: Date.now(),
      expires_at: Date.now() + 7 * 24 * 60 * 60 * 1000,
      uid: student.uid,
      student_number: student.student_number,
      must_change_password: false,
    };
    await setSessionCookie(sessionUser);

    return { success: true, data: undefined, message: 'Password updated successfully!' };
  } catch (error: unknown) {
    console.error('changeStudentPasswordAction error:', error);
    return { success: false, error: errorMessage(error, 'Password update failed due to a server error.') };
  }
}
