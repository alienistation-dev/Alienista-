-- Run with psql -v ON_ERROR_STOP=1 against an isolated database after all migrations.
-- Covers 20261122130000_reconcile_attendance_and_semester_guards.sql.
BEGIN;
DO $$
DECLARE
  org_id UUID := gen_random_uuid(); other_org UUID := gen_random_uuid();
  student_id UUID := gen_random_uuid(); senior_id UUID := gen_random_uuid();
  event_id UUID := gen_random_uuid(); record_id UUID := gen_random_uuid();
  admin_id UUID := gen_random_uuid(); policy_id UUID := gen_random_uuid();
  assessment_id UUID := gen_random_uuid();
  updated public.attendance_records;
BEGIN
  INSERT INTO public.organizations(id, name, slug) VALUES (org_id, 'Reconcile guards', org_id::TEXT), (other_org, 'Other tenant', other_org::TEXT);
  UPDATE public.organization_settings SET academic_year = '2026-2027', semester = 'First Semester' WHERE organization_id = org_id;
  INSERT INTO public.students(id, organization_id, uid, student_number, full_name, section, year)
    VALUES (student_id, org_id, 'RECONCILE-1', 'RECONCILE-1', 'First Year', 'Block 1', '1st Year'),
           (senior_id, org_id, 'RECONCILE-4', 'RECONCILE-4', 'Fourth Year', 'Block 1', '4th Year');
  INSERT INTO public.events(id, organization_id, name, starts_at, venue, term_key)
    VALUES (event_id, org_id, 'Reconcile regression', now(), 'Test', '2026-2027:First Semester');
  INSERT INTO public.attendance_records(id, organization_id, student_id, event_id, attendance_status, late_penalty_percent)
    VALUES (record_id, org_id, student_id, event_id, 'late', 25);
  INSERT INTO public.sanction_policies(id, organization_id, name, version, mode, is_active)
    VALUES (policy_id, org_id, 'Test policy', 1, 'weighted_missed_points', true);

  SET LOCAL ROLE service_role;

  -- Cross-tenant calls still fail.
  BEGIN
    PERFORM public.delete_attendance_record(record_id, other_org, admin_id, 'wrong tenant');
    RAISE EXCEPTION 'Cross-tenant delete accepted';
  EXCEPTION WHEN raise_exception THEN
    IF SQLERRM = 'Cross-tenant delete accepted' THEN RAISE; END IF;
  END;

  -- main's dialog sends the old penalty when switching away from late; it is normalized, not rejected.
  updated := public.update_attendance_record(record_id, org_id, admin_id, NULL, now(), 'on_time', 25, NULL, 'Scanner clock was wrong');
  ASSERT updated.attendance_status = 'on_time', 'Status was not changed';
  ASSERT updated.late_penalty_percent = 0, 'Non-late status kept a penalty';
  updated := public.update_attendance_record(record_id, org_id, admin_id, NULL, now(), 'late', 40, NULL, 'Arrived late after all');
  ASSERT updated.late_penalty_percent = 40, 'Late penalty was not stored';

  -- Finalized assessments block both update and delete.
  -- The live 20261112063129 trigger requires sanctions enabled and a matching attendance revision.
  RESET ROLE;
  UPDATE public.organization_settings SET sanctions_enabled = true WHERE organization_id = org_id;
  INSERT INTO public.semester_assessments(id, organization_id, student_id, term_key, policy_id, policy_version,
      maximum_points, earned_points, missed_points, attendance_ratio, status, finalized_at, finalized_by, attendance_revision)
    SELECT assessment_id, org_id, student_id, '2026-2027:First Semester', policy_id, 1, 1, 1, 0, 1, 'finalized', now(), admin_id,
      attendance_revision FROM public.organization_settings WHERE organization_id = org_id;
  SET LOCAL ROLE service_role;
  BEGIN
    PERFORM public.update_attendance_record(record_id, org_id, admin_id, NULL, now(), 'on_time', 0, NULL, 'After finalization');
    RAISE EXCEPTION 'Finalized update accepted';
  EXCEPTION WHEN raise_exception THEN
    IF SQLERRM NOT LIKE '%assessment is finalized%' THEN RAISE; END IF;
  END;
  BEGIN
    PERFORM public.delete_attendance_record(record_id, org_id, admin_id, 'After finalization');
    RAISE EXCEPTION 'Finalized delete accepted';
  EXCEPTION WHEN raise_exception THEN
    IF SQLERRM NOT LIKE '%assessment is finalized%' THEN RAISE; END IF;
  END;
  RESET ROLE;
  DELETE FROM public.semester_assessments WHERE id = assessment_id;

  -- Past-term attendance cannot be corrected.
  UPDATE public.events SET term_key = '2025-2026:First Semester' WHERE id = event_id;
  SET LOCAL ROLE service_role;
  BEGIN
    PERFORM public.delete_attendance_record(record_id, org_id, admin_id, 'Old term');
    RAISE EXCEPTION 'Past-term delete accepted';
  EXCEPTION WHEN raise_exception THEN
    IF SQLERRM <> 'Only attendance in the active semester can be corrected.' THEN RAISE; END IF;
  END;
  RESET ROLE;
  UPDATE public.events SET term_key = '2026-2027:First Semester' WHERE id = event_id;
  SET LOCAL ROLE service_role;

  PERFORM public.delete_attendance_record(record_id, org_id, admin_id, 'Duplicate scan');
  ASSERT NOT EXISTS (SELECT 1 FROM public.attendance_records WHERE id = record_id), 'Deleted record remains';
  ASSERT (SELECT count(*) FROM public.attendance_record_corrections WHERE organization_id = org_id) = 3, 'Audit rows missing';

  -- Semester advance: stale term rejected, one promotion per student, seniors deactivated not skipped.
  BEGIN
    PERFORM public.advance_organization_semester(org_id, '2026-2027', 'Second Semester');
    RAISE EXCEPTION 'Stale term accepted';
  EXCEPTION WHEN raise_exception THEN
    IF SQLERRM <> 'Academic term changed. Reload settings before advancing.' THEN RAISE; END IF;
  END;
  PERFORM public.advance_organization_semester(org_id, '2026-2027', 'First Semester');
  PERFORM public.advance_organization_semester(org_id, '2026-2027', 'Second Semester');
  ASSERT (SELECT academic_year || ':' || semester::TEXT FROM public.organization_settings WHERE organization_id = org_id)
    = '2027-2028:First Semester', 'Term did not roll over';
  ASSERT (SELECT year::TEXT FROM public.students WHERE id = student_id) = '2nd Year', 'First year promoted more than once';
  ASSERT (SELECT status::TEXT FROM public.students WHERE id = senior_id) = 'Inactive', 'Fourth year was not deactivated';
  BEGIN
    PERFORM public.advance_organization_semester(org_id, '2026-2027', 'Second Semester');
    RAISE EXCEPTION 'Double advance accepted';
  EXCEPTION WHEN raise_exception THEN
    IF SQLERRM <> 'Academic term changed. Reload settings before advancing.' THEN RAISE; END IF;
  END;
  RESET ROLE;

  ASSERT NOT has_function_privilege('anon', 'public.advance_organization_semester(uuid,text,text)', 'EXECUTE'), 'Anon may advance terms';
  ASSERT NOT has_function_privilege('authenticated', 'public.advance_organization_semester(uuid,text,text)', 'EXECUTE'), 'Authenticated may advance terms';
  ASSERT NOT has_function_privilege('anon', 'public.update_attendance_record(uuid,uuid,uuid,uuid,timestamptz,text,numeric,numeric,text)', 'EXECUTE'), 'Anon may correct attendance';
  ASSERT has_function_privilege('service_role', 'public.delete_attendance_record(uuid,uuid,uuid,text)', 'EXECUTE'), 'Service role lost delete';
END;
$$;
ROLLBACK;
