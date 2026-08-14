import { z } from 'zod';

export const studentSchema = z.object({
  uid: z.string().min(2, 'UID is required'),
  student_number: z.string().min(2, 'Student Number is required'),
  full_name: z.string().min(2, 'Full Name is required'),
  course: z.string().default('BS Computer Science'),
  year: z.enum(['1st Year', '2nd Year', '3rd Year', '4th Year', 'Alumni']),
  section: z.string().min(1, 'Section is required'),
  status: z.enum(['Active', 'Inactive', 'Alumni']).default('Active'),
});
