-- Phase 3: database-backed idempotency for online and offline attendance replay.

CREATE UNIQUE INDEX IF NOT EXISTS uq_attendance_org_client_id
  ON public.attendance_records (organization_id, client_id)
  WHERE client_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_attendance_org_event_effective_scan
  ON public.attendance_records (organization_id, event_id, effective_scan_time DESC);

COMMENT ON INDEX public.uq_attendance_org_client_id IS
  'Makes a client-generated attendance scan safe to retry within its organization.';
