import { UserRole } from './models';

export type ActionResponse<T = void> =
  | { success: true; data: T; message?: string }
  | { success: false; error: string; code?: string };

export type SessionSubject = UserRole;

export interface SessionUser {
  id: string;
  subject_id: string;
  subject_type: SessionSubject;
  organization_id: string;
  role: UserRole;
  name: string;
  issued_at: number;
  expires_at: number;
  uid?: string;
  student_number?: string;
  must_change_password?: boolean;
}
