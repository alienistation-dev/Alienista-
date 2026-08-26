-- Phase 5: semester sanctions and recovery data.
-- Phase 6: minimum grants and scoped reporting projections.

ALTER TABLE public.events ADD COLUMN term_key TEXT;
INSERT INTO public.organization_settings (organization_id)
SELECT o.id FROM public.organizations o
ON CONFLICT (organization_id) DO NOTHING;
UPDATE public.events e
SET term_key = s.academic_year || ':' || s.semester::TEXT
FROM public.organization_settings s
WHERE s.organization_id = e.organization_id AND e.term_key IS NULL;
ALTER TABLE public.events ALTER COLUMN term_key SET NOT NULL;
CREATE INDEX events_org_term_idx ON public.events (organization_id, term_key, starts_at DESC);

CREATE OR REPLACE FUNCTION public.create_event_with_slots_and_weight(
  p_organization_id UUID, p_name TEXT, p_starts_at TIMESTAMPTZ, p_venue TEXT,
  p_description TEXT, p_status TEXT, p_weight INTEGER,
  p_created_by_officer_id UUID, p_slots JSONB DEFAULT '[]'::JSONB
)
RETURNS public.events LANGUAGE plpgsql SECURITY INVOKER SET search_path = public AS $$
DECLARE created_event public.events; slot JSONB; current_term TEXT;
BEGIN
  SELECT academic_year || ':' || semester::TEXT INTO current_term
  FROM public.organization_settings WHERE organization_id = p_organization_id;
  IF current_term IS NULL THEN RAISE EXCEPTION 'Organization term settings are unavailable'; END IF;
  INSERT INTO public.events (organization_id, name, starts_at, venue, description, status,
    weight, created_by_officer_id, term_key)
  VALUES (p_organization_id, p_name, p_starts_at, p_venue, COALESCE(p_description, ''),
    p_status::event_status, p_weight, p_created_by_officer_id, current_term)
  RETURNING * INTO created_event;
  FOR slot IN SELECT value FROM jsonb_array_elements(COALESCE(p_slots, '[]'::JSONB)) LOOP
    INSERT INTO public.event_slots (organization_id, event_id, label, slot_type, opens_at,
      closes_at, late_cutoff_at, late_penalty_percent, is_required)
    VALUES (p_organization_id, created_event.id, slot->>'label', (slot->>'slot_type')::slot_type,
      (slot->>'opens_at')::TIMESTAMPTZ, (slot->>'closes_at')::TIMESTAMPTZ,
      NULLIF(slot->>'late_cutoff_at', '')::TIMESTAMPTZ,
      COALESCE((slot->>'late_penalty_percent')::NUMERIC, 0),
      COALESCE((slot->>'is_required')::BOOLEAN, TRUE));
  END LOOP;
  RETURN created_event;
END;
$$;

CREATE TABLE public.sanction_policies (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  version INTEGER NOT NULL CHECK (version > 0),
  mode TEXT NOT NULL CHECK (mode IN ('weighted_missed_points', 'attendance_percentage')),
  is_active BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (organization_id, version)
);

CREATE UNIQUE INDEX sanction_policies_one_active_per_org
  ON public.sanction_policies (organization_id) WHERE is_active;

CREATE TABLE public.sanction_tiers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  policy_id UUID NOT NULL REFERENCES public.sanction_policies(id) ON DELETE CASCADE,
  label TEXT NOT NULL,
  minimum_missed_points NUMERIC(10,2),
  maximum_attendance_ratio NUMERIC(6,5),
  obligation_text TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CHECK (minimum_missed_points IS NULL OR minimum_missed_points >= 0),
  CHECK (maximum_attendance_ratio IS NULL OR maximum_attendance_ratio BETWEEN 0 AND 1),
  CHECK ((minimum_missed_points IS NOT NULL) <> (maximum_attendance_ratio IS NOT NULL)
         OR (minimum_missed_points IS NULL AND maximum_attendance_ratio IS NULL))
);

CREATE INDEX sanction_tiers_policy_idx ON public.sanction_tiers (organization_id, policy_id);

INSERT INTO public.sanction_policies (organization_id, name, version, mode, is_active)
SELECT o.id, 'Weighted missed points (default)', 1, 'weighted_missed_points', true
FROM public.organizations o
WHERE NOT EXISTS (SELECT 1 FROM public.sanction_policies p WHERE p.organization_id = o.id);

INSERT INTO public.sanction_tiers (organization_id, policy_id, label, minimum_missed_points, obligation_text)
SELECT p.organization_id, p.id, tier.label, tier.minimum_missed_points, tier.obligation_text
FROM public.sanction_policies p
CROSS JOIN (VALUES
  ('Reminder', 1::NUMERIC, 'Complete a check-in with an ACS officer.'),
  ('Service', 5::NUMERIC, 'Complete an approved ACS service obligation.')
) AS tier(label, minimum_missed_points, obligation_text)
WHERE p.version = 1
  AND p.mode = 'weighted_missed_points'
  AND NOT EXISTS (SELECT 1 FROM public.sanction_tiers t WHERE t.policy_id = p.id);

CREATE TABLE public.semester_assessments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  student_id UUID NOT NULL REFERENCES public.students(id) ON DELETE CASCADE,
  term_key TEXT NOT NULL,
  policy_id UUID NOT NULL REFERENCES public.sanction_policies(id) ON DELETE RESTRICT,
  policy_version INTEGER NOT NULL CHECK (policy_version > 0),
  status TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'finalized', 'corrected')),
  maximum_points NUMERIC(10,2) NOT NULL CHECK (maximum_points >= 0),
  earned_points NUMERIC(10,2) NOT NULL CHECK (earned_points >= 0),
  missed_points NUMERIC(10,2) NOT NULL CHECK (missed_points >= 0),
  attendance_ratio NUMERIC(8,6) NOT NULL CHECK (attendance_ratio BETWEEN 0 AND 1),
  tier_label TEXT,
  tier_threshold TEXT,
  obligation_text TEXT,
  contributions JSONB NOT NULL DEFAULT '[]'::JSONB,
  finalized_at TIMESTAMPTZ,
  -- Custom admin/officer sessions use subject IDs that are not guaranteed to be
  -- rows in profiles (admins are stored in organization_settings).
  finalized_by UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (organization_id, student_id, term_key),
  CHECK ((status = 'draft' AND finalized_at IS NULL AND finalized_by IS NULL)
      OR (status IN ('finalized', 'corrected') AND finalized_at IS NOT NULL AND finalized_by IS NOT NULL))
);

CREATE INDEX semester_assessments_org_term_idx
  ON public.semester_assessments (organization_id, term_key, status);

CREATE TABLE public.semester_assessment_corrections (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  assessment_id UUID NOT NULL REFERENCES public.semester_assessments(id) ON DELETE CASCADE,
  corrected_by UUID NOT NULL,
  reason TEXT NOT NULL,
  before_snapshot JSONB NOT NULL,
  after_snapshot JSONB NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.sanction_policies ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.sanction_tiers ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.semester_assessments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.semester_assessment_corrections ENABLE ROW LEVEL SECURITY;

CREATE POLICY sanction_policies_org_admin ON public.sanction_policies FOR ALL
  USING (organization_id = public.get_my_org_id() AND public.get_my_role() = 'admin')
  WITH CHECK (organization_id = public.get_my_org_id() AND public.get_my_role() = 'admin');
CREATE POLICY sanction_tiers_org_admin ON public.sanction_tiers FOR ALL
  USING (organization_id = public.get_my_org_id() AND public.get_my_role() = 'admin')
  WITH CHECK (organization_id = public.get_my_org_id() AND public.get_my_role() = 'admin');
CREATE POLICY assessments_org_staff ON public.semester_assessments FOR SELECT
  USING (organization_id = public.get_my_org_id() AND public.get_my_role() IN ('admin', 'officer'));
CREATE POLICY assessments_org_admin_write ON public.semester_assessments FOR UPDATE
  USING (organization_id = public.get_my_org_id() AND public.get_my_role() = 'admin')
  WITH CHECK (organization_id = public.get_my_org_id() AND public.get_my_role() = 'admin');
CREATE POLICY corrections_org_admin ON public.semester_assessment_corrections FOR ALL
  USING (organization_id = public.get_my_org_id() AND public.get_my_role() = 'admin')
  WITH CHECK (organization_id = public.get_my_org_id() AND public.get_my_role() = 'admin');

CREATE OR REPLACE FUNCTION public.prevent_finalized_assessment_mutation()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  IF OLD.status = 'corrected' THEN
    RAISE EXCEPTION 'Corrected assessments are immutable.';
  END IF;
  IF OLD.status = 'finalized' AND NEW.status <> 'corrected' THEN
    RAISE EXCEPTION 'Finalized assessments require an audited correction.';
  END IF;
  IF OLD.status = 'finalized' AND (NEW.maximum_points, NEW.earned_points, NEW.missed_points,
      NEW.attendance_ratio, NEW.tier_label, NEW.tier_threshold, NEW.obligation_text,
      NEW.contributions) IS DISTINCT FROM (OLD.maximum_points, OLD.earned_points, OLD.missed_points,
      OLD.attendance_ratio, OLD.tier_label, OLD.tier_threshold, OLD.obligation_text, OLD.contributions)
      AND NEW.status <> 'corrected' THEN
    RAISE EXCEPTION 'Finalized assessment values are immutable.';
  END IF;
  NEW.updated_at := now();
  RETURN NEW;
END;
$$;

CREATE OR REPLACE TRIGGER semester_assessment_immutability
  BEFORE UPDATE ON public.semester_assessments
  FOR EACH ROW EXECUTE FUNCTION public.prevent_finalized_assessment_mutation();

CREATE OR REPLACE FUNCTION public.correct_semester_assessment(
  p_assessment_id UUID,
  p_organization_id UUID,
  p_corrected_by UUID,
  p_reason TEXT,
  p_values JSONB
)
RETURNS public.semester_assessments
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  current_row public.semester_assessments;
  updated_row public.semester_assessments;
BEGIN
  IF COALESCE(trim(p_reason), '') = '' THEN RAISE EXCEPTION 'Correction reason is required'; END IF;
  SELECT * INTO current_row FROM public.semester_assessments
    WHERE id = p_assessment_id AND organization_id = p_organization_id FOR UPDATE;
  IF current_row.id IS NULL THEN RAISE EXCEPTION 'Assessment not found'; END IF;
  UPDATE public.semester_assessments SET
    status = 'corrected',
    maximum_points = COALESCE((p_values->>'maximum_points')::NUMERIC, maximum_points),
    earned_points = COALESCE((p_values->>'earned_points')::NUMERIC, earned_points),
    missed_points = COALESCE((p_values->>'missed_points')::NUMERIC, missed_points),
    attendance_ratio = COALESCE((p_values->>'attendance_ratio')::NUMERIC, attendance_ratio),
    tier_label = COALESCE(p_values->>'tier_label', tier_label),
    tier_threshold = COALESCE(p_values->>'tier_threshold', tier_threshold),
    obligation_text = COALESCE(p_values->>'obligation_text', obligation_text),
    contributions = COALESCE(p_values->'contributions', contributions),
    finalized_at = now(), finalized_by = p_corrected_by
  WHERE id = p_assessment_id RETURNING * INTO updated_row;
  INSERT INTO public.semester_assessment_corrections
    (organization_id, assessment_id, corrected_by, reason, before_snapshot, after_snapshot)
  VALUES (p_organization_id, p_assessment_id, p_corrected_by, p_reason, to_jsonb(current_row), to_jsonb(updated_row));
  RETURN updated_row;
END;
$$;

CREATE OR REPLACE VIEW public.v_statistics_event_summary AS
SELECT e.organization_id, e.id AS event_id, e.name AS label,
       COALESCE(a.count, 0)::INTEGER AS count,
       COALESCE(s.active_students, 0)::INTEGER AS active_students
FROM public.events e
LEFT JOIN (SELECT organization_id, event_id, COUNT(*) AS count
           FROM public.attendance_records GROUP BY organization_id, event_id) a
  ON a.event_id = e.id AND a.organization_id = e.organization_id
LEFT JOIN (SELECT organization_id, COUNT(*) AS active_students
           FROM public.students WHERE status = 'Active' GROUP BY organization_id) s
  ON s.organization_id = e.organization_id;

CREATE OR REPLACE VIEW public.v_statistics_student_summary AS
SELECT s.organization_id, s.id AS student_id, s.uid, s.full_name AS name, s.year,
       COUNT(DISTINCT e.id)::INTEGER AS total_events,
       COUNT(DISTINCT ar.event_id)::INTEGER AS count,
       CASE WHEN COUNT(DISTINCT e.id) = 0 THEN 0
            ELSE ROUND(COUNT(DISTINCT ar.event_id)::NUMERIC / COUNT(DISTINCT e.id) * 100)::INTEGER END AS attendance_pct
FROM public.students s
LEFT JOIN public.events e ON e.organization_id = s.organization_id
LEFT JOIN public.attendance_records ar ON ar.student_id = s.id AND ar.organization_id = s.organization_id
WHERE s.status = 'Active'
GROUP BY s.organization_id, s.id, s.uid, s.full_name, s.year;

CREATE OR REPLACE VIEW public.v_statistics_officer_summary AS
SELECT ar.organization_id, COALESCE(ar.officer_name, 'Officer') AS officer_name,
       COUNT(*)::INTEGER AS count
FROM public.attendance_records ar
GROUP BY ar.organization_id, COALESCE(ar.officer_name, 'Officer');

ALTER VIEW public.v_attendance_details SET (security_invoker = true);
ALTER VIEW public.v_dashboard_stats SET (security_invoker = true);
ALTER VIEW public.v_statistics_event_summary SET (security_invoker = true);
ALTER VIEW public.v_statistics_student_summary SET (security_invoker = true);
ALTER VIEW public.v_statistics_officer_summary SET (security_invoker = true);

-- Remove direct client access inherited from the legacy blanket-permission migration.
REVOKE ALL ON ALL TABLES IN SCHEMA public FROM anon, authenticated;
REVOKE ALL ON ALL SEQUENCES IN SCHEMA public FROM anon, authenticated;
REVOKE ALL ON ALL ROUTINES IN SCHEMA public FROM anon, authenticated;
ALTER DEFAULT PRIVILEGES IN SCHEMA public REVOKE ALL ON TABLES FROM anon, authenticated;
ALTER DEFAULT PRIVILEGES IN SCHEMA public REVOKE ALL ON SEQUENCES FROM anon, authenticated;
ALTER DEFAULT PRIVILEGES IN SCHEMA public REVOKE ALL ON ROUTINES FROM anon, authenticated;

GRANT USAGE ON SCHEMA public TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE
  public.organizations, public.profiles, public.students, public.officers,
  public.events, public.event_slots, public.attendance_records,
  public.offline_scan_queue, public.organization_settings,
  public.login_rate_limits, public.student_uid_counters,
  public.sanction_policies, public.sanction_tiers, public.semester_assessments,
  public.semester_assessment_corrections TO service_role;
GRANT SELECT ON TABLE
  public.v_attendance_details, public.v_dashboard_stats,
  public.v_statistics_event_summary, public.v_statistics_student_summary,
  public.v_statistics_officer_summary TO service_role;
GRANT EXECUTE ON FUNCTION public.correct_semester_assessment(UUID, UUID, UUID, TEXT, JSONB) TO service_role;
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO service_role;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT USAGE, SELECT ON SEQUENCES TO service_role;
-- RLS policies call these SECURITY DEFINER helpers for direct authenticated reads.
GRANT EXECUTE ON FUNCTION public.get_my_org_id() TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_my_role() TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_my_officer_id() TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_my_student_id() TO authenticated;
