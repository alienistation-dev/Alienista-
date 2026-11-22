-- correct_semester_assessment was SECURITY DEFINER and kept PostgreSQL's default PUBLIC EXECUTE,
-- so anon/authenticated could call it through PostgREST with caller-chosen organization and actor IDs.
-- The app calls it with the service-role client, which already has the table grants it needs.
ALTER FUNCTION public.correct_semester_assessment(UUID, UUID, UUID, TEXT, JSONB) SECURITY INVOKER;
REVOKE ALL ON FUNCTION public.correct_semester_assessment(UUID, UUID, UUID, TEXT, JSONB) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.correct_semester_assessment(UUID, UUID, UUID, TEXT, JSONB) TO service_role;

-- The app does not use Supabase Auth. This legacy trigger gave every Auth signup an admin profile,
-- which the student-avatars Storage policies trust. Signups are disabled in production; remove it anyway.
DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
DROP FUNCTION IF EXISTS public.handle_new_user();
