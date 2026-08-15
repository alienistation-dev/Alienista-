import { describe, it, expect } from 'vitest';
import { loginSchema, changePasswordSchema } from '@/lib/validations/auth';
import { studentSchema } from '@/lib/validations/students';
import { eventSlotSchema } from '@/lib/validations/events';

describe('Validation Schemas Unit Tests', () => {
  describe('Login Schema', () => {
    it('should validate admin credentials', () => {
      const result = loginSchema.safeParse({
        role: 'admin',
        identifier: 'admin',
        password: 'adminpassword',
      });
      expect(result.success).toBe(true);
    });

    it('should validate officer credentials', () => {
      const result = loginSchema.safeParse({
        role: 'officer',
        identifier: 'John Doe',
        password: '1234',
      });
      expect(result.success).toBe(true);
    });

    it('should validate student credentials with UID or Student Number', () => {
      const result = loginSchema.safeParse({
        role: 'student',
        identifier: '2026-8-0123',
        password: 'DELACRUZ',
      });
      expect(result.success).toBe(true);
    });

    it('should reject invalid role', () => {
      const result = loginSchema.safeParse({
        role: 'superadmin',
        identifier: 'admin',
        password: 'pass',
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
  });
});
