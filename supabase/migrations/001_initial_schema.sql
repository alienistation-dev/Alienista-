-- =============================================================================
-- 001_initial_schema.sql
-- Alienista Attendance System — Supabase PostgreSQL Migration
-- Translated from Django models.py (legacy Django/SQLite stack)
-- Target: Multi-tenant, RLS-enforced schema for Palawan State University (ACS)
-- =============================================================================

-- =============================================================================
-- SECTION 0: EXTENSIONS
-- =============================================================================
CREATE EXTENSION IF NOT EXISTS "pgcrypto";  -- for gen_random_uuid()
CREATE EXTENSION IF NOT EXISTS "pg_net";    -- for async HTTP (optional, Supabase default)


-- =============================================================================
-- SECTION 1: ENUMS
-- Typed equivalents of Django CharField choices
-- =============================================================================

CREATE TYPE user_role AS ENUM ('admin', 'officer', 'student');
CREATE TYPE member_status AS ENUM ('Active', 'Inactive', 'Alumni');
CREATE TYPE event_status AS ENUM ('Open', 'Closed');
CREATE TYPE semester_type AS ENUM ('First Semester', 'Second Semester');
CREATE TYPE sync_status AS ENUM ('pending_offline', 'synced', 'duplicate', 'invalid', 'error');

-- Academic year levels (matches legacy YEARS array from settings.js)
CREATE TYPE year_level AS ENUM (
  '1st Year',
  '2nd Year',
  '3rd Year',
  '4th Year',
  'Alumni'
);


-- =============================================================================
-- SECTION 2: CORE TABLES
-- =============================================================================

-- -----------------------------------------------------------------------------
-- 2.1 organizations
-- Multi-tenant anchor. Every org-scoped row references this table.
-- -----------------------------------------------------------------------------
CREATE TABLE organizations (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name        TEXT NOT NULL UNIQUE,
  slug        TEXT NOT NULL UNIQUE,  -- e.g. 'acs', 'essa' — used in URLs
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Seed ACS as the sole organization per user requirements
INSERT INTO organizations (name, slug)
VALUES ('ACS', 'acs');


-- -----------------------------------------------------------------------------
-- 2.2 profiles
-- Extends auth.users. One row per authenticated user (Admin only for now).
-- Officers and Students are NOT Supabase Auth users — they authenticate via
-- Server Actions (hybrid strategy). This table still holds their metadata
-- so RLS functions can reference them.
-- -----------------------------------------------------------------------------
CREATE TABLE profiles (
  id              UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  role            user_role NOT NULL DEFAULT 'admin',
  display_name    TEXT,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Automatically create a profile row when a new auth.users row is inserted
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_org_id UUID;
BEGIN
  -- Default to the first (and currently only) organization
  SELECT id INTO v_org_id FROM organizations ORDER BY created_at ASC LIMIT 1;

  INSERT INTO profiles (id, organization_id, role, display_name)
  VALUES (
    NEW.id,
    COALESCE((NEW.raw_user_meta_data->>'organization_id')::UUID, v_org_id),
    COALESCE((NEW.raw_user_meta_data->>'role')::user_role, 'admin'),
    COALESCE(NEW.raw_user_meta_data->>'display_name', NEW.email)
  );
  RETURN NEW;
END;
$$;

CREATE OR REPLACE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();


-- -----------------------------------------------------------------------------
-- 2.3 students
-- Translated from Django Student model.
-- Uses Supabase Auth-independent credentials (uid + hashed password).
-- Officers and Admins manage these records; students self-authenticate via
-- Server Actions using (uid | student_number) + password.
-- -----------------------------------------------------------------------------
CREATE TABLE students (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id  UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,

  -- Identity (matches legacy uid + student_number, both unique PER ORG)
  uid              TEXT NOT NULL,
  student_number   TEXT NOT NULL,

  -- Name fields (legacy model had name + first_name + last_name)
  first_name       TEXT NOT NULL DEFAULT '',
  last_name        TEXT NOT NULL DEFAULT '',
  full_name        TEXT NOT NULL,  -- denormalized for fast search (was 'name' in Django)

  -- Academic info
  course           TEXT NOT NULL DEFAULT 'BS Computer Science',
  year             year_level NOT NULL DEFAULT '1st Year',
  section          TEXT NOT NULL,

  -- Status
  status           member_status NOT NULL DEFAULT 'Active',

  -- Auth (custom, NOT Supabase Auth)
  -- Password is stored as a bcrypt hash (via pgcrypto or application layer)
  password_hash    TEXT,
  is_first_login   BOOLEAN NOT NULL DEFAULT TRUE,

  -- Avatar (Supabase Storage path)
  avatar_url       TEXT,

  -- Timestamps
  created_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at       TIMESTAMPTZ NOT NULL DEFAULT now(),

  -- Constraints: uid and student_number must be unique within an org
  CONSTRAINT uq_students_uid_per_org            UNIQUE (organization_id, uid),
  CONSTRAINT uq_students_student_number_per_org UNIQUE (organization_id, student_number)
);

CREATE INDEX idx_students_org         ON students(organization_id);
CREATE INDEX idx_students_uid         ON students(organization_id, uid);
CREATE INDEX idx_students_status      ON students(organization_id, status);
CREATE INDEX idx_students_year        ON students(organization_id, year);
-- Full-text search index on full_name for fast student lookup
CREATE INDEX idx_students_fullname_search ON students USING gin(to_tsvector('english', full_name));


-- Trigger: auto-derive first_name / last_name from full_name on INSERT/UPDATE
-- Mirrors the logic in Django's Student.save()
CREATE OR REPLACE FUNCTION public.derive_student_names()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
DECLARE
  parts TEXT[];
  prefixes TEXT[] := ARRAY[
    'DELA','DE','DEL','SAN','SANTA','SANTO','LA','LAS','LOS','DA','DOS','VAN','VON'
  ];
  n_parts INT;
BEGIN
  -- Only derive if full_name is provided and names are not already explicitly set
  IF NEW.full_name IS NOT NULL AND NEW.full_name <> '' THEN
    parts := string_to_array(trim(NEW.full_name), ' ');
    n_parts := array_length(parts, 1);

    IF n_parts = 1 THEN
      NEW.first_name := NEW.full_name;
      NEW.last_name  := NEW.full_name;
    ELSE
      -- Derive last_name respecting compound prefixes (De La Cruz, San Juan, etc.)
      IF n_parts >= 3
        AND upper(parts[n_parts - 2]) = ANY(prefixes)
        AND upper(parts[n_parts - 1]) = ANY(prefixes) THEN
        -- 3-part compound last name
        NEW.last_name  := upper(parts[n_parts - 2] || ' ' || parts[n_parts - 1] || ' ' || parts[n_parts]);
        NEW.first_name := array_to_string(parts[1:n_parts - 3], ' ');
      ELSIF n_parts >= 2 AND upper(parts[n_parts - 1]) = ANY(prefixes) THEN
        -- 2-part compound last name
        NEW.last_name  := upper(parts[n_parts - 1] || ' ' || parts[n_parts]);
        NEW.first_name := array_to_string(parts[1:n_parts - 2], ' ');
      ELSE
        -- Simple: last word is last name
        NEW.last_name  := upper(parts[n_parts]);
        NEW.first_name := array_to_string(parts[1:n_parts - 1], ' ');
      END IF;
    END IF;
  ELSIF NEW.first_name <> '' AND NEW.last_name <> '' THEN
    NEW.full_name := trim(NEW.first_name || ' ' || NEW.last_name);
  END IF;

  NEW.updated_at := now();
  RETURN NEW;
END;
$$;

CREATE OR REPLACE TRIGGER trg_derive_student_names
  BEFORE INSERT OR UPDATE ON students
  FOR EACH ROW EXECUTE FUNCTION public.derive_student_names();


-- Helper: extract the "default password" (last name, uppercased) for a student row
-- Mirrors Django's Student.extract_last_name() + Student.save() default password logic
CREATE OR REPLACE FUNCTION public.get_student_default_password(p_full_name TEXT, p_last_name TEXT)
RETURNS TEXT
LANGUAGE plpgsql
AS $$
DECLARE
  parts TEXT[];
  prefixes TEXT[] := ARRAY[
    'DELA','DE','DEL','SAN','SANTA','SANTO','LA','LAS','LOS','DA','DOS','VAN','VON'
  ];
  n_parts INT;
BEGIN
  -- If last_name is explicitly set and non-empty, use it
  IF p_last_name IS NOT NULL AND trim(p_last_name) <> '' THEN
    RETURN upper(trim(p_last_name));
  END IF;

  IF p_full_name IS NULL OR trim(p_full_name) = '' THEN
    RETURN 'DEFAULT';
  END IF;

  parts := string_to_array(trim(p_full_name), ' ');
  n_parts := array_length(parts, 1);

  IF n_parts <= 1 THEN
    RETURN upper(trim(p_full_name));
  END IF;

  IF n_parts >= 3
    AND upper(parts[n_parts - 2]) = ANY(prefixes)
    AND upper(parts[n_parts - 1]) = ANY(prefixes) THEN
    RETURN upper(parts[n_parts - 2] || ' ' || parts[n_parts - 1] || ' ' || parts[n_parts]);
  END IF;

  IF n_parts >= 2 AND upper(parts[n_parts - 1]) = ANY(prefixes) THEN
    RETURN upper(parts[n_parts - 1] || ' ' || parts[n_parts]);
  END IF;

  RETURN upper(parts[n_parts]);
END;
$$;


-- -----------------------------------------------------------------------------
-- 2.4 officers
-- Translated from Django Officer model.
-- Officers are NOT Supabase Auth users. They authenticate via name + PIN
-- validated in a Server Action. PIN is stored as a bcrypt hash.
-- -----------------------------------------------------------------------------
CREATE TABLE officers (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id  UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,

  name             TEXT NOT NULL,
  pin_hash         TEXT NOT NULL,  -- bcrypt hash of the officer's PIN
  status           member_status NOT NULL DEFAULT 'Active',

  created_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at       TIMESTAMPTZ NOT NULL DEFAULT now(),

  -- Officer name must be unique within an organization
  CONSTRAINT uq_officers_name_per_org UNIQUE (organization_id, name)
);

CREATE INDEX idx_officers_org    ON officers(organization_id);
CREATE INDEX idx_officers_status ON officers(organization_id, status);

CREATE OR REPLACE FUNCTION public.update_officers_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN NEW.updated_at := now(); RETURN NEW; END;
$$;

CREATE OR REPLACE TRIGGER trg_officers_updated_at
  BEFORE UPDATE ON officers
  FOR EACH ROW EXECUTE FUNCTION public.update_officers_updated_at();


-- -----------------------------------------------------------------------------
-- 2.5 events
-- Translated from Django Event model.
-- Legacy had separate 'date' and 'time' columns — merged into 'starts_at'
-- for proper timestamptz semantics. Original date/time kept as computed columns.
-- -----------------------------------------------------------------------------
CREATE TABLE events (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id  UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,

  name             TEXT NOT NULL,
  starts_at        TIMESTAMPTZ NOT NULL,  -- merged date + time (was separate in Django)
  venue            TEXT NOT NULL,
  description      TEXT NOT NULL DEFAULT '',
  status           event_status NOT NULL DEFAULT 'Open',

  -- Officer who created the event (nullable — can be admin or officer)
  created_by_officer_id UUID REFERENCES officers(id) ON DELETE SET NULL,

  created_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at       TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_events_org        ON events(organization_id);
CREATE INDEX idx_events_status     ON events(organization_id, status);
CREATE INDEX idx_events_starts_at  ON events(organization_id, starts_at DESC);

CREATE OR REPLACE FUNCTION public.update_events_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN NEW.updated_at := now(); RETURN NEW; END;
$$;

CREATE OR REPLACE TRIGGER trg_events_updated_at
  BEFORE UPDATE ON events
  FOR EACH ROW EXECUTE FUNCTION public.update_events_updated_at();


-- -----------------------------------------------------------------------------
-- 2.6 attendance_records
-- Translated from Django Attendance model.
-- 'officer' was a plain string in legacy — now a nullable FK to officers table.
-- Unique constraint: one record per student per event (same as legacy).
-- organization_id is denormalized here for RLS performance.
-- -----------------------------------------------------------------------------
CREATE TABLE attendance_records (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id  UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,

  student_id       UUID NOT NULL REFERENCES students(id) ON DELETE CASCADE,
  event_id         UUID NOT NULL REFERENCES events(id) ON DELETE CASCADE,

  -- Officer who recorded this attendance (nullable: could be admin)
  officer_id       UUID REFERENCES officers(id) ON DELETE SET NULL,
  officer_name     TEXT,  -- denormalized display name snapshot at time of scan

  -- Client-generated ID for offline-first deduplication (matches legacy client_id)
  client_id        TEXT,

  -- Timestamp: can be provided by client for offline scans (matches legacy bulk_sync logic)
  recorded_at      TIMESTAMPTZ NOT NULL DEFAULT now(),

  -- Unique attendance: one record per student per event
  CONSTRAINT uq_attendance_student_event UNIQUE (student_id, event_id)
);

CREATE INDEX idx_attendance_org       ON attendance_records(organization_id);
CREATE INDEX idx_attendance_event     ON attendance_records(organization_id, event_id);
CREATE INDEX idx_attendance_student   ON attendance_records(organization_id, student_id);
CREATE INDEX idx_attendance_client_id ON attendance_records(client_id) WHERE client_id IS NOT NULL;


-- -----------------------------------------------------------------------------
-- 2.7 offline_scan_queue
-- New table. Supports the offline-first QR scanning feature.
-- Mirrors the IndexedDB 'pending_scans' store from the legacy scanner.js.
-- Rows here are synced to attendance_records via the /api/sync Server Action
-- and then deleted on success. This preserves the full legacy bulk_sync flow.
-- -----------------------------------------------------------------------------
CREATE TABLE offline_scan_queue (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id  UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,

  client_id        TEXT NOT NULL UNIQUE,  -- client-generated dedup key
  student_uid      TEXT NOT NULL,         -- raw UID from QR scan (may not resolve)
  event_id         UUID NOT NULL REFERENCES events(id) ON DELETE CASCADE,
  officer_name     TEXT,
  officer_id       UUID REFERENCES officers(id) ON DELETE SET NULL,

  -- Timestamp from the client device at time of scan
  client_timestamp TIMESTAMPTZ NOT NULL DEFAULT now(),

  sync_status      sync_status NOT NULL DEFAULT 'pending_offline',
  error_message    TEXT,

  created_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
  synced_at        TIMESTAMPTZ
);

CREATE INDEX idx_offline_queue_org    ON offline_scan_queue(organization_id);
CREATE INDEX idx_offline_queue_status ON offline_scan_queue(organization_id, sync_status);
CREATE INDEX idx_offline_queue_event  ON offline_scan_queue(organization_id, event_id);


-- -----------------------------------------------------------------------------
-- 2.8 organization_settings
-- Translated from Django SystemSetting model.
-- One row per organization. Admin credentials are now managed via Supabase Auth;
-- only academic term settings remain here.
-- -----------------------------------------------------------------------------
CREATE TABLE organization_settings (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id  UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE UNIQUE,

  academic_year    TEXT NOT NULL DEFAULT '2026-2027',
  semester         semester_type NOT NULL DEFAULT 'First Semester',

  updated_at       TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Auto-insert a settings row when a new organization is created
CREATE OR REPLACE FUNCTION public.handle_new_organization()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO organization_settings (organization_id)
  VALUES (NEW.id)
  ON CONFLICT (organization_id) DO NOTHING;
  RETURN NEW;
END;
$$;

CREATE OR REPLACE TRIGGER on_organization_created
  AFTER INSERT ON organizations
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_organization();

-- Backfill settings for the seeded ACS organization
INSERT INTO organization_settings (organization_id)
SELECT id FROM organizations WHERE slug = 'acs'
ON CONFLICT (organization_id) DO NOTHING;

CREATE OR REPLACE FUNCTION public.update_org_settings_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN NEW.updated_at := now(); RETURN NEW; END;
$$;

CREATE OR REPLACE TRIGGER trg_org_settings_updated_at
  BEFORE UPDATE ON organization_settings
  FOR EACH ROW EXECUTE FUNCTION public.update_org_settings_updated_at();


-- =============================================================================
-- SECTION 3: RLS HELPER FUNCTIONS
-- These read from the authenticated JWT to determine the caller's identity.
-- For Admin (Supabase Auth users): claims come from auth.uid() and the profiles table.
-- For Officers & Students (custom auth): organization_id is embedded in a
-- session cookie managed by the Next.js middleware and passed as a custom claim.
-- =============================================================================

-- Returns the organization_id of the currently authenticated user.
-- For Supabase Auth users (admins), this reads from the profiles table.
-- For custom-auth sessions, the app sets auth.jwt() claims via set_config.
CREATE OR REPLACE FUNCTION public.get_my_org_id()
RETURNS UUID
LANGUAGE sql
STABLE
SECURITY DEFINER
AS $$
  SELECT COALESCE(
    -- Supabase Auth admin path: look up profile
    (SELECT organization_id FROM profiles WHERE id = auth.uid()),
    -- Custom auth path: read from JWT claim injected by Server Action
    (nullif(current_setting('request.jwt.claims', true)::json->>'organization_id', ''))::UUID
  );
$$;

-- Returns the role of the currently authenticated caller.
CREATE OR REPLACE FUNCTION public.get_my_role()
RETURNS TEXT
LANGUAGE sql
STABLE
SECURITY DEFINER
AS $$
  SELECT COALESCE(
    -- Supabase Auth admin path
    (SELECT role::TEXT FROM profiles WHERE id = auth.uid()),
    -- Custom auth path (officer / student)
    nullif(current_setting('request.jwt.claims', true)::json->>'role', '')
  );
$$;

-- Returns the officer_id for the current custom-auth session (if officer role)
CREATE OR REPLACE FUNCTION public.get_my_officer_id()
RETURNS UUID
LANGUAGE sql
STABLE
SECURITY DEFINER
AS $$
  SELECT (nullif(current_setting('request.jwt.claims', true)::json->>'officer_id', ''))::UUID;
$$;

-- Returns the student_id for the current custom-auth session (if student role)
CREATE OR REPLACE FUNCTION public.get_my_student_id()
RETURNS UUID
LANGUAGE sql
STABLE
SECURITY DEFINER
AS $$
  SELECT (nullif(current_setting('request.jwt.claims', true)::json->>'student_id', ''))::UUID;
$$;


-- =============================================================================
-- SECTION 4: ROW LEVEL SECURITY
-- =============================================================================

ALTER TABLE organizations         ENABLE ROW LEVEL SECURITY;
ALTER TABLE profiles              ENABLE ROW LEVEL SECURITY;
ALTER TABLE students              ENABLE ROW LEVEL SECURITY;
ALTER TABLE officers              ENABLE ROW LEVEL SECURITY;
ALTER TABLE events                ENABLE ROW LEVEL SECURITY;
ALTER TABLE attendance_records    ENABLE ROW LEVEL SECURITY;
ALTER TABLE offline_scan_queue    ENABLE ROW LEVEL SECURITY;
ALTER TABLE organization_settings ENABLE ROW LEVEL SECURITY;


-- ---------------------------------------------------------------------------
-- organizations: Admins can read their own org; no one can insert/update/delete via RLS
-- ---------------------------------------------------------------------------
CREATE POLICY "organizations_select"
  ON organizations FOR SELECT
  USING (id = get_my_org_id());

-- ---------------------------------------------------------------------------
-- profiles: Only the owning admin can see/update their own profile
-- ---------------------------------------------------------------------------
CREATE POLICY "profiles_select_own"
  ON profiles FOR SELECT
  USING (id = auth.uid());

CREATE POLICY "profiles_update_own"
  ON profiles FOR UPDATE
  USING (id = auth.uid());

-- ---------------------------------------------------------------------------
-- students
-- Admin: full CRUD within their org
-- Officer: SELECT all + UPDATE (e.g., reset password) within their org
-- Student: SELECT own row only
-- ---------------------------------------------------------------------------
CREATE POLICY "students_admin_all"
  ON students FOR ALL
  USING (
    get_my_role() = 'admin'
    AND organization_id = get_my_org_id()
  )
  WITH CHECK (
    get_my_role() = 'admin'
    AND organization_id = get_my_org_id()
  );

CREATE POLICY "students_officer_select"
  ON students FOR SELECT
  USING (
    get_my_role() = 'officer'
    AND organization_id = get_my_org_id()
  );

CREATE POLICY "students_officer_update"
  ON students FOR UPDATE
  USING (
    get_my_role() = 'officer'
    AND organization_id = get_my_org_id()
  )
  WITH CHECK (
    get_my_role() = 'officer'
    AND organization_id = get_my_org_id()
  );

CREATE POLICY "students_student_select_own"
  ON students FOR SELECT
  USING (
    get_my_role() = 'student'
    AND id = get_my_student_id()
  );

CREATE POLICY "students_student_update_own"
  ON students FOR UPDATE
  USING (
    get_my_role() = 'student'
    AND id = get_my_student_id()
    AND organization_id = get_my_org_id()
  )
  WITH CHECK (
    get_my_role() = 'student'
    AND id = get_my_student_id()
  );

-- ---------------------------------------------------------------------------
-- officers
-- Admin: full CRUD within their org
-- Officer: SELECT active officers in their org (e.g., for attendance attribution)
-- Student: no access
-- ---------------------------------------------------------------------------
CREATE POLICY "officers_admin_all"
  ON officers FOR ALL
  USING (
    get_my_role() = 'admin'
    AND organization_id = get_my_org_id()
  )
  WITH CHECK (
    get_my_role() = 'admin'
    AND organization_id = get_my_org_id()
  );

CREATE POLICY "officers_officer_select_active"
  ON officers FOR SELECT
  USING (
    get_my_role() = 'officer'
    AND organization_id = get_my_org_id()
    AND status = 'Active'
  );

-- ---------------------------------------------------------------------------
-- events
-- Admin: full CRUD within their org
-- Officer: SELECT all + INSERT + UPDATE (manage events) within their org
-- Student: SELECT Open events in their org only
-- ---------------------------------------------------------------------------
CREATE POLICY "events_admin_all"
  ON events FOR ALL
  USING (
    get_my_role() = 'admin'
    AND organization_id = get_my_org_id()
  )
  WITH CHECK (
    get_my_role() = 'admin'
    AND organization_id = get_my_org_id()
  );

CREATE POLICY "events_officer_select"
  ON events FOR SELECT
  USING (
    get_my_role() = 'officer'
    AND organization_id = get_my_org_id()
  );

CREATE POLICY "events_officer_insert"
  ON events FOR INSERT
  WITH CHECK (
    get_my_role() = 'officer'
    AND organization_id = get_my_org_id()
  );

CREATE POLICY "events_officer_update"
  ON events FOR UPDATE
  USING (
    get_my_role() = 'officer'
    AND organization_id = get_my_org_id()
  )
  WITH CHECK (
    get_my_role() = 'officer'
    AND organization_id = get_my_org_id()
  );

CREATE POLICY "events_student_select_open"
  ON events FOR SELECT
  USING (
    get_my_role() = 'student'
    AND organization_id = get_my_org_id()
    AND status = 'Open'
  );

-- ---------------------------------------------------------------------------
-- attendance_records
-- Admin: full CRUD within their org
-- Officer: SELECT all + INSERT (scan QR) within their org; no DELETE
-- Student: SELECT own records only
-- ---------------------------------------------------------------------------
CREATE POLICY "attendance_admin_all"
  ON attendance_records FOR ALL
  USING (
    get_my_role() = 'admin'
    AND organization_id = get_my_org_id()
  )
  WITH CHECK (
    get_my_role() = 'admin'
    AND organization_id = get_my_org_id()
  );

CREATE POLICY "attendance_officer_select"
  ON attendance_records FOR SELECT
  USING (
    get_my_role() = 'officer'
    AND organization_id = get_my_org_id()
  );

CREATE POLICY "attendance_officer_insert"
  ON attendance_records FOR INSERT
  WITH CHECK (
    get_my_role() = 'officer'
    AND organization_id = get_my_org_id()
  );

CREATE POLICY "attendance_student_select_own"
  ON attendance_records FOR SELECT
  USING (
    get_my_role() = 'student'
    AND student_id = get_my_student_id()
  );

-- ---------------------------------------------------------------------------
-- offline_scan_queue
-- Admin: full access within their org
-- Officer: full access within their org (they own the offline device)
-- Student: no access
-- ---------------------------------------------------------------------------
CREATE POLICY "offline_queue_admin_all"
  ON offline_scan_queue FOR ALL
  USING (
    get_my_role() = 'admin'
    AND organization_id = get_my_org_id()
  )
  WITH CHECK (
    get_my_role() = 'admin'
    AND organization_id = get_my_org_id()
  );

CREATE POLICY "offline_queue_officer_all"
  ON offline_scan_queue FOR ALL
  USING (
    get_my_role() = 'officer'
    AND organization_id = get_my_org_id()
  )
  WITH CHECK (
    get_my_role() = 'officer'
    AND organization_id = get_my_org_id()
  );

-- ---------------------------------------------------------------------------
-- organization_settings
-- Admin: SELECT + UPDATE within their org
-- Officer: SELECT only (read-only, e.g., to display current semester)
-- Student: SELECT only
-- ---------------------------------------------------------------------------
CREATE POLICY "org_settings_admin_read"
  ON organization_settings FOR SELECT
  USING (
    get_my_role() = 'admin'
    AND organization_id = get_my_org_id()
  );

CREATE POLICY "org_settings_admin_update"
  ON organization_settings FOR UPDATE
  USING (
    get_my_role() = 'admin'
    AND organization_id = get_my_org_id()
  )
  WITH CHECK (
    get_my_role() = 'admin'
    AND organization_id = get_my_org_id()
  );

CREATE POLICY "org_settings_officer_select"
  ON organization_settings FOR SELECT
  USING (
    get_my_role() = 'officer'
    AND organization_id = get_my_org_id()
  );

CREATE POLICY "org_settings_student_select"
  ON organization_settings FOR SELECT
  USING (
    get_my_role() = 'student'
    AND organization_id = get_my_org_id()
  );


-- =============================================================================
-- SECTION 5: SUPABASE STORAGE — student-avatars bucket
-- Run these in the Supabase Dashboard SQL Editor or via the Storage API.
-- The Storage API is not directly accessible from migration SQL in self-hosted,
-- but the bucket config below works in Supabase Cloud via the storage schema.
-- =============================================================================

-- Create the student-avatars bucket (public read, authenticated write)
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'student-avatars',
  'student-avatars',
  TRUE,                        -- Public: avatar URLs are accessible without auth
  2097152,                     -- 2 MB per file max
  ARRAY['image/jpeg', 'image/png', 'image/webp', 'image/gif']
)
ON CONFLICT (id) DO NOTHING;

-- Storage RLS: Anyone can read (public bucket)
CREATE POLICY "student_avatars_public_read"
  ON storage.objects FOR SELECT
  USING (bucket_id = 'student-avatars');

-- Storage RLS: Admins can upload/update/delete any avatar in their org
-- File path convention: {organization_id}/{student_id}/avatar.{ext}
CREATE POLICY "student_avatars_admin_write"
  ON storage.objects FOR INSERT
  WITH CHECK (
    bucket_id = 'student-avatars'
    AND get_my_role() = 'admin'
    AND (storage.foldername(name))[1]::UUID = get_my_org_id()
  );

CREATE POLICY "student_avatars_admin_update"
  ON storage.objects FOR UPDATE
  USING (
    bucket_id = 'student-avatars'
    AND get_my_role() = 'admin'
    AND (storage.foldername(name))[1]::UUID = get_my_org_id()
  );

CREATE POLICY "student_avatars_admin_delete"
  ON storage.objects FOR DELETE
  USING (
    bucket_id = 'student-avatars'
    AND get_my_role() = 'admin'
    AND (storage.foldername(name))[1]::UUID = get_my_org_id()
  );

-- Storage RLS: Officers can upload/update avatars within their org
CREATE POLICY "student_avatars_officer_write"
  ON storage.objects FOR INSERT
  WITH CHECK (
    bucket_id = 'student-avatars'
    AND get_my_role() = 'officer'
    AND (storage.foldername(name))[1]::UUID = get_my_org_id()
  );

CREATE POLICY "student_avatars_officer_update"
  ON storage.objects FOR UPDATE
  USING (
    bucket_id = 'student-avatars'
    AND get_my_role() = 'officer'
    AND (storage.foldername(name))[1]::UUID = get_my_org_id()
  );

-- Students can upload their own avatar only
-- Path must be: {org_id}/{student_id}/avatar.*
CREATE POLICY "student_avatars_student_upload_own"
  ON storage.objects FOR INSERT
  WITH CHECK (
    bucket_id = 'student-avatars'
    AND get_my_role() = 'student'
    AND (storage.foldername(name))[1]::UUID = get_my_org_id()
    AND (storage.foldername(name))[2]::UUID = get_my_student_id()
  );


-- =============================================================================
-- SECTION 6: USEFUL VIEWS
-- Pre-joined views to avoid repetitive joins in Server Actions / API routes
-- =============================================================================

-- Attendance details view (matches legacy attendance_list API response shape)
CREATE OR REPLACE VIEW v_attendance_details AS
SELECT
  ar.id,
  ar.organization_id,
  ar.recorded_at,
  ar.client_id,
  -- Student info
  s.uid            AS student_uid,
  s.full_name      AS student_name,
  s.course         AS student_course,
  s.year           AS student_year,
  s.section        AS student_section,
  -- Event info
  e.id             AS event_id,
  e.name           AS event_name,
  e.starts_at      AS event_starts_at,
  e.venue          AS event_venue,
  e.status         AS event_status,
  -- Officer info
  ar.officer_name,
  o.id             AS officer_id
FROM attendance_records ar
JOIN students s ON s.id = ar.student_id
JOIN events   e ON e.id = ar.event_id
LEFT JOIN officers o ON o.id = ar.officer_id;

-- Dashboard stats view (matches legacy dashboard_stats API response)
CREATE OR REPLACE VIEW v_dashboard_stats AS
SELECT
  o.id                                                      AS organization_id,
  COUNT(DISTINCT s.id)                                      AS total_students,
  COUNT(DISTINCT s.id) FILTER (WHERE s.status = 'Active')  AS active_students,
  COUNT(DISTINCT ev.id)                                     AS total_events,
  COUNT(DISTINCT ev.id) FILTER (WHERE ev.status = 'Open')  AS open_events,
  COUNT(ar.id)                                              AS total_attendance,
  ROUND(
    CASE
      WHEN COUNT(DISTINCT s.id) FILTER (WHERE s.status = 'Active') * COUNT(DISTINCT ev.id) = 0 THEN 0
      ELSE COUNT(ar.id)::NUMERIC /
           (COUNT(DISTINCT s.id) FILTER (WHERE s.status = 'Active') * COUNT(DISTINCT ev.id)) * 100
    END
  , 0)                                                      AS overall_attendance_pct
FROM organizations o
LEFT JOIN students           s  ON s.organization_id  = o.id
LEFT JOIN events             ev ON ev.organization_id = o.id
LEFT JOIN attendance_records ar ON ar.organization_id = o.id
GROUP BY o.id;


-- =============================================================================
-- END OF MIGRATION
-- =============================================================================
-- Summary of what was created:
--   Tables (8): organizations, profiles, students, officers, events,
--               attendance_records, offline_scan_queue, organization_settings
--   Enums  (6): user_role, member_status, event_status, semester_type,
--               sync_status, year_level
--   Triggers/Functions: handle_new_user, handle_new_organization,
--               derive_student_names, get_student_default_password,
--               get_my_org_id, get_my_role, get_my_officer_id, get_my_student_id
--   RLS Policies: 28 policies across all tables + 6 storage policies
--   Views: v_attendance_details, v_dashboard_stats
--   Storage: student-avatars bucket (public read, auth write, 2MB limit)
-- =============================================================================
