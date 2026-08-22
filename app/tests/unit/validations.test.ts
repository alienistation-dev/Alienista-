import { describe, it, expect } from 'vitest';
import { loginSchema, changePasswordSchema } from '@/lib/validations/auth';
import { studentSchema } from '@/lib/validations/students';
import { eventSchema, eventSlotSchema } from '@/lib/validations/events';

describe('Validation Schemas Unit Tests', () => {
  describe('Login Schema', () => {
    it('accepts credentials without requiring a client-selected role', () => {
      const result = loginSchema.safeParse({
        identifier: 'admin',
        password: 'adminpassword',
      });
      expect(result.success).toBe(true);
    });

    it('rejects blank identifiers and secrets', () => {
      const result = loginSchema.safeParse({
        identifier: '   ',
        password: '',
      });
      expect(result.success).toBe(false);
    });
  });

  describe('Password Change Schema', () => {
    it('should enforce minimum 6 characters for new password', () => {
      const tooShort = changePasswordSchema.safeParse({
        identifier: 'ST-2026-0001',
        currentPassword: 'OLD',
        newPassword: '12345',
      });
      expect(tooShort.success).toBe(false);

      const valid = changePasswordSchema.safeParse({
        identifier: 'ST-2026-0001',
        currentPassword: 'OLD',
        newPassword: 'password123',
      });
      expect(valid.success).toBe(true);
    });
  });

  describe('Student Schema', () => {
    it('should accept a complete student record with first and last name', () => {
      const valid = studentSchema.safeParse({
        uid: 'ST-2026-0001',
        student_number: '2026-8-0123',
        first_name: 'Juan',
        last_name: 'Dela Cruz',
        course: 'BS Computer Science',
        year: '1st Year',
        section: 'Block 1',
        status: 'Active',
      });
      expect(valid.success).toBe(true);
    });

    it('should accept a student record without UID for auto-assignment', () => {
      const validWithoutUid = studentSchema.safeParse({
        student_number: '2026-8-0123',
        first_name: 'Maria',
        last_name: 'Clara',
        course: 'BS Computer Science',
        year: '1st Year',
        section: 'Block 2',
        status: 'Active',
      });
      expect(validWithoutUid.success).toBe(true);
    });

    it('should reject invalid or removed year levels (e.g. Alumni, 5th Year)', () => {
      const invalid = studentSchema.safeParse({
        uid: 'ST-2026-0001',
        student_number: '2026-8-0123',
        first_name: 'Juan',
        last_name: 'Dela Cruz',
        year: 'Alumni', // Alumni removed from YearLevel enum
        section: 'Block 1',
      });
      expect(invalid.success).toBe(false);
    });
  });

  describe('Event & Slot Schema', () => {
    it('should validate slot types', () => {
      const valid = eventSlotSchema.safeParse({
        label: 'Morning In',
        slot_type: 'am_in',
        opens_at: '2026-08-15T08:00:00Z',
        closes_at: '2026-08-15T09:00:00Z',
      });
      expect(valid.success).toBe(true);
    });

    it('accepts event weights from 1 through 20', () => {
      const base = {
        name: 'General Assembly',
        starts_at: '2026-08-22T08:00:00Z',
        venue: 'Gym',
        slots: [],
      };

      expect(eventSchema.safeParse({ ...base, weight: 1 }).success).toBe(true);
      expect(eventSchema.safeParse({ ...base, weight: 20 }).success).toBe(true);
      expect(eventSchema.safeParse({ ...base, weight: 0 }).success).toBe(false);
      expect(eventSchema.safeParse({ ...base, weight: 21 }).success).toBe(false);
    });

    it('rejects a late cutoff outside the slot window', () => {
      const result = eventSlotSchema.safeParse({
        label: 'Morning In',
        slot_type: 'am_in',
        opens_at: '2026-08-22T08:00:00Z',
        late_cutoff_at: '2026-08-22T07:59:59Z',
        closes_at: '2026-08-22T09:00:00Z',
        late_penalty_percent: 25,
      });

      expect(result.success).toBe(false);
    });
  });
});
