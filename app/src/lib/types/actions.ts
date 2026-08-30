import { AttendanceStatus, MemberStatus, SanctionPolicyMode, UserRole, YearLevel } from './models';

export type ActionResponse<T = void> =
  | { success: true; data: T; message?: string }
  | { success: false; error: string; code?: string };

export interface PageRequest {
  page: number;
  pageSize: number;
  query?: string;
  year?: YearLevel;
  status?: MemberStatus;
}

export interface PaginatedResult<T> {
  items: T[];
  total: number;
  page: number;
  pageSize: number;
}

export interface AttendanceCorrectionInput {
  record_id: string;
  slot_id: string | null;
  effective_scan_time: string;
  attendance_status: AttendanceStatus;
  late_penalty_percent: number;
  earned_points_override: number | null;
  reason: string;
}

export interface SanctionPolicyTierInput {
  label: string;
  threshold: number;
  obligation_text: string;
}

export interface SanctionPolicyVersionInput {
  name: string;
  mode: SanctionPolicyMode;
  tiers: SanctionPolicyTierInput[];
  activate: boolean;
}

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
