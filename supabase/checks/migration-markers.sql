-- Read-only. Shows which migrations are present in a database by checking one object each creates.
-- Use before `supabase migration repair` on a database whose migrations were applied by hand.
SELECT m.version, m.marker, m.present FROM (VALUES
  ('001',            'table attendance_records',                 to_regclass('public.attendance_records') IS NOT NULL),
  ('002',            'table event_slots',                        to_regclass('public.event_slots') IS NOT NULL),
  ('003',            'column organization_settings.admin_password_hash',
     EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'organization_settings' AND column_name = 'admin_password_hash')),
  ('20260821164553', 'table login_rate_limits',                  to_regclass('public.login_rate_limits') IS NOT NULL),
  ('20260821172605', 'table student_uid_counters',               to_regclass('public.student_uid_counters') IS NOT NULL),
  ('20260822020500', 'index uq_attendance_org_client_id',        to_regclass('public.uq_attendance_org_client_id') IS NOT NULL),
  ('20260822033000', 'table sanction_policies',                  to_regclass('public.sanction_policies') IS NOT NULL),
  ('20260822033000', 'table semester_assessments',               to_regclass('public.semester_assessments') IS NOT NULL),
  ('20260822033000', 'function correct_semester_assessment',     to_regprocedure('public.correct_semester_assessment(uuid,uuid,uuid,text,jsonb)') IS NOT NULL),
  ('20260822033000', 'column events.term_key',
     EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'events' AND column_name = 'term_key')),
  ('20260830071747', 'table attendance_record_corrections',      to_regclass('public.attendance_record_corrections') IS NOT NULL),
  ('20260830073118', 'function create_sanction_policy_version',  to_regprocedure('public.create_sanction_policy_version(uuid,text,text,jsonb,boolean)') IS NOT NULL),
  ('20260905000000', 'column google_wallet_enabled',
     EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'organization_settings' AND column_name = 'google_wallet_enabled')),
  ('20260905000001', 'column google_wallet_design',
     EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'organization_settings' AND column_name = 'google_wallet_design')),
  ('20261112063129', 'column organization_settings.attendance_revision',
     EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'organization_settings' AND column_name = 'attendance_revision')),
  ('20261112063129', 'function finalize_semester_assessment',    to_regprocedure('public.finalize_semester_assessment(uuid,uuid,uuid)') IS NOT NULL),
  ('20261122130000', 'update_attendance_record has term guard',
     EXISTS (SELECT 1 FROM pg_proc WHERE proname = 'update_attendance_record' AND prosrc LIKE '%active semester%')),
  ('20261123090000', 'signup trigger removed',
     NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'on_auth_user_created'))
) AS m(version, marker, present)
ORDER BY m.version;
