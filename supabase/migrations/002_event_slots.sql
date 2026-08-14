-- =============================================================================
-- 002_event_slots.sql
-- Alienista Attendance System — Event Attendance Slots & Enhanced Constraints
-- =============================================================================

-- 1. Create slot enums
CREATE TYPE slot_type AS ENUM ('am_in', 'am_out', 'pm_in', 'pm_out', 'other');
CREATE TYPE slot_status AS ENUM ('upcoming', 'active', 'closed');

-- 2. Create event_slots table
CREATE TABLE IF NOT EXISTS event_slots (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  event_id        UUID NOT NULL REFERENCES events(id) ON DELETE CASCADE,
  label           TEXT NOT NULL,
  slot_type       slot_type NOT NULL DEFAULT 'other',
  opens_at        TIMESTAMPTZ NOT NULL,
  closes_at       TIMESTAMPTZ NOT NULL,
  status          slot_status NOT NULL DEFAULT 'upcoming',
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT valid_slot_window CHECK (closes_at > opens_at)
);

CREATE INDEX IF NOT EXISTS idx_event_slots_event ON event_slots(organization_id, event_id);
CREATE INDEX IF NOT EXISTS idx_event_slots_window ON event_slots(opens_at, closes_at);

-- 3. Enable RLS on event_slots
ALTER TABLE event_slots ENABLE ROW LEVEL SECURITY;

CREATE POLICY "event_slots_admin_all" ON event_slots FOR ALL
  USING (get_my_role() = 'admin' AND organization_id = get_my_org_id())
  WITH CHECK (get_my_role() = 'admin' AND organization_id = get_my_org_id());

CREATE POLICY "event_slots_officer_select" ON event_slots FOR SELECT
  USING (get_my_role() = 'officer' AND organization_id = get_my_org_id());

CREATE POLICY "event_slots_student_select" ON event_slots FOR SELECT
  USING (get_my_role() = 'student' AND organization_id = get_my_org_id());

-- 4. Update attendance_records & offline_scan_queue
ALTER TABLE attendance_records ADD COLUMN IF NOT EXISTS slot_id UUID REFERENCES event_slots(id) ON DELETE SET NULL;
ALTER TABLE offline_scan_queue ADD COLUMN IF NOT EXISTS slot_id UUID REFERENCES event_slots(id) ON DELETE SET NULL;

-- 5. Upgrade unique constraint to slot-aware unique constraint
ALTER TABLE attendance_records DROP CONSTRAINT IF EXISTS uq_attendance_student_event;
CREATE UNIQUE INDEX IF NOT EXISTS uq_attendance_student_event_slot 
  ON attendance_records(student_id, event_id, COALESCE(slot_id, '00000000-0000-0000-0000-000000000000'));
