-- Production was hand-applied and is missing this function from 20260822033000.
-- Body is unchanged from that migration. Security and grants match 20261123090000,
-- so the result is the same whichever of the two runs last.
CREATE OR REPLACE FUNCTION public.correct_semester_assessment(
  p_assessment_id UUID,
  p_organization_id UUID,
  p_corrected_by UUID,
  p_reason TEXT,
  p_values JSONB
)
RETURNS public.semester_assessments
LANGUAGE plpgsql SECURITY INVOKER SET search_path = public AS $$
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

REVOKE ALL ON FUNCTION public.correct_semester_assessment(UUID, UUID, UUID, TEXT, JSONB) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.correct_semester_assessment(UUID, UUID, UUID, TEXT, JSONB) TO service_role;
