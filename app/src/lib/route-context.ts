import { cache } from 'react';
import { getSessionUser } from '@/lib/session';
import { createAdminClient, getEffectiveOrgId } from '@/lib/supabase/admin';
import type { SessionUser } from '@/lib/types/actions';

export interface RouteRequestContext {
  user: SessionUser;
  organizationId: string;
  admin: ReturnType<typeof createAdminClient>;
}

export const getRouteRequestContext = cache(async (): Promise<RouteRequestContext | null> => {
  const user = await getSessionUser();
  if (!user) return null;
  const organizationId = await getEffectiveOrgId(user.organization_id);
  return { user, organizationId, admin: createAdminClient() };
});
