// app/src/lib/env.ts
export function isSecureOrigin(urlLike?: string): boolean {
  if (!urlLike) return false;

  try {
    const url = new URL(urlLike);
    return url.protocol === 'https:';
  } catch {
    return false;
  }
}

// Values that have appeared in this repo or its env template; a forged session needs only the key.
const KNOWN_WEAK_SECRETS = new Set([
  'default-fallback-dev-secret-key-32b',
  'replace-with-a-32-byte-random-hex-string',
]);

// Checked when a session is signed or verified, not at import, so `next build` needs no secret.
export function resolveSessionSecret(value: string | undefined, nodeEnv: string | undefined): string {
  if (nodeEnv !== 'production') return value || 'local-development-only-session-secret';
  if (!value || value.length < 32 || KNOWN_WEAK_SECRETS.has(value)) {
    throw new Error('SESSION_SECRET must be a random value of at least 32 characters in production.');
  }
  return value;
}

export const env = {
  supabaseUrl: process.env.NEXT_PUBLIC_SUPABASE_URL || '',
  supabaseAnonKey: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || '',
  supabaseServiceRoleKey: process.env.SUPABASE_SERVICE_ROLE_KEY || '',
  siteUrl: process.env.NEXT_PUBLIC_SITE_URL || 'http://localhost:3000',
  acsFacebookUrl: process.env.NEXT_PUBLIC_ACS_FACEBOOK_URL || 'https://www.facebook.com/',
};
