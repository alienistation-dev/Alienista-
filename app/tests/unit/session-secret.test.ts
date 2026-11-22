import { describe, expect, it } from 'vitest';
import { resolveSessionSecret } from '@/lib/env';

const strong = 'a3f1c9e07b2d4e8f9a6b5c4d3e2f1a0b9c8d7e6f5a4b3c2d1e0f9a8b7c6d5e4f';

describe('resolveSessionSecret', () => {
  it('returns a strong secret in production', () => {
    expect(resolveSessionSecret(strong, 'production')).toBe(strong);
  });

  it.each([
    ['missing', undefined],
    ['empty', ''],
    ['too short', 'short-secret'],
    ['the old hardcoded fallback', 'default-fallback-dev-secret-key-32b'],
    ['the env template placeholder', 'replace-with-a-32-byte-random-hex-string'],
  ])('refuses a %s secret in production', (_label, value) => {
    expect(() => resolveSessionSecret(value, 'production')).toThrow(/SESSION_SECRET/);
  });

  it('allows a local fallback outside production', () => {
    expect(resolveSessionSecret(undefined, 'development').length).toBeGreaterThanOrEqual(32);
  });
});
