import { createAdminClient } from '@/lib/supabase/admin';

async function hashIdentifier(identifier: string): Promise<string> {
  const normalized = identifier.trim().toLowerCase();
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(normalized));
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, '0')).join('');
}

async function callRateLimitFunction(
  functionName: 'check_login_rate_limit' | 'record_login_failure' | 'clear_login_failures',
  identifier: string
) {
  const admin = createAdminClient();
  const { data, error } = await admin.rpc(functionName, {
    p_identifier_hash: await hashIdentifier(identifier),
  });
  if (error) throw new Error(`Unable to ${functionName === 'check_login_rate_limit' ? 'check' : 'update'} login rate limit.`);
  return data;
}

export async function isLoginRateLimited(identifier: string): Promise<boolean> {
  return Boolean(await callRateLimitFunction('check_login_rate_limit', identifier));
}

export async function recordLoginFailure(identifier: string): Promise<void> {
  await callRateLimitFunction('record_login_failure', identifier);
}

export async function clearLoginFailures(identifier: string): Promise<void> {
  await callRateLimitFunction('clear_login_failures', identifier);
}
