ALTER TABLE public.attendance_records
  ADD COLUMN earned_points_override NUMERIC(10,2),
  ADD CONSTRAINT attendance_records_earned_points_override_nonnegative
    CHECK (earned_points_override IS NULL OR earned_points_override >= 0);

CREATE TABLE public.attendance_record_corrections (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  attendance_record_id UUID NOT NULL,
  student_id UUID NOT NULL,
  event_id UUID NOT NULL,
  action TEXT NOT NULL CHECK (action IN ('update', 'delete')),
  corrected_by UUID NOT NULL,
  reason TEXT NOT NULL CHECK (trim(reason) <> ''),
  before_snapshot JSONB NOT NULL,
  after_snapshot JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CHECK ((action = 'update' AND after_snapshot IS NOT NULL)
      OR (action = 'delete' AND after_snapshot IS NULL))
);

CREATE INDEX attendance_record_corrections_student_idx
  ON public.attendance_record_corrections (organization_id, student_id, created_at DESC);
CREATE INDEX attendance_record_corrections_record_idx
  ON public.attendance_record_corrections (organization_id, attendance_record_id, created_at DESC);

ALTER TABLE public.attendance_record_corrections ENABLE ROW LEVEL SECURITY;

CREATE OR REPLACE FUNCTION public.prevent_attendance_correction_mutation()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  RAISE EXCEPTION 'Attendance correction audit records are immutable.';
END;
$$;

CREATE TRIGGER attendance_record_corrections_immutable
  BEFORE UPDATE OR DELETE ON public.attendance_record_corrections
  FOR EACH ROW EXECUTE FUNCTION public.prevent_attendance_correction_mutation();

CREATE OR REPLACE FUNCTION public.update_attendance_record(
  p_record_id UUID,
  p_organization_id UUID,
  p_corrected_by UUID,
  p_slot_id UUID,
  p_effective_scan_time TIMESTAMPTZ,
  p_attendance_status TEXT,
  p_late_penalty_percent NUMERIC,
  p_earned_points_override NUMERIC,
  p_reason TEXT
)
RETURNS public.attendance_records
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $$
DECLARE
  current_row public.attendance_records;
  updated_row public.attendance_records;
  event_row public.events;
  required_slot_count INTEGER;
  maximum_slot_points NUMERIC;
BEGIN
  IF COALESCE(trim(p_reason), '') = '' THEN RAISE EXCEPTION 'Correction reason is required.'; END IF;
  IF p_effective_scan_time IS NULL THEN RAISE EXCEPTION 'Effective scan time is required.'; END IF;
  IF p_attendance_status NOT IN ('on_time', 'late', 'manual') THEN RAISE EXCEPTION 'Invalid attendance status.'; END IF;
  IF p_late_penalty_percent IS NULL OR p_late_penalty_percent < 0 OR p_late_penalty_percent > 100 THEN
    RAISE EXCEPTION 'Late penalty must be between 0 and 100.';
  END IF;
  IF p_earned_points_override IS NOT NULL AND p_earned_points_override < 0 THEN
    RAISE EXCEPTION 'Awarded points cannot be negative.';
  END IF;

  SELECT * INTO current_row
  FROM public.attendance_records
  WHERE id = p_record_id AND organization_id = p_organization_id
  FOR UPDATE;
  IF current_row.id IS NULL THEN RAISE EXCEPTION 'Attendance record not found in this organization.'; END IF;

  SELECT * INTO event_row
  FROM public.events
  WHERE id = current_row.event_id AND organization_id = p_organization_id;
  IF event_row.id IS NULL THEN RAISE EXCEPTION 'Attendance event not found in this organization.'; END IF;

  IF p_slot_id IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM public.event_slots
    WHERE id = p_slot_id
      AND event_id = current_row.event_id
      AND organization_id = p_organization_id
  ) THEN
    RAISE EXCEPTION 'Selected slot does not belong to this attendance event.';
  END IF;

  SELECT COUNT(*) INTO required_slot_count
  FROM public.event_slots
  WHERE event_id = current_row.event_id
    AND organization_id = p_organization_id
    AND is_required;
  maximum_slot_points := event_row.weight / GREATEST(required_slot_count, 1);
  IF p_earned_points_override IS NOT NULL AND p_earned_points_override > maximum_slot_points THEN
    RAISE EXCEPTION 'Awarded points cannot exceed the slot maximum of %.', maximum_slot_points;
  END IF;

  UPDATE public.attendance_records
  SET slot_id = p_slot_id,
      effective_scan_time = p_effective_scan_time,
      attendance_status = p_attendance_status,
      late_penalty_percent = p_late_penalty_percent,
      earned_points_override = p_earned_points_override
  WHERE id = current_row.id
  RETURNING * INTO updated_row;

  INSERT INTO public.attendance_record_corrections (
    organization_id, attendance_record_id, student_id, event_id, action,
    corrected_by, reason, before_snapshot, after_snapshot
  ) VALUES (
    p_organization_id, current_row.id, current_row.student_id, current_row.event_id, 'update',
    p_corrected_by, trim(p_reason), to_jsonb(current_row), to_jsonb(updated_row)
  );

  DELETE FROM public.semester_assessments
  WHERE organization_id = p_organization_id
    AND student_id = current_row.student_id
    AND term_key = event_row.term_key
    AND status = 'draft';

  RETURN updated_row;
END;
$$;

CREATE OR REPLACE FUNCTION public.delete_attendance_record(
  p_record_id UUID,
  p_organization_id UUID,
  p_corrected_by UUID,
  p_reason TEXT
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $$
DECLARE
  current_row public.attendance_records;
  event_term_key TEXT;
BEGIN
  IF COALESCE(trim(p_reason), '') = '' THEN RAISE EXCEPTION 'Correction reason is required.'; END IF;

  SELECT * INTO current_row
  FROM public.attendance_records
  WHERE id = p_record_id AND organization_id = p_organization_id
  FOR UPDATE;
  IF current_row.id IS NULL THEN RAISE EXCEPTION 'Attendance record not found in this organization.'; END IF;

  SELECT term_key INTO event_term_key
  FROM public.events
  WHERE id = current_row.event_id AND organization_id = p_organization_id;

  INSERT INTO public.attendance_record_corrections (
    organization_id, attendance_record_id, student_id, event_id, action,
    corrected_by, reason, before_snapshot, after_snapshot
  ) VALUES (
    p_organization_id, current_row.id, current_row.student_id, current_row.event_id, 'delete',
    p_corrected_by, trim(p_reason), to_jsonb(current_row), NULL
  );

  DELETE FROM public.attendance_records WHERE id = current_row.id;

  DELETE FROM public.semester_assessments
  WHERE organization_id = p_organization_id
    AND student_id = current_row.student_id
    AND term_key = event_term_key
    AND status = 'draft';
END;
$$;

REVOKE ALL ON TABLE public.attendance_record_corrections FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.prevent_attendance_correction_mutation() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.update_attendance_record(UUID, UUID, UUID, UUID, TIMESTAMPTZ, TEXT, NUMERIC, NUMERIC, TEXT) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.delete_attendance_record(UUID, UUID, UUID, TEXT) FROM PUBLIC, anon, authenticated;

GRANT SELECT, INSERT ON TABLE public.attendance_record_corrections TO service_role;
GRANT EXECUTE ON FUNCTION public.update_attendance_record(UUID, UUID, UUID, UUID, TIMESTAMPTZ, TEXT, NUMERIC, NUMERIC, TEXT) TO service_role;
GRANT EXECUTE ON FUNCTION public.delete_attendance_record(UUID, UUID, UUID, TEXT) TO service_role;
