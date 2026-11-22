-- Reconciles the Nov 2026 sprint guards onto the live 20260830 correction functions.
-- Signatures and return types are unchanged, so CREATE OR REPLACE swaps the bodies in place.
-- Corrections now require the event's term to be the active term and the student to have no
-- finalized/corrected assessment for that term. Penalties are forced to 0 unless the status is late.
-- The organization settings row is locked first so corrections serialize with term advancement.

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
  active_term TEXT;
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

  SELECT academic_year || ':' || semester::TEXT INTO active_term
  FROM public.organization_settings
  WHERE organization_id = p_organization_id
  FOR UPDATE;
  IF active_term IS NULL THEN RAISE EXCEPTION 'Organization term settings are unavailable.'; END IF;

  SELECT * INTO current_row
  FROM public.attendance_records
  WHERE id = p_record_id AND organization_id = p_organization_id
  FOR UPDATE;
  IF current_row.id IS NULL THEN RAISE EXCEPTION 'Attendance record not found in this organization.'; END IF;

  SELECT * INTO event_row
  FROM public.events
  WHERE id = current_row.event_id AND organization_id = p_organization_id;
  IF event_row.id IS NULL THEN RAISE EXCEPTION 'Attendance event not found in this organization.'; END IF;
  IF event_row.term_key IS DISTINCT FROM active_term THEN
    RAISE EXCEPTION 'Only attendance in the active semester can be corrected.';
  END IF;
  IF EXISTS (
    SELECT 1 FROM public.semester_assessments
    WHERE organization_id = p_organization_id
      AND student_id = current_row.student_id
      AND term_key = event_row.term_key
      AND status IN ('finalized', 'corrected')
  ) THEN
    RAISE EXCEPTION 'This student''s assessment is finalized. Use an assessment correction instead.';
  END IF;

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
      late_penalty_percent = CASE WHEN p_attendance_status = 'late' THEN p_late_penalty_percent ELSE 0 END,
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
  active_term TEXT;
BEGIN
  IF COALESCE(trim(p_reason), '') = '' THEN RAISE EXCEPTION 'Correction reason is required.'; END IF;

  SELECT academic_year || ':' || semester::TEXT INTO active_term
  FROM public.organization_settings
  WHERE organization_id = p_organization_id
  FOR UPDATE;
  IF active_term IS NULL THEN RAISE EXCEPTION 'Organization term settings are unavailable.'; END IF;

  SELECT * INTO current_row
  FROM public.attendance_records
  WHERE id = p_record_id AND organization_id = p_organization_id
  FOR UPDATE;
  IF current_row.id IS NULL THEN RAISE EXCEPTION 'Attendance record not found in this organization.'; END IF;

  SELECT term_key INTO event_term_key
  FROM public.events
  WHERE id = current_row.event_id AND organization_id = p_organization_id;
  IF event_term_key IS DISTINCT FROM active_term THEN
    RAISE EXCEPTION 'Only attendance in the active semester can be corrected.';
  END IF;
  IF EXISTS (
    SELECT 1 FROM public.semester_assessments
    WHERE organization_id = p_organization_id
      AND student_id = current_row.student_id
      AND term_key = event_term_key
      AND status IN ('finalized', 'corrected')
  ) THEN
    RAISE EXCEPTION 'This student''s assessment is finalized. Use an assessment correction instead.';
  END IF;

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

-- Replaces the parallel per-year UPDATEs in advanceSemesterAction, which could promote a student
-- twice (1st -> 2nd -> 3rd) or deactivate a just-promoted 4th year. One locked transaction with
-- an expected-term check also makes a double submit advance only once.
CREATE OR REPLACE FUNCTION public.advance_organization_semester(
  p_organization_id UUID, p_expected_academic_year TEXT, p_expected_semester TEXT
) RETURNS JSONB LANGUAGE plpgsql SECURITY INVOKER SET search_path = public AS $$
DECLARE
  v_settings public.organization_settings%ROWTYPE;
  v_start INTEGER;
  v_end INTEGER;
  v_next_year TEXT;
BEGIN
  SELECT * INTO v_settings FROM public.organization_settings
    WHERE organization_id = p_organization_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Organization settings not found.'; END IF;
  IF v_settings.academic_year IS DISTINCT FROM p_expected_academic_year
     OR v_settings.semester::TEXT IS DISTINCT FROM p_expected_semester THEN
    RAISE EXCEPTION 'Academic term changed. Reload settings before advancing.';
  END IF;
  IF v_settings.semester = 'First Semester' THEN
    UPDATE public.organization_settings SET semester = 'Second Semester' WHERE id = v_settings.id;
    RETURN jsonb_build_object('message', 'Advanced to Second Semester. Student year levels maintained.');
  END IF;
  IF v_settings.academic_year !~ '^\d{4}-\d{4}$' THEN
    RAISE EXCEPTION 'Invalid academic year. Correct organization settings before advancing.';
  END IF;
  v_start := split_part(v_settings.academic_year, '-', 1)::INTEGER;
  v_end := split_part(v_settings.academic_year, '-', 2)::INTEGER;
  IF v_end <> v_start + 1 THEN RAISE EXCEPTION 'Academic year must contain consecutive years.'; END IF;
  v_next_year := (v_start + 1)::TEXT || '-' || (v_end + 1)::TEXT;

  -- One statement evaluates every CASE against the original row, preventing repeated promotion.
  UPDATE public.students SET
    year = CASE year
      WHEN '1st Year' THEN '2nd Year'::public.year_level
      WHEN '2nd Year' THEN '3rd Year'::public.year_level
      WHEN '3rd Year' THEN '4th Year'::public.year_level
      ELSE year END,
    status = CASE WHEN year = '4th Year' THEN 'Inactive'::public.member_status ELSE status END
    WHERE organization_id = p_organization_id AND status = 'Active';
  UPDATE public.organization_settings SET academic_year = v_next_year, semester = 'First Semester'
    WHERE id = v_settings.id;
  RETURN jsonb_build_object('message', 'Started Academic Year ' || v_next_year || ' (First Semester). Students promoted successfully.');
END;
$$;

REVOKE ALL ON FUNCTION public.update_attendance_record(UUID, UUID, UUID, UUID, TIMESTAMPTZ, TEXT, NUMERIC, NUMERIC, TEXT) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.delete_attendance_record(UUID, UUID, UUID, TEXT) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.advance_organization_semester(UUID, TEXT, TEXT) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.update_attendance_record(UUID, UUID, UUID, UUID, TIMESTAMPTZ, TEXT, NUMERIC, NUMERIC, TEXT) TO service_role;
GRANT EXECUTE ON FUNCTION public.delete_attendance_record(UUID, UUID, UUID, TEXT) TO service_role;
GRANT EXECUTE ON FUNCTION public.advance_organization_semester(UUID, TEXT, TEXT) TO service_role;
