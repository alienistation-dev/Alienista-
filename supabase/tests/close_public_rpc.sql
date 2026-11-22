-- Run with psql -v ON_ERROR_STOP=1 against an isolated database after all migrations.
-- Covers 20261123090000_close_public_rpc_and_signup_trigger.sql.
BEGIN;
DO $$
DECLARE
  sig TEXT := 'public.correct_semester_assessment(uuid,uuid,uuid,text,jsonb)';
  org_id UUID := gen_random_uuid(); student_id UUID := gen_random_uuid();
  policy_id UUID := gen_random_uuid(); v_assessment UUID := gen_random_uuid(); admin_id UUID := gen_random_uuid();
  corrected public.semester_assessments;
BEGIN
  ASSERT NOT has_function_privilege('anon', sig, 'EXECUTE'), 'anon may execute correct_semester_assessment';
  ASSERT NOT has_function_privilege('authenticated', sig, 'EXECUTE'), 'authenticated may execute correct_semester_assessment';
  ASSERT has_function_privilege('service_role', sig, 'EXECUTE'), 'service_role lost correct_semester_assessment';
  ASSERT NOT (SELECT prosecdef FROM pg_proc WHERE oid = sig::regprocedure), 'correct_semester_assessment is still SECURITY DEFINER';
  ASSERT NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'on_auth_user_created'), 'signup trigger still exists';
  ASSERT to_regprocedure('public.handle_new_user()') IS NULL, 'handle_new_user still exists';

  -- The service-role path still corrects a finalized assessment and audits it.
  INSERT INTO public.organizations(id, name, slug) VALUES (org_id, 'Close RPC', org_id::TEXT);
  UPDATE public.organization_settings SET sanctions_enabled = true, academic_year = '2026-2027', semester = 'First Semester'
    WHERE organization_id = org_id;
  INSERT INTO public.students(id, organization_id, uid, student_number, full_name, section)
    VALUES (student_id, org_id, 'CLOSE-1', 'CLOSE-1', 'Close Student', '1');
  INSERT INTO public.sanction_policies(id, organization_id, name, version, mode, is_active)
    VALUES (policy_id, org_id, 'P', 1, 'weighted_missed_points', true);
  INSERT INTO public.semester_assessments(id, organization_id, student_id, term_key, policy_id, policy_version,
      maximum_points, earned_points, missed_points, attendance_ratio, status, finalized_at, finalized_by, attendance_revision)
    SELECT v_assessment, org_id, student_id, '2026-2027:First Semester', policy_id, 1, 10, 5, 5, 0.5, 'finalized', now(), admin_id,
      attendance_revision FROM public.organization_settings WHERE organization_id = org_id;

  SET LOCAL ROLE service_role;
  corrected := public.correct_semester_assessment(v_assessment, org_id, admin_id, 'Officer error', '{"earned_points": 8}'::jsonb);
  RESET ROLE;
  ASSERT corrected.status = 'corrected' AND corrected.earned_points = 8, 'service-role correction failed';
  ASSERT (SELECT count(*) FROM public.semester_assessment_corrections WHERE assessment_id = corrected.id) = 1, 'correction not audited';
END;
$$;
ROLLBACK;
