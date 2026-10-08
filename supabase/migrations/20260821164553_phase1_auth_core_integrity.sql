-- Phase 1: shared login throttling for custom authentication.
-- Raw account identifiers never leave the application server; only SHA-256 hashes are stored.

CREATE TABLE public.login_rate_limits (
  identifier_hash TEXT PRIMARY KEY,
  failure_count INTEGER NOT NULL DEFAULT 0 CHECK (failure_count >= 0),
  window_started_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  locked_until TIMESTAMPTZ,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT login_rate_limits_identifier_hash_format
    CHECK (identifier_hash ~ '^[0-9a-f]{64}$')
);

ALTER TABLE public.login_rate_limits ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON TABLE public.login_rate_limits FROM PUBLIC, anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.login_rate_limits TO service_role;

CREATE OR REPLACE FUNCTION public.check_login_rate_limit(p_identifier_hash TEXT)
RETURNS BOOLEAN
LANGUAGE sql
SECURITY INVOKER
SET search_path = public
AS $$
  SELECT COALESCE(
    (
      SELECT locked_until > now()
      FROM public.login_rate_limits
      WHERE identifier_hash = p_identifier_hash
    ),
    FALSE
  );
$$;

CREATE OR REPLACE FUNCTION public.record_login_failure(p_identifier_hash TEXT)
RETURNS VOID
LANGUAGE sql
SECURITY INVOKER
SET search_path = public
AS $$
  INSERT INTO public.login_rate_limits (
    identifier_hash,
    failure_count,
    window_started_at,
    locked_until,
    updated_at
  )
  VALUES (p_identifier_hash, 1, now(), NULL, now())
  ON CONFLICT (identifier_hash) DO UPDATE
  SET
    failure_count = CASE
      WHEN public.login_rate_limits.window_started_at <= now() - interval '5 minutes' THEN 1
      ELSE public.login_rate_limits.failure_count + 1
    END,
    window_started_at = CASE
      WHEN public.login_rate_limits.window_started_at <= now() - interval '5 minutes' THEN now()
      ELSE public.login_rate_limits.window_started_at
    END,
    locked_until = CASE
      WHEN public.login_rate_limits.window_started_at <= now() - interval '5 minutes' THEN NULL
      WHEN public.login_rate_limits.failure_count + 1 >= 5 THEN now() + interval '5 minutes'
      ELSE public.login_rate_limits.locked_until
    END,
    updated_at = now();
$$;

CREATE OR REPLACE FUNCTION public.clear_login_failures(p_identifier_hash TEXT)
RETURNS VOID
LANGUAGE sql
SECURITY INVOKER
SET search_path = public
AS $$
  DELETE FROM public.login_rate_limits
  WHERE identifier_hash = p_identifier_hash;
$$;

REVOKE ALL ON FUNCTION public.check_login_rate_limit(TEXT) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.record_login_failure(TEXT) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.clear_login_failures(TEXT) FROM PUBLIC, anon, authenticated;

GRANT EXECUTE ON FUNCTION public.check_login_rate_limit(TEXT) TO service_role;
GRANT EXECUTE ON FUNCTION public.record_login_failure(TEXT) TO service_role;
GRANT EXECUTE ON FUNCTION public.clear_login_failures(TEXT) TO service_role;
