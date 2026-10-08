# SDD ledger - plan: docs/superpowers/plans/2026-08-22-alienista-application-code-navigation-performance.md

## Conflict Scan

- Context helper and route loaders share session/org boundaries; ruling: private route loaders reuse context while mutation actions keep independent authorization checks.
- Events and Scanner share database tables; ruling: scanner uses open events and minimal fields, while Events remains management-scoped and excludes `term_key`.
- Diagnostics and tests share timing helpers; ruling: timing output is development-only and tests assert query behavior, not log text.
- Documentation and code share the phase log; ruling: append implementation and verification evidence after each task group.

## Rulings

- Ruling: preserve fresh reads on every navigation - user selected this policy, and stale operational data is unsafe for attendance workflows.
- Ruling: make no compiler or Next.js configuration changes - current latency is in application loaders, not compilation configuration.
- Ruling: do not add a migration in the first pass - existing indexes cover the primary predicates and query-plan evidence is required before schema changes.

## Task Status

- Task 1: complete - request context retained for Statistics loaders; context test corrected to assert fields and call counts.
- Task 2: complete - Statistics overview and student loaders plus streaming boundaries implemented.
- Task 3: complete - loader projections, organization scoping, failure handling, and context regression tests added.
- Task 4: complete - full tests, production build, focused checks, diff check, and Graphify update completed.
- Task 5: complete - plan and phase log updated with rationale and compatibility notes.
