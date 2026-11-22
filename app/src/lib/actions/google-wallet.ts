'use server';

import { createAdminClient, getEffectiveOrgId } from '@/lib/supabase/admin';
import { getSessionUser } from '@/lib/session';
import { ActionResponse } from '@/lib/types/actions';
import { Student } from '@/lib/types/models';
import { issueGoogleWalletSaveUrl } from '@/lib/badges/google-wallet';

export async function getStudentGoogleWalletUrlAction(studentId?: string): Promise<ActionResponse<{ url: string }>> {
  const user = await getSessionUser();
  if (!user) return { success: false, error: 'Unauthorized.' };

  const orgId = await getEffectiveOrgId(user.organization_id);
  const admin = createAdminClient();

  // Check if feature is enabled in environment
  if (process.env.NEXT_PUBLIC_ENABLE_GOOGLE_WALLET === 'false') {
    return { success: false, error: 'Google Wallet pass feature is disabled.' };
  }

  const { data: settings, error: settingsError } = await admin
    .from('organization_settings')
    .select('google_wallet_enabled, google_wallet_design')
    .eq('organization_id', orgId)
    .maybeSingle();

  // Fail closed: without settings we cannot tell whether the admin turned Wallet off.
  if (settingsError) return { success: false, error: 'Google Wallet settings could not be read. Try again.' };

  if (settings && !settings.google_wallet_enabled && user.role !== 'admin') {
    return { success: false, error: 'Google Wallet pass generation is currently turned off by admin.' };
  }

  const targetId = user.role === 'admin' && studentId ? studentId : user.id;

  const { data: student, error } = await admin
    .from('students')
    .select('*')
    .eq('id', targetId)
    .eq('organization_id', orgId)
    .maybeSingle();

  if (error || !student) return { success: false, error: 'Student record not found.' };

  const typedStudent = student as Student;
  if (typedStudent.status !== 'Active') return { success: false, error: 'Only active students can add a Google Wallet pass.' };

  const design = settings?.google_wallet_design === 'legacy' ? 'legacy' : 'builder';
  const issued = await issueGoogleWalletSaveUrl(typedStudent, design);
  if (issued.status === 'skipped') return { success: false, error: 'Google Wallet server credentials not configured.' };
  if (issued.status === 'failed') {
    console.warn('Google Wallet pass issuance failed:', issued.error);
    return { success: false, error: 'Google Wallet pass could not be created. Try again later.' };
  }

  return { success: true, data: { url: issued.url } };
}
