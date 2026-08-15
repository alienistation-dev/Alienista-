import { z } from 'zod';

export const studentSchema = z.object({
  uid: z.string().optional().or(z.literal('')),
  student_number: z.string().min(2, 'Student Number is required'),
  first_name: z.string().min(1, 'First Name is required'),
  last_name: z.string().min(1, 'Last Name is required'),
  full_name: z.string().optional(),
  course: z.string().default('BS Computer Science'),
  year: z.enum(['1st Year', '2nd Year', '3rd Year', '4th Year']),
  section: z.string().min(1, 'Block is required'),
  status: z.enum(['Active', 'Inactive']).default('Active'),
});
