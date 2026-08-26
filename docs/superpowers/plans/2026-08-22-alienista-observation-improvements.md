# Alienista Observation Improvements Plan

## Phase 1: Auth And Core Integrity

- Replace the role chooser with one identifier login.
- Resolve admin, officer, student-number, and UID identifiers server-side.
- Reject ambiguous identifiers without account enumeration.
- Add explicit session subject and expiry metadata.
- Add shared authenticated and role guards.
- Replace the in-memory limiter with Supabase-backed hashed-identifier RPCs.
- Fix event attribution to use `user.role`; keep event creation admin-only.
- Add regression tests for session expiry, ngrok cookie behavior, ambiguous login, configured-password safety, officer authorization, and the admin UUID foreign-key failure.

## Phase 2: Students, Events, Attendance

- Add concurrent database-owned UID allocation.
- Make allocated UIDs read-only while preserving controlled import overrides.
- Add larger photo preview.
- Make event and slot creation transactional.
- Add event weights, late cutoffs, penalties, status, and effective scan time.

## Phase 3: Offline PWA And Mobile Reliability

- Scope and version minimal roster caches.
- Add visible sync state, retained failures, client IDs, and idempotent replay.
- Validate localhost, ngrok, same-network mobile, camera, reconnect, Chrome, and Edge flows.

## Phase 4: Canonical QR Badges

- Share one badge data model and renderer across preview, individual downloads, and mass PDF/print output.
- Add visual and generated-output regressions.

## Phase 5: Sanctions And Recovery

- Calculate proportional weighted attendance, late penalties, transparent policy tiers, and draft assessments.
- Require admin review/finalization and audit corrections.
- Generate obligation text and preserve officer-assisted recovery.

## Phase 6: Supabase Security And Performance

- Minimize grants, scope service-role queries, review RLS/views/storage/default privileges, run advisors, and measure production behavior.

## Migration Rule

All required Supabase changes remain committed imperative `.sql` migration files created through the Supabase CLI workflow. Local agent files and Graphify-generated context are intentionally ignored by `.gitignore`.
