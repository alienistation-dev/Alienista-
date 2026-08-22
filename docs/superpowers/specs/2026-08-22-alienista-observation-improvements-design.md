# Alienista Observation Improvements Design

## Context

Observation across Chrome, Edge, localhost, ngrok, mobile, and offline-PWA workflows exposed role-selection drift, custom-session gaps, an event attribution foreign-key failure, deployment-unsafe rate limiting, and insufficient offline visibility.

## Design

The program is phased. Phase 1 establishes the trust boundary: a server-resolved identifier login, explicit HMAC session subjects and expiry, centralized role guards, shared rate-limit persistence, and role-based event attribution. Later phases build on those invariants for UID allocation, transactional events, offline synchronization, canonical badges, sanctions, and Supabase hardening.

## Interfaces

- `resolveLoginIdentifier(identifier, secret)` resolves one unambiguous account and returns an explicit session subject.
- `requireSession()` rejects unauthenticated requests.
- `requireRole(...roles)` enforces server-side role authorization.
- `allocateStudentUid(organizationId)` will own concurrent UID allocation in Phase 2.
- `createEventWithSlotsAndWeight(input)` will provide the transactional Phase 2 event boundary.
- `calculateSemesterAssessment(semesterId, policyId)` and `finalizeSemesterAssessment(assessmentId)` will provide the Phase 5 assessment boundary.

## Security Invariants

1. A client cannot select or forge its role.
2. Expired or malformed HMAC sessions are rejected.
3. An organization-scoped record is never read or written outside its organization.
4. Admin UUIDs are never inserted into `created_by_officer_id`.
5. Login throttling works across instances without storing raw identifiers.

## Verification

Each phase requires failing tests first, focused green tests, the full Vitest suite, lint/build checks, and the applicable desktop/mobile smoke validation before release.
