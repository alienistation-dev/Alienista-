# Alienista Phase Log

## 2026-08-22

### Phase 1 - Auth And Core Integrity

- Confirmed rebuilt Graphify output exists in `graphify-out/`; used Graphify query results plus repository source as the implementation map.
- Added one-field server-resolved login for admin, officer, student number, and UID identifiers.
- Added ambiguity rejection and generic invalid-credential handling.
- Added explicit session subject metadata and expiry validation; retained HMAC cookies and forwarded-origin secure-cookie behavior.
- Added shared `requireSession` and `requireRole` guards.
- Replaced the in-memory limiter adapter with hashed-identifier Supabase RPC calls and an imperative SQL migration.
- Removed the role chooser from the login UI.
- Fixed event attribution to use the session role, preventing admin UUID foreign-key failures.
- Added RED/GREEN regression coverage for the above behaviors.

### Verification

- `npm test`: 34 tests passed.
- `npx tsc --noEmit`: passed after Phase 1 changes.
- Focused Phase 1 ESLint targets: passed.
- Full `npm run lint`: still fails on pre-existing React Compiler and explicit-`any` findings outside the Phase 1 slice.
- Production build reached Next.js but could not fetch Google Fonts in the restricted network environment.
- `graphify update .`: completed; SQL extraction remains unavailable because `tree_sitter_sql` is not installed.

### Phase 2 - Students, Events, And Attendance

- Created `20260821172605_phase2_students_events_attendance.sql` through the Supabase CLI.
- Added an organization/year UID counter and atomic `allocate_student_uid` database function that seeds from existing imported UIDs.
- Replaced application-side UID scanning with the database allocator.
- Made UID read-only in normal add/edit workflows while preserving explicit CSV import UIDs.
- Increased the student photo preview and added an allocation information tooltip.
- Added event weights from 1 through 20.
- Added required-slot, late-cutoff, and late-penalty fields with application and database validation.
- Replaced separate event/slot inserts with one transactional `create_event_with_slots_and_weight` RPC.
- Added server-side on-time/late boundary evaluation and persisted effective scan time, attendance status, and applied late penalty.
- Restricted scan persistence to admin/officer sessions and retained database duplicate handling for online and replayed scans.

### Phase 2 Verification

- `npm test`: 44 tests passed across 12 files.
- Focused Phase 2 ESLint targets: passed.
- `graphify update .`: completed after Phase 2 code changes.
- Supabase CLI database execution/advisors and device smoke checks remain release gates because a local Supabase stack is not configured in this checkout.

### Phase 3 - Offline PWA And Mobile Reliability

- Replaced the unscoped IndexedDB stores with versioned organization/event-scoped pending scans, audit history, metadata, and minimal roster records.
- Limited cached roster data to UID, full name, avatar URL, and active status for the selected organization and event.
- Versioned avatar caches and clear roster/media caches on logout or organization changes while preserving tenant-scoped pending scans for recovery.
- Added sync state for connectivity, pending count, progress, last successful synchronization, and actionable failures.
- Retained invalid and failed scans with attempt count, failure code, message, review state, and retry eligibility.
- Reused client-generated IDs for every retry and added a partial unique database index on organization plus client ID.
- Scoped the on-device audit log by organization and retained synced, duplicate, invalid, and error outcomes.
- Added regression coverage for cache isolation, cache-version invalidation, successful and duplicate replay removal, invalid-scan retention, and retryable failures.
- The Supabase CLI migration generator was attempted, but its telemetry write outside the workspace was blocked and the approval service returned HTTP 403. The required imperative SQL remains committed as `20260822020500_phase3_offline_replay_integrity.sql` for review and deployment.

### Phase 3 Verification

- Focused Phase 3 tests: 7 passed.
- `npx tsc --noEmit`: passed.
- Focused Phase 3 ESLint targets: passed with three existing `img` optimization warnings in scanner feedback.
- Chrome, Edge, localhost, ngrok, camera-permission, disconnect, and reconnect device smoke tests remain release gates because browser/device automation is not configured in this checkout.

### Phase 4 - Canonical QR Badge System

- Added a shared `BadgeData` model, stable QR payload serializer, export filename builder, and canonical badge specification.
- Replaced separate preview and QR-only download rendering with one canvas renderer used by the website preview and individual PNG download.
- Added a mass print surface that renders every filtered student through the same canvas function and supports browser printing or Save as PDF.
- Standardized the badge at 400 by 640 pixels with one QR size, identity field set, color palette, typography family, and ACS/Alienista branding.
- Added regression coverage for payload consistency, normalized identity fields, dimensions, colors, and generated filename behavior.

### Phase 4 Verification

- Focused badge tests: 2 passed.
- `npx tsc --noEmit`: passed.
- Focused badge ESLint targets: passed.
- Pixel-level screenshot comparison and generated PDF inspection remain browser smoke gates because no browser automation fixture is configured in the repository.

### Phase 5 - Sanctions And Recovery

- Added proportional semester assessment calculation across required event slots, including persisted late penalties and transparent missed-point or attendance-ratio tier selection.
- Added `sanction_policies`, `sanction_tiers`, `semester_assessments`, and `semester_assessment_corrections` tables with organization scoping, a seeded weighted-missed-points default policy, and finalized-row protection.
- Added an immutable event `term_key` snapshot and excludes finalized/corrected assessments from recalculation, preventing semester drift or accidental overwrite.
- Added admin-only calculation, finalization, and audited correction server actions plus the `/assessments` review surface. Officers can view assessments but cannot calculate, finalize, or correct them.
- Added officer-assisted recovery contact on login through `NEXT_PUBLIC_ACS_FACEBOOK_URL`; this checkout did not contain the actual ACS Facebook URL, so the public Facebook root is only a safe fallback and must be overridden before deployment.

### Phase 5 Verification

- `npm test`: 57 tests passed across 16 files.
- Source TypeScript verification passed with `npx tsc --noEmit --project tsconfig.verify.json` after the production build left a malformed generated `.next/dev/types/validator.ts`; the generated file was not edited.
- Focused Phase 5 ESLint targets: passed.
- Database execution, policy/RLS verification, and browser review of the assessment UI remain release gates because no Supabase project or browser/device fixture is configured locally.

### Phase 6 - Supabase Security And Performance

- Added explicit service-role grants for application tables, views, sequences, and the correction function.
- Revoked inherited direct table, sequence, and routine access from `anon` and `authenticated`, including default privileges for future objects.
- Added scoped event, student, and officer statistics projections and changed the statistics action to use those aggregates plus a bounded 500-row attendance audit read.
- Preserved organization predicates on every service-role query and on all new views.

### Phase 6 Verification

- Focused Phase 6 TypeScript and ESLint targets: passed.
- Full `npm run lint` remains failing on pre-existing explicit-`any` and React Compiler findings outside this phase; existing scanner image warnings remain warnings.
- `npm run build` compiled successfully but failed during Next generated-type validation because the existing `.next/dev/types/validator.ts` was malformed in the restricted checkout. The generated artifact was not edited.
- `graphify update .`: completed after the final code, SQL, and documentation changes; SQL remains unparsed because `tree_sitter_sql` is not installed.
- `supabase db advisors`, local migration execution, Chrome/Edge, ngrok, and same-network mobile checks remain unavailable without configured external services and browser fixtures.

### Navigation Responsiveness Improvements

- Added dashboard and student route loading boundaries, reusable skeletons, actionable route error states, and shared pending navigation feedback.
- Added development-only navigation and server-loader timing marks; cold Turbopack compilation remains distinct from warm navigation timing.
- Memoized request session verification, parallelized dashboard/settings/statistics reads, removed the unused dashboard events query, and narrowed student/event/report projections.
- Added dedicated scanner and badge student projections while preserving organization scoping and fresh reads on every navigation.
- Deferred `html5-qrcode` until camera activation and badge canvas rendering until a badge or print operation needs it.
- Fixed the assessments action parser error and added regression tests for loader query shape, projection shape, and request session memoization.

### Navigation Verification

- `npm test`: 60 tests passed across 18 files.
- Source TypeScript verification passed with `npx tsc --noEmit --project tsconfig.verify.json`.
- Production `npm run build`: passed after fixing the assessments parser error and validating the new route boundaries.
- Focused navigation ESLint targets: passed.
- Full `npm run lint` still reports three pre-existing explicit-`any` errors and eight warnings outside this navigation slice.
- Warm unauthenticated localhost checks on the existing `http://localhost:8080` server returned 9-141 ms after warm-up for redirect/login requests; authenticated content timing and mobile browser checks remain manual smoke gates.

### Schema Rollout Compatibility Fix

- Removed `events.term_key` from the normal event-management projection because that column is introduced by the later Phase 5–6 migration and may be absent during rolling deployment.
- Kept `Event.term_key` optional at the application boundary; assessment workflows still require the Phase 5–6 migration and should be enabled only after it is applied.
- Added a regression test asserting event reads remain organization-scoped and do not select `term_key` before the migration is applied.
- Verification after the compatibility fix: `npm test` passed with 61 tests across 18 files; focused TypeScript and ESLint checks passed; `npm run build` passed from `app`.
- Full lint remains blocked by three pre-existing `no-explicit-any` errors and eight warnings outside this fix.

### Badge Printing and PWA Installability Fix

- Fixed mass badge printing being blocked by opening the print tab synchronously from the click handler before lazy badge rendering begins.
- Added printable-document helpers, progress feedback, and actionable popup/rendering failure states.
- Added installable PNG icons and manifest metadata, registered `/sw.js` from the client shell, and added a native `beforeinstallprompt` install prompt with dismissal and app-installed handling.
- Install prompts remain browser/platform controlled: Chromium exposes `beforeinstallprompt`; Safari and some embedded browsers may require their own Add to Home Screen flow.
- Added regression tests for synchronous print-window opening, printable output, and manifest icon requirements.
- The final print document now invokes the browser-native print dialog from its own `load` event after the badge images are written, instead of relying on a parent-window load callback.

### Application-Code Navigation Performance Plan

- Approved plan documented in `docs/superpowers/plans/2026-08-22-alienista-application-code-navigation-performance.md`.
- Fresh reads on navigation remain mandatory; no persistent client cache, compiler change, or Turbopack change is planned.
- Execution ledger: `.superpowers/sdd/2026-08-22-alienista-application-code-navigation-performance/progress.md`.
- Initial delegated worker attempts were unavailable at the model service and made no repository changes; tasks were retried with an available worker model.

### Statistics First-Content Performance

- Split Statistics into independently loaded overview and student-section loaders while keeping fresh reads and the existing service-role/server-component architecture.
- The first-content path now queries only `v_statistics_event_summary` and `v_statistics_officer_summary`; it no longer fetches the unused `v_attendance_details` audit rows or waits for the student aggregate.
- Student attendance records load through a separate Suspense boundary with a stable table skeleton and an actionable failure state. Year filtering, CSV export, and complete-report printing remain available after that section resolves.
- `getStatisticsAction()` remains as a compatibility action for callers that still require the legacy combined response; the Statistics route uses the split loaders.
- Added route-context, overview-loader, student-loader, organization-scope, and failure-path regression coverage.
- No client cache, compiler change, Next.js/Turbopack change, or SQL migration was introduced. Query-plan/index work remains a separate evidence-driven follow-up.
- Reported baseline before this slice: `/statistics` application-code timing was approximately 400 ms. Authenticated before/after browser timings require the configured local session fixture; development logs now expose overview, event-summary, officer-summary, student-section, and student-summary timings for that measurement.
- Automated verification: 70 tests passed across 22 files; focused TypeScript and ESLint passed; production build passed. Full lint retains three pre-existing `no-explicit-any` errors and eight warnings outside this slice.
