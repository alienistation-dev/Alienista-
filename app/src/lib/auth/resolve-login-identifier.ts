import bcrypt from 'bcryptjs';
import { createAdminClient, getEffectiveOrgId } from '@/lib/supabase/admin';
import { SessionUser } from '@/lib/types/actions';

const SESSION_DURATION_MS = 7 * 24 * 60 * 60 * 1000;

interface AdminLoginRow {
  id: string;
  organization_id: string;
  admin_username: string | null;
  admin_password_hash: string | null;
}

interface OfficerLoginRow {
  id: string;
  organization_id: string;
  name: string;
  pin_hash: string | null;
}

interface StudentLoginRow {
  id: string;
  organization_id: string;
  uid: string;
  student_number: string;
  full_name: string;
  last_name: string | null;
  password_hash: string | null;
  is_first_login: boolean;
}

type LoginCandidate =
  | { type: 'admin'; row: AdminLoginRow }
  | { type: 'officer'; row: OfficerLoginRow }
  | { type: 'student'; row: StudentLoginRow };

export class AmbiguousLoginIdentifierError extends Error {}
export class InvalidLoginCredentialsError extends Error {}

function buildSessionUser(
  candidate: LoginCandidate,
  organizationId: string,
  now: number
): SessionUser {
  const { row, type } = candidate;
  const id = row.id;
  const base: SessionUser = {
    id,
    subject_id: id,
    subject_type: type,
    organization_id: organizationId,
    role: type,
    name: type === 'admin' ? row.admin_username || 'Admin' : type === 'officer' ? row.name : row.full_name,
    issued_at: now,
    expires_at: now + SESSION_DURATION_MS,
  };

  if (type === 'student') {
    base.uid = row.uid;
    base.student_number = row.student_number;
    base.must_change_password = Boolean(row.is_first_login);
  }
  return base;
}

async function matchesSecret(candidate: LoginCandidate, secret: string): Promise<boolean> {
  const { row, type } = candidate;
  if (type === 'admin') {
    // No plaintext fallback — if no hash is set, require the admin to set a
    // password via the Settings page before they can log in.
    if (!row.admin_password_hash) return false;
    return await bcrypt.compare(secret, row.admin_password_hash);
  }
  if (type === 'officer') {
    if (!row.pin_hash) return false;
    return await bcrypt.compare(secret, row.pin_hash);
  }

  if (row.password_hash && await bcrypt.compare(secret, row.password_hash)) return true;
  if (!row.is_first_login) return false;
  const defaultPassword = (row.last_name || row.full_name?.split(' ').pop() || '').trim().toUpperCase();
  return secret.trim().toUpperCase() === defaultPassword;
}

export async function resolveLoginIdentifier(identifier: string, secret: string): Promise<SessionUser> {
  const normalized = identifier.trim();
  const admin = createAdminClient();
  const [adminResult, officerResult, studentNumberResult, studentUidResult] = await Promise.all([
    admin
      .from('organization_settings')
      .select('id, organization_id, admin_username, admin_password_hash')
      .ilike('admin_username', normalized)
      .limit(2),
    admin
      .from('officers')
      .select('id, organization_id, name, pin_hash, status')
      .ilike('name', normalized)
      .eq('status', 'Active')
      .limit(2),
    admin
      .from('students')
      .select('id, organization_id, uid, student_number, full_name, last_name, password_hash, is_first_login, status')
      .ilike('student_number', normalized)
      .eq('status', 'Active')
      .limit(2),
    admin
      .from('students')
      .select('id, organization_id, uid, student_number, full_name, last_name, password_hash, is_first_login, status')
      .ilike('uid', normalized)
      .eq('status', 'Active')
      .limit(2),
  ]);

  const queryError = adminResult.error || officerResult.error || studentNumberResult.error || studentUidResult.error;
  if (queryError) throw new Error('Account lookup failed.');

  const candidates = new Map<string, LoginCandidate>();
  for (const row of (adminResult.data || []) as AdminLoginRow[]) candidates.set(`admin:${row.id}`, { type: 'admin', row });
  for (const row of (officerResult.data || []) as OfficerLoginRow[]) candidates.set(`officer:${row.id}`, { type: 'officer', row });
  for (const row of [...(studentNumberResult.data || []), ...(studentUidResult.data || [])]) {
    const student = row as StudentLoginRow;
    candidates.set(`student:${student.id}`, { type: 'student', row: student });
  }

  if (candidates.size > 1) throw new AmbiguousLoginIdentifierError();
  const candidate = candidates.values().next().value as LoginCandidate | undefined;
  if (!candidate || !(await matchesSecret(candidate, secret))) throw new InvalidLoginCredentialsError();

  const organizationId = await getEffectiveOrgId(candidate.row.organization_id);
  return buildSessionUser(candidate, organizationId, Date.now());
}
