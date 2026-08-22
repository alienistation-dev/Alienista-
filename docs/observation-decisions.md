# Alienista Observation Decisions

This document records the choices made from the Chrome, Edge, localhost, ngrok, mobile, and offline-PWA observation flow. It is intended as an explanation record for later maintenance and review.

## Authentication And Authorization

- Keep the custom admin, officer, and student credential model; do not migrate these accounts to Supabase Auth in this improvement program.
- Use one login form. The server accepts an admin username, officer name, student number, UID, or UID-like account identifier and resolves the role.
- Reject identifiers that match more than one account with a generic, actionable message. Do not reveal which account types exist.
- Keep HMAC-signed HTTP-only session cookies, but include subject type, subject ID, organization, role, issued-at, and expiry metadata.
- Enforce authentication and role checks on the server through shared guards.
- Admins alone create and edit events. Officers scan attendance and view operational data.
- Use a Supabase-backed, hashed-identifier rate limiter so limits work across serverless instances.

## Database And Tenant Integrity

- Keep migration history as imperative `.sql` files generated through the Supabase CLI workflow.
- Scope service-role reads and writes by organization.
- Never infer a role from the text shape of a UUID. Event attribution uses `user.role`, so an admin UUID cannot be written to the officer foreign key.
- Preserve database uniqueness and transaction boundaries for attendance and offline replay.

## Events, Attendance, And Sanctions

- Event weights are configured from 1 through 20.
- Multi-slot attendance earns proportional event points.
- Late cutoffs and late-point penalties are configurable per slot.
- Sanctions produce transparent, reviewable obligation text, not a payment ledger.
- Assessments are drafts until an administrator explicitly finalizes them; finalized records require audited corrections.

## Offline And Mobile Operation

- Cache only the minimal roster fields needed for the active organization and event.
- Version and clear caches on logout or organization change.
- Make online state, pending work, sync progress, last success, and actionable failures visible.
- Keep invalid and failed scans visible for review and make retries idempotent with client IDs plus database constraints.
- Validate localhost, ngrok HTTPS, same-network mobile access, camera permissions, reconnect, Chrome, and Edge behavior before release.

## Canonical Badges And Recovery

- Define one badge data model and renderer and reuse it for web preview, individual QR downloads, and mass print/PDF output.
- Keep payload, identity fields, colors, typography, dimensions, and branding identical across outputs.
- Keep password recovery officer-assisted and point users to the fixed ACS Facebook destination.
- Semester identity uses the existing `organization_settings.academic_year` and `semester` values as a stable `${academic_year}:${semester}` term key; no separate semester table is introduced in this program.
- Each event snapshots that term key at creation, so later semester advancement cannot move historical attendance into a new assessment.
- The default sanction policy is weighted missed points with tiers at 1 and 5 missed points. A percentage-based policy remains supported per organization.
- Assessments are drafts until an admin explicitly finalizes them. Finalized values are immutable; corrections must carry a reason and an before/after audit snapshot.
- Statistics use database-owned organization-scoped aggregate projections; recent raw attendance audit output is intentionally bounded to 500 rows.
- The actual ACS Facebook URL is deployment configuration (`NEXT_PUBLIC_ACS_FACEBOOK_URL`) because no canonical URL was present in the supplied observations or repository.

## Performance And Supabase Security

- Keep the service-role key server-only.
- Replace blanket public grants with minimum grants and review RLS, views, security-definer helpers, storage policies, and default privileges.
- Replace broad roster/statistics reads with scoped projections or aggregates.
- Measure production latency, query count, payload size, and mobile behavior before setting targets.
