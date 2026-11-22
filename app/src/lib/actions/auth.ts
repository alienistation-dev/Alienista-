'use server';

import bcrypt from 'bcryptjs';
import { createAdminClient } from '@/lib/supabase/admin';
import { setSessionCookie, clearSessionCookie } from '@/lib/session';
import { loginSchema, changePasswordSchema } from '@/lib/validations/auth';
import { ActionResponse, SessionUser } from '@/lib/types/actions';
import {
  AmbiguousLoginIdentifierError,
  InvalidLoginCredentialsError,
  LoginRateLimitedError,
  resolveLoginIdentifier,
} from '@/lib/auth/resolve-login-identifier';
import {
  clearLoginFailures,
  recordLoginFailure,
} from '@/lib/auth/rate-limit';

const RATE_LIMITED_MESSAGE = 'Too many failed login attempts. Please wait 5 minutes before trying again.';

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

    try {
      // Checks the rate limit before verifying anything.
      const sessionUser = await resolveLoginIdentifier(identifier, password);
      await clearLoginFailures(identifier);
      if (!sessionUser.must_change_password) await setSessionCookie(sessionUser);
      return { success: true, data: sessionUser };
    } catch (error) {
      if (error instanceof LoginRateLimitedError) return { success: false, error: RATE_LIMITED_MESSAGE };
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

    const { identifier, currentPassword, newPassword } = parsed.data;

    // Same rate limit, lookup and secret check as login: active accounts only, literal identifier,
    // first-login surname default. The caller must supply the identifier; there is no session yet.
    let verified: SessionUser;
    try {
      verified = await resolveLoginIdentifier(identifier, currentPassword);
    } catch (error) {
      if (error instanceof LoginRateLimitedError) return { success: false, error: RATE_LIMITED_MESSAGE };
      if (error instanceof AmbiguousLoginIdentifierError || error instanceof InvalidLoginCredentialsError) {
        await recordLoginFailure(identifier);
        return { success: false, error: 'Current password is incorrect.' };
      }
      throw error;
    }
    if (verified.role !== 'student') {
      return { success: false, error: 'Current password is incorrect.' };
    }
    await clearLoginFailures(identifier);

    const newHash = await bcrypt.hash(newPassword, 10);

    const { error: updateError } = await createAdminClient()
      .from('students')
      .update({ password_hash: newHash, is_first_login: false })
      .eq('id', verified.id);

    if (updateError) {
      console.error('Database update error:', updateError);
      return { success: false, error: 'Failed to update password in database.' };
    }

    // Issue a full session now that the password is confirmed changed.
    await setSessionCookie({ ...verified, must_change_password: false });

    return { success: true, data: undefined, message: 'Password updated successfully!' };
  } catch (error: unknown) {
    console.error('changeStudentPasswordAction error:', error);
    return { success: false, error: errorMessage(error, 'Password update failed due to a server error.') };
  }
}
