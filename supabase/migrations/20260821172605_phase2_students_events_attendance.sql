-- Phase 2: concurrent UID allocation, transactional event creation, weights,
-- late policies, and persisted attendance classification.

CREATE TABLE public.student_uid_counters (
  organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  allocation_year INTEGER NOT NULL CHECK (allocation_year BETWEEN 2000 AND 9999),
  last_value INTEGER NOT NULL DEFAULT 0 CHECK (last_value >= 0),
  PRIMARY KEY (organization_id, allocation_year)
);

ALTER TABLE public.student_uid_counters ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.student_uid_counters FROM PUBLIC, anon, authenticated;
GRANT SELECT, INSERT, UPDATE ON TABLE public.student_uid_counters TO service_role;

CREATE OR REPLACE FUNCTION public.allocate_student_uid(
  p_organization_id UUID,
  p_year INTEGER DEFAULT EXTRACT(YEAR FROM now())::INTEGER
)
RETURNS TEXT
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $$
DECLARE
  next_value INTEGER;
BEGIN
  IF p_year < 2000 OR p_year > 9999 THEN
    RAISE EXCEPTION 'Invalid allocation year';
  END IF;

  INSERT INTO public.student_uid_counters (organization_id, allocation_year, last_value)
  SELECT
    p_organization_id,
    p_year,
    COALESCE(
      MAX(((regexp_match(uid, format('^ST-%s-([0-9]+)$', p_year)))[1])::INTEGER),
      0
    ) + 1
  FROM public.students
  WHERE organization_id = p_organization_id
  ON CONFLICT (organization_id, allocation_year) DO UPDATE
  SET last_value = public.student_uid_counters.last_value + 1
  RETURNING last_value INTO next_value;

  RETURN format('ST-%s-%s', p_year, lpad(next_value::TEXT, 4, '0'));
END;
$$;

REVOKE ALL ON FUNCTION public.allocate_student_uid(UUID, INTEGER) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.allocate_student_uid(UUID, INTEGER) TO service_role;

ALTER TABLE public.events
  ADD COLUMN weight INTEGER NOT NULL DEFAULT 1 CHECK (weight BETWEEN 1 AND 20);

ALTER TABLE public.event_slots
  ADD COLUMN late_cutoff_at TIMESTAMPTZ,
  ADD COLUMN late_penalty_percent NUMERIC(5,2) NOT NULL DEFAULT 0
    CHECK (late_penalty_percent BETWEEN 0 AND 100),
  ADD COLUMN is_required BOOLEAN NOT NULL DEFAULT TRUE,
  ADD CONSTRAINT event_slots_time_order
    CHECK (closes_at >= opens_at),
  ADD CONSTRAINT event_slots_late_cutoff_window
    CHECK (late_cutoff_at IS NULL OR late_cutoff_at BETWEEN opens_at AND closes_at);

ALTER TABLE public.attendance_records
  ADD COLUMN attendance_status TEXT NOT NULL DEFAULT 'on_time'
    CHECK (attendance_status IN ('on_time', 'late', 'manual')),
  ADD COLUMN effective_scan_time TIMESTAMPTZ NOT NULL DEFAULT now(),
  ADD COLUMN late_penalty_percent NUMERIC(5,2) NOT NULL DEFAULT 0
    CHECK (late_penalty_percent BETWEEN 0 AND 100);

UPDATE public.attendance_records
SET effective_scan_time = recorded_at
WHERE effective_scan_time IS DISTINCT FROM recorded_at;

CREATE OR REPLACE FUNCTION public.create_event_with_slots_and_weight(
  p_organization_id UUID,
  p_name TEXT,
  p_starts_at TIMESTAMPTZ,
  p_venue TEXT,
  p_description TEXT,
  p_status TEXT,
  p_weight INTEGER,
  p_created_by_officer_id UUID,
  p_slots JSONB DEFAULT '[]'::JSONB
)
RETURNS public.events
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $$
DECLARE
  created_event public.events;
  slot JSONB;
BEGIN
  INSERT INTO public.events (
    organization_id,
    name,
    starts_at,
    venue,
    description,
    status,
    weight,
    created_by_officer_id
  )
  VALUES (
    p_organization_id,
    p_name,
    p_starts_at,
    p_venue,
    COALESCE(p_description, ''),
      p_status::event_status,
    p_weight,
    p_created_by_officer_id
  )
  RETURNING * INTO created_event;

  FOR slot IN SELECT value FROM jsonb_array_elements(COALESCE(p_slots, '[]'::JSONB))
  LOOP
    INSERT INTO public.event_slots (
      organization_id,
      event_id,
      label,
      slot_type,
      opens_at,
      closes_at,
      late_cutoff_at,
      late_penalty_percent,
      is_required
    )
    VALUES (
      p_organization_id,
      created_event.id,
      slot->>'label',
      (slot->>'slot_type')::slot_type,
      (slot->>'opens_at')::TIMESTAMPTZ,
      (slot->>'closes_at')::TIMESTAMPTZ,
      NULLIF(slot->>'late_cutoff_at', '')::TIMESTAMPTZ,
      COALESCE((slot->>'late_penalty_percent')::NUMERIC, 0),
      COALESCE((slot->>'is_required')::BOOLEAN, TRUE)
    );
  END LOOP;

  RETURN created_event;
END;
$$;

REVOKE ALL ON FUNCTION public.create_event_with_slots_and_weight(
  UUID, TEXT, TIMESTAMPTZ, TEXT, TEXT, TEXT, INTEGER, UUID, JSONB
) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.create_event_with_slots_and_weight(
  UUID, TEXT, TIMESTAMPTZ, TEXT, TEXT, TEXT, INTEGER, UUID, JSONB
) TO service_role;
