import { createClient } from '@supabase/supabase-js';
import { env } from '@/lib/env';

export function createAdminClient() {
  if (!env.supabaseServiceRoleKey) {
    throw new Error('SUPABASE_SERVICE_ROLE_KEY is required for admin client');
  }
  return createClient(env.supabaseUrl, env.supabaseServiceRoleKey, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
    },
  });
}

const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

let cachedOrgId: string | null = null;

export async function getEffectiveOrgId(providedOrgId?: string): Promise<string> {
  if (providedOrgId && UUID_REGEX.test(providedOrgId)) {
    return providedOrgId;
  }

  if (cachedOrgId && UUID_REGEX.test(cachedOrgId)) {
    return cachedOrgId;
  }

  const admin = createAdminClient();
  const { data: org } = await admin.from('organizations').select('id').limit(1).maybeSingle();

  if (org && org.id) {
    cachedOrgId = org.id;
    return org.id;
  }

  // Auto-seed ACS organization if empty
  const { data: newOrg } = await admin
    .from('organizations')
    .insert({ name: 'ACS', slug: 'acs' })
    .select('id')
    .single();

  if (newOrg && newOrg.id) {
    cachedOrgId = newOrg.id;
    return newOrg.id;
  }

  throw new Error('Failed to resolve organization ID in database');
}
