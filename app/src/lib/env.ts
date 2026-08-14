// app/src/lib/env.ts
export const env = {
  supabaseUrl: process.env.NEXT_PUBLIC_SUPABASE_URL || '',
  supabaseAnonKey: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || '',
  supabaseServiceRoleKey: process.env.SUPABASE_SERVICE_ROLE_KEY || '',
  sessionSecret: process.env.SESSION_SECRET || 'default-fallback-dev-secret-key-32b',
  siteUrl: process.env.NEXT_PUBLIC_SITE_URL || 'http://localhost:3000',
};
