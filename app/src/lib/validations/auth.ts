import { z } from 'zod';

export const loginSchema = z.object({
  role: z.enum(['admin', 'officer', 'student']),
  identifier: z.string().min(1, 'Username, Officer Name, or Student UID is required'),
  password: z.string().min(1, 'Password or PIN is required'),
});

export const changePasswordSchema = z.object({
  identifier: z.string().min(1),
  currentPassword: z.string().min(1, 'Current password is required'),
  newPassword: z.string().min(6, 'New password must be at least 6 characters'),
});
