import { describe, it, expect } from 'vitest';

function validateEnv(env: Record<string, string | undefined>): { valid: boolean; errors: string[] } {
  const errors: string[] = [];

  if (!env.NEXT_PUBLIC_SUPABASE_URL) {
    errors.push('NEXT_PUBLIC_SUPABASE_URL is missing');
  } else if (env.NEXT_PUBLIC_SUPABASE_URL.includes('your-project-ref')) {
    errors.push('NEXT_PUBLIC_SUPABASE_URL contains unresolved placeholder');
  } else if (!env.NEXT_PUBLIC_SUPABASE_URL.startsWith('https://')) {
    errors.push('NEXT_PUBLIC_SUPABASE_URL must be a valid HTTPS URL');
  }

  if (!env.NEXT_PUBLIC_SUPABASE_ANON_KEY) {
    errors.push('NEXT_PUBLIC_SUPABASE_ANON_KEY is missing');
  }

  if (!env.SUPABASE_SERVICE_ROLE_KEY) {
    errors.push('SUPABASE_SERVICE_ROLE_KEY is missing');
  }

  return {
    valid: errors.length === 0,
    errors,
  };
}

describe('Environment Configuration Validation', () => {
  it('should flag placeholder project URLs as invalid', () => {
    const badEnv = {
      NEXT_PUBLIC_SUPABASE_URL: 'https://your-project-ref.supabase.co',
      NEXT_PUBLIC_SUPABASE_ANON_KEY: 'valid-anon-key',
      SUPABASE_SERVICE_ROLE_KEY: 'valid-service-key',
    };
    const result = validateEnv(badEnv);
    expect(result.valid).toBe(false);
    expect(result.errors).toContain('NEXT_PUBLIC_SUPABASE_URL contains unresolved placeholder');
  });

  it('should pass on valid project configuration', () => {
    const goodEnv = {
      NEXT_PUBLIC_SUPABASE_URL: 'https://izznqcirnxhazbpyqcach.supabase.co',
      NEXT_PUBLIC_SUPABASE_ANON_KEY: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...',
      SUPABASE_SERVICE_ROLE_KEY: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...',
    };
    const result = validateEnv(goodEnv);
    expect(result.valid).toBe(true);
    expect(result.errors.length).toBe(0);
  });
});
