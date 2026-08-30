ALTER TABLE public.organization_settings
  ADD COLUMN sanctions_enabled BOOLEAN NOT NULL DEFAULT false;

CREATE OR REPLACE FUNCTION public.create_sanction_policy_version(
  p_organization_id UUID,
  p_name TEXT,
  p_mode TEXT,
  p_tiers JSONB,
  p_activate BOOLEAN
)
RETURNS public.sanction_policies
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $$
DECLARE
  next_version INTEGER;
  created_policy public.sanction_policies;
  tier JSONB;
  threshold_value NUMERIC;
BEGIN
  IF COALESCE(trim(p_name), '') = '' THEN RAISE EXCEPTION 'Policy name is required.'; END IF;
  IF p_mode NOT IN ('weighted_missed_points', 'attendance_percentage') THEN RAISE EXCEPTION 'Invalid sanction policy mode.'; END IF;
  IF p_tiers IS NULL OR jsonb_typeof(p_tiers) <> 'array' OR jsonb_array_length(p_tiers) = 0 THEN
    RAISE EXCEPTION 'At least one valid sanction tier is required.';
  END IF;

  PERFORM 1 FROM public.organization_settings
  WHERE organization_id = p_organization_id
  FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Organization settings not found.'; END IF;

  SELECT COALESCE(MAX(version), 0) + 1 INTO next_version
  FROM public.sanction_policies
  WHERE organization_id = p_organization_id;

  IF p_activate THEN
    UPDATE public.sanction_policies
    SET is_active = false
    WHERE organization_id = p_organization_id AND is_active;
  END IF;

  INSERT INTO public.sanction_policies (organization_id, name, version, mode, is_active)
  VALUES (p_organization_id, trim(p_name), next_version, p_mode, p_activate)
  RETURNING * INTO created_policy;

  FOR tier IN SELECT value FROM jsonb_array_elements(p_tiers)
  LOOP
    IF COALESCE(trim(tier->>'label'), '') = '' OR COALESCE(trim(tier->>'obligation_text'), '') = '' THEN
      RAISE EXCEPTION 'Every tier needs a name and obligation.';
    END IF;
    IF tier->>'threshold' IS NULL OR trim(tier->>'threshold') = '' THEN
      RAISE EXCEPTION 'Every tier needs a numeric threshold.';
    END IF;
    BEGIN
      threshold_value := (tier->>'threshold')::NUMERIC;
    EXCEPTION WHEN invalid_text_representation THEN
      RAISE EXCEPTION 'Every tier needs a numeric threshold.';
    END;

    IF p_mode = 'weighted_missed_points' THEN
      IF threshold_value < 0 THEN RAISE EXCEPTION 'Weighted missed-points thresholds cannot be negative.'; END IF;
      INSERT INTO public.sanction_tiers (
        organization_id, policy_id, label, minimum_missed_points, maximum_attendance_ratio, obligation_text
      ) VALUES (
        p_organization_id, created_policy.id, trim(tier->>'label'), threshold_value, NULL, trim(tier->>'obligation_text')
      );
    ELSE
      IF threshold_value < 0 OR threshold_value > 100 THEN RAISE EXCEPTION 'Attendance thresholds must be between 0 and 100 percent.'; END IF;
      INSERT INTO public.sanction_tiers (
        organization_id, policy_id, label, minimum_missed_points, maximum_attendance_ratio, obligation_text
      ) VALUES (
        p_organization_id, created_policy.id, trim(tier->>'label'), NULL, threshold_value / 100, trim(tier->>'obligation_text')
      );
    END IF;
  END LOOP;

  IF p_activate THEN
    DELETE FROM public.semester_assessments
    WHERE organization_id = p_organization_id
      AND status = 'draft';
  END IF;

  RETURN created_policy;
END;
$$;

CREATE OR REPLACE FUNCTION public.prevent_referenced_sanction_policy_definition_mutation()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF EXISTS (SELECT 1 FROM public.semester_assessments WHERE policy_id = OLD.id)
     AND (NEW.organization_id, NEW.name, NEW.version, NEW.mode)
       IS DISTINCT FROM (OLD.organization_id, OLD.name, OLD.version, OLD.mode) THEN
    RAISE EXCEPTION 'Policies referenced by assessments are immutable; create a new version.';
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER sanction_policy_referenced_definition_immutable
  BEFORE UPDATE ON public.sanction_policies
  FOR EACH ROW EXECUTE FUNCTION public.prevent_referenced_sanction_policy_definition_mutation();

CREATE OR REPLACE FUNCTION public.prevent_referenced_sanction_tier_mutation()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF EXISTS (SELECT 1 FROM public.semester_assessments WHERE policy_id = OLD.policy_id) THEN
    RAISE EXCEPTION 'Tiers referenced by assessments are immutable; create a new policy version.';
  END IF;
  RETURN CASE WHEN TG_OP = 'DELETE' THEN OLD ELSE NEW END;
END;
$$;

CREATE TRIGGER sanction_tier_referenced_immutable
  BEFORE UPDATE OR DELETE ON public.sanction_tiers
  FOR EACH ROW EXECUTE FUNCTION public.prevent_referenced_sanction_tier_mutation();

CREATE OR REPLACE FUNCTION public.set_sanctions_enabled(
  p_organization_id UUID,
  p_enabled BOOLEAN
)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $$
BEGIN
  PERFORM 1 FROM public.organization_settings
  WHERE organization_id = p_organization_id
  FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Organization settings not found.'; END IF;

  IF p_enabled AND NOT EXISTS (
    SELECT 1
    FROM public.sanction_policies policy
    JOIN public.sanction_tiers tier ON tier.policy_id = policy.id
    WHERE policy.organization_id = p_organization_id
      AND policy.is_active
      AND tier.organization_id = p_organization_id
      AND ((policy.mode = 'weighted_missed_points' AND tier.minimum_missed_points IS NOT NULL)
        OR (policy.mode = 'attendance_percentage' AND tier.maximum_attendance_ratio IS NOT NULL))
  ) THEN
    RAISE EXCEPTION 'Sanctions require an active policy with at least one valid tier.';
  END IF;

  UPDATE public.organization_settings
  SET sanctions_enabled = p_enabled
  WHERE organization_id = p_organization_id;
  RETURN p_enabled;
END;
$$;

REVOKE ALL ON FUNCTION public.create_sanction_policy_version(UUID, TEXT, TEXT, JSONB, BOOLEAN) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.set_sanctions_enabled(UUID, BOOLEAN) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.prevent_referenced_sanction_policy_definition_mutation() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.prevent_referenced_sanction_tier_mutation() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.create_sanction_policy_version(UUID, TEXT, TEXT, JSONB, BOOLEAN) TO service_role;
GRANT EXECUTE ON FUNCTION public.set_sanctions_enabled(UUID, BOOLEAN) TO service_role;
