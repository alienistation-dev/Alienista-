import { describe, it, expect, beforeEach } from 'vitest';

class RateLimiter {
  private attempts = new Map<string, number[]>();
  private readonly maxAttempts = 5;
  private readonly windowMs = 5 * 60 * 1000; // 5 minutes

  check(key: string, now: number = Date.now()): boolean {
    const timestamps = (this.attempts.get(key) || []).filter((t) => now - t < this.windowMs);
    this.attempts.set(key, timestamps);
    return timestamps.length >= this.maxAttempts;
  }

  record(key: string, now: number = Date.now()): void {
    const timestamps = this.attempts.get(key) || [];
    timestamps.push(now);
    this.attempts.set(key, timestamps);
  }

  reset(): void {
    this.attempts.clear();
  }
}

describe('Rate Limiting Logic', () => {
  let limiter: RateLimiter;

  beforeEach(() => {
    limiter = new RateLimiter();
  });

  it('should allow up to 4 failed attempts without locking out', () => {
    const key = 'officer:juan';
    const now = 1000000;

    for (let i = 0; i < 4; i++) {
      expect(limiter.check(key, now)).toBe(false);
      limiter.record(key, now);
    }
    expect(limiter.check(key, now)).toBe(false);
  });

  it('should lock out on the 5th failed attempt', () => {
    const key = 'student:st-2026-0001';
    const now = 1000000;

    for (let i = 0; i < 5; i++) {
      limiter.record(key, now);
    }

    expect(limiter.check(key, now)).toBe(true);
  });

  it('should automatically release the lock after the 5-minute window expires', () => {
    const key = 'admin:admin';
    const startTime = 1000000;

    // 5 failures at startTime
    for (let i = 0; i < 5; i++) {
      limiter.record(key, startTime);
    }
    expect(limiter.check(key, startTime)).toBe(true);

    // 5 minutes and 1 second later (301,000 ms)
    const afterWindow = startTime + (5 * 60 * 1000) + 1000;
    expect(limiter.check(key, afterWindow)).toBe(false);
  });

  it('should isolate rate limits across different identifiers', () => {
    const keyA = 'officer:officer_a';
    const keyB = 'officer:officer_b';
    const now = 1000000;

    for (let i = 0; i < 5; i++) {
      limiter.record(keyA, now);
    }

    expect(limiter.check(keyA, now)).toBe(true);
    expect(limiter.check(keyB, now)).toBe(false);
  });
});
