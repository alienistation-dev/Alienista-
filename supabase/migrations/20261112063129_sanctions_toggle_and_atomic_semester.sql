ALTER TABLE public.organization_settings
  ADD COLUMN IF NOT EXISTS sanctions_enabled boolean NOT NULL DEFAULT false;

COMMENT ON COLUMN public.organization_settings.sanctions_enabled IS
  'Organization-wide gate for calculating and finalizing sanctions; historical records are retained.';

-- Existing drafts must be recalculated once before finalization after this migration.
ALTER TABLE public.organization_settings ADD COLUMN attendance_revision bigint NOT NULL DEFAULT 1;
ALTER TABLE public.semester_assessments ADD COLUMN attendance_revision bigint NOT NULL DEFAULT 0;

CREATE OR REPLACE FUNCTION public.bump_attendance_revision()
RETURNS trigger LANGUAGE plpgsql SECURITY INVOKER SET search_path = public AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    UPDATE public.organization_settings SET attendance_revision = attendance_revision + 1
      WHERE organization_id = OLD.organization_id;
    RETURN OLD;
  END IF;
  UPDATE public.organization_settings SET attendance_revision = attendance_revision + 1
    WHERE organization_id = NEW.organization_id;
  RETURN NEW;
END;
$$;
CREATE TRIGGER attendance_revision_change AFTER INSERT OR UPDATE OR DELETE ON public.attendance_records
  FOR EACH ROW EXECUTE FUNCTION public.bump_attendance_revision();
REVOKE ALL ON FUNCTION public.bump_attendance_revision() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.bump_attendance_revision() TO service_role;

CREATE OR REPLACE FUNCTION public.guard_enabled_assessments()
RETURNS trigger LANGUAGE plpgsql SECURITY INVOKER SET search_path = public AS $$
DECLARE v_enabled boolean; v_revision bigint; v_term text;
BEGIN
  SELECT sanctions_enabled, attendance_revision, academic_year || ':' || semester::text
    INTO v_enabled, v_revision, v_term FROM public.organization_settings
    WHERE organization_id = NEW.organization_id FOR UPDATE;
  IF NEW.status IN ('draft', 'finalized') AND v_enabled IS DISTINCT FROM true THEN
    RAISE EXCEPTION 'Sanctions are disabled for this organization.';
  END IF;
  IF NEW.status IN ('draft', 'finalized') AND NEW.attendance_revision IS DISTINCT FROM v_revision THEN
    RAISE EXCEPTION 'Attendance changed. Recalculate draft assessments before finalizing.';
  END IF;
  IF NEW.status IN ('draft', 'finalized') AND NEW.term_key IS DISTINCT FROM v_term THEN
    RAISE EXCEPTION 'The academic term changed. Reload assessments before calculating or finalizing.';
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER assessment_sanctions_gate
  BEFORE INSERT OR UPDATE ON public.semester_assessments
  FOR EACH ROW EXECUTE FUNCTION public.guard_enabled_assessments();

REVOKE ALL ON FUNCTION public.guard_enabled_assessments() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.guard_enabled_assessments() TO service_role;

CREATE OR REPLACE FUNCTION public.advance_organization_semester(
  p_organization_id uuid, p_expected_academic_year text, p_expected_semester text
) RETURNS jsonb LANGUAGE plpgsql SECURITY INVOKER SET search_path = public AS $$
DECLARE
  v_settings public.organization_settings%ROWTYPE;
  v_start integer;
  v_end integer;
  v_next_year text;
BEGIN
  SELECT * INTO v_settings FROM public.organization_settings
    WHERE organization_id = p_organization_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Organization settings not found.'; END IF;
  IF v_settings.academic_year IS DISTINCT FROM p_expected_academic_year
     OR v_settings.semester::text IS DISTINCT FROM p_expected_semester THEN
    RAISE EXCEPTION 'Academic term changed. Reload settings before advancing.';
  END IF;
  IF v_settings.semester = 'First Semester' THEN
    UPDATE public.organization_settings SET semester = 'Second Semester'
      WHERE id = v_settings.id;
    RETURN jsonb_build_object('message', 'Advanced to Second Semester. Student year levels maintained.');
  END IF;
  IF v_settings.academic_year !~ '^\d{4}-\d{4}$' THEN
    RAISE EXCEPTION 'Invalid academic year. Correct organization settings before advancing.';
  END IF;
  v_start := split_part(v_settings.academic_year, '-', 1)::integer;
  v_end := split_part(v_settings.academic_year, '-', 2)::integer;
  IF v_end <> v_start + 1 THEN RAISE EXCEPTION 'Academic year must contain consecutive years.'; END IF;
  v_next_year := (v_start + 1)::text || '-' || (v_end + 1)::text;

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

REVOKE ALL ON FUNCTION public.advance_organization_semester(uuid, text, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.advance_organization_semester(uuid, text, text) TO service_role;

CREATE OR REPLACE FUNCTION public.finalize_semester_assessment(
  p_assessment_id uuid, p_organization_id uuid, p_admin_id uuid
) RETURNS jsonb LANGUAGE plpgsql SECURITY INVOKER SET search_path = public AS $$
DECLARE v_assessment public.semester_assessments;
BEGIN
  IF p_admin_id IS NULL THEN RAISE EXCEPTION 'An administrator is required.'; END IF;
  -- Match attendance correction lock order: organization settings, then assessment.
  PERFORM id FROM public.organization_settings WHERE organization_id = p_organization_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Organization settings are unavailable.'; END IF;
  UPDATE public.semester_assessments SET status = 'finalized', finalized_at = now(), finalized_by = p_admin_id
    WHERE id = p_assessment_id AND organization_id = p_organization_id AND status = 'draft'
    RETURNING * INTO v_assessment;
  IF NOT FOUND THEN RETURN NULL; END IF;
  RETURN to_jsonb(v_assessment);
END;
$$;
REVOKE ALL ON FUNCTION public.finalize_semester_assessment(uuid, uuid, uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.finalize_semester_assessment(uuid, uuid, uuid) TO service_role;

CREATE OR REPLACE FUNCTION public.save_draft_semester_assessment(p_organization_id uuid, p_values jsonb)
RETURNS jsonb LANGUAGE plpgsql SECURITY INVOKER SET search_path = public AS $$
DECLARE v_assessment public.semester_assessments;
BEGIN
  -- Use the same lock order as corrections and finalization, including conflict updates.
  PERFORM id FROM public.organization_settings WHERE organization_id = p_organization_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Organization settings are unavailable.'; END IF;
  INSERT INTO public.semester_assessments (
    organization_id, student_id, term_key, policy_id, policy_version, status,
    maximum_points, earned_points, missed_points, attendance_ratio,
    tier_label, tier_threshold, obligation_text, contributions, attendance_revision
  ) VALUES (
    p_organization_id, (p_values->>'student_id')::uuid, p_values->>'term_key',
    (p_values->>'policy_id')::uuid, (p_values->>'policy_version')::integer, 'draft',
    (p_values->>'maximum_points')::numeric, (p_values->>'earned_points')::numeric,
    (p_values->>'missed_points')::numeric, (p_values->>'attendance_ratio')::numeric,
    p_values->>'tier_label', p_values->>'tier_threshold', p_values->>'obligation_text',
    p_values->'contributions', (p_values->>'attendance_revision')::bigint
  ) ON CONFLICT (organization_id, student_id, term_key) DO UPDATE SET
    policy_id = EXCLUDED.policy_id, policy_version = EXCLUDED.policy_version, status = 'draft',
    maximum_points = EXCLUDED.maximum_points, earned_points = EXCLUDED.earned_points,
    missed_points = EXCLUDED.missed_points, attendance_ratio = EXCLUDED.attendance_ratio,
    tier_label = EXCLUDED.tier_label, tier_threshold = EXCLUDED.tier_threshold,
    obligation_text = EXCLUDED.obligation_text, contributions = EXCLUDED.contributions,
    attendance_revision = EXCLUDED.attendance_revision
    RETURNING * INTO v_assessment;
  RETURN to_jsonb(v_assessment);
END;
$$;
REVOKE ALL ON FUNCTION public.save_draft_semester_assessment(uuid, jsonb) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.save_draft_semester_assessment(uuid, jsonb) TO service_role;
