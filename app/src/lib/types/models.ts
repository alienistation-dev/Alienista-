export type UserRole = 'admin' | 'officer' | 'student';
export type MemberStatus = 'Active' | 'Inactive';
export type EventStatus = 'Open' | 'Closed';
export type SlotType = 'am_in' | 'am_out' | 'pm_in' | 'pm_out' | 'other';
export type SlotStatus = 'upcoming' | 'active' | 'closed';
export type SemesterType = 'First Semester' | 'Second Semester';
export type YearLevel = '1st Year' | '2nd Year' | '3rd Year' | '4th Year';
export type SyncStatus = 'pending_offline' | 'synced' | 'duplicate' | 'invalid' | 'error';

export interface Organization {
  id: string;
  name: string;
  slug: string;
  created_at: string;
}

export interface Profile {
  id: string;
  organization_id: string;
  role: UserRole;
  display_name: string | null;
  created_at: string;
  updated_at: string;
}

export interface Student {
  id: string;
  organization_id: string;
  uid: string;
  student_number: string;
  first_name?: string;
  last_name?: string;
  full_name: string;
  course: string;
  year: YearLevel;
  section: string;
  status: MemberStatus;
  is_first_login: boolean;
  avatar_url: string | null;
  created_at: string;
  updated_at: string;
}

export interface Officer {
  id: string;
  organization_id: string;
  name: string;
  status: MemberStatus;
  created_at: string;
  updated_at: string;
}

export interface EventSlot {
  id: string;
  organization_id: string;
  event_id: string;
  label: string;
  slot_type: SlotType;
  opens_at: string;
  closes_at: string;
  status: SlotStatus;
  created_at: string;
}

export interface Event {
  id: string;
  organization_id: string;
  name: string;
  starts_at: string;
  venue: string;
  description: string;
  status: EventStatus;
  created_by_officer_id?: string | null;
  slots?: EventSlot[];
  created_at: string;
  updated_at: string;
}

export interface AttendanceRecord {
  id: string;
  organization_id: string;
  student_id: string;
  event_id: string;
  slot_id: string | null;
  officer_id: string | null;
  officer_name: string | null;
  client_id: string | null;
  recorded_at: string;
  student?: Student;
  event?: Event;
  slot?: EventSlot;
}

export interface OrganizationSettings {
  id: string;
  organization_id: string;
  academic_year: string;
  semester: SemesterType;
  admin_username?: string;
  updated_at: string;
}

export interface DashboardStats {
  total_students: number;
  active_students: number;
  total_events: number;
  open_events: number;
  total_attendance: number;
  overall_attendance_pct: number;
}
