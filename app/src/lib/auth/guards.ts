import { getSessionUser } from '@/lib/session';
import { SessionUser } from '@/lib/types/actions';
import { UserRole } from '@/lib/types/models';

export async function requireSession(): Promise<SessionUser> {
  const user = await getSessionUser();
  if (!user) throw new Error('Authentication required.');
  return user;
}

export async function requireRole(...roles: UserRole[]): Promise<SessionUser> {
  const user = await requireSession();
  if (!roles.includes(user.role)) throw new Error('Insufficient permissions.');
  return user;
}
