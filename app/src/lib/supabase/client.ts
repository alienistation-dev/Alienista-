import { createBrowserClient as createClient } from '@supabase/ssr';
import { env } from '@/lib/env';

export function createBrowserClient() {
  return createClient(env.supabaseUrl, env.supabaseAnonKey);
}
