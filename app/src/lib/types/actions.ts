import { UserRole } from './models';

export type ActionResponse<T = void> =
  | { success: true; data: T; message?: string }
  | { success: false; error: string; code?: string };

export interface SessionUser {
  id: string;
  organization_id: string;
  role: UserRole;
  name: string;
  uid?: string;
  student_number?: string;
  must_change_password?: boolean;
}
