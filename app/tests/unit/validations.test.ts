import { describe, it, expect } from 'vitest';
import { loginSchema, changePasswordSchema } from '@/lib/validations/auth';
import { studentSchema } from '@/lib/validations/students';
import { eventSchema, eventSlotSchema } from '@/lib/validations/events';

describe('Validation Schemas', () => {
  describe('Login Schema', () => {
    it('should accept valid admin credentials', () => {
      const result = loginSchema.safeParse({
        role: 'admin',
        identifier: 'admin',
        password: 'admin123',
      });
      expect(result.success).toBe(true);
    });

    it('should accept valid officer credentials', () => {
      const result = loginSchema.safeParse({
        role: 'officer',
        identifier: 'Officer Name',
        password: '1234',
      });
      expect(result.success).toBe(true);
    });

    it('should reject missing identifier or password', () => {
      const emptyIdent = loginSchema.safeParse({
        role: 'officer',
        identifier: '',
        password: '1234',
      });
      expect(emptyIdent.success).toBe(false);

      const emptyPass = loginSchema.safeParse({
        role: 'officer',
        identifier: 'Officer',
        password: '',
      });
      expect(emptyPass.success).toBe(false);
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
    it('should accept a complete student record', () => {
      const valid = studentSchema.safeParse({
        uid: 'ST-2026-0001',
        student_number: '2023-8-0044',
        full_name: 'Juan Dela Cruz',
        course: 'BS Computer Science',
        year: '1st Year',
        section: '1',
        status: 'Active',
      });
      expect(valid.success).toBe(true);
    });

    it('should accept a student record without UID for auto-assignment', () => {
      const validWithoutUid = studentSchema.safeParse({
        student_number: '2023-8-0044',
        full_name: 'Maria Clara',
        course: 'BS Computer Science',
        year: '1st Year',
        section: '2',
        status: 'Active',
      });
      expect(validWithoutUid.success).toBe(true);
    });

    it('should reject invalid year levels', () => {
      const invalid = studentSchema.safeParse({
        uid: 'ST-2026-0001',
        student_number: '2023-8-0044',
        full_name: 'Juan Dela Cruz',
        year: '5th Year', // Not in enum
        section: '1',
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
