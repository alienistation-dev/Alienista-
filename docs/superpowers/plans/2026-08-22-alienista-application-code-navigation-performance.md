# Alienista Application-Code Navigation Performance Plan

## Objective

Reduce warm local navigation latency in application code while keeping the shared shell responsive, operational reads fresh, and all existing authentication, authorization, organization scoping, and offline behavior intact.

## Decisions

- Fresh data is fetched on every navigation; no persistent client data cache or stale snapshot rendering is introduced.
- Next.js, TypeScript, Turbopack, and compiler configuration are unchanged.
- Session and organization context are resolved once per request and reused by route loaders.
- Scanner uses an open-event projection and the minimal active roster projection.
- Existing exported server-action contracts remain compatible; optimization is implemented behind route loaders and private helpers.
- No SQL migration is part of the first pass. A later index migration requires measured query-plan evidence and must be an imperative `.sql` migration created through the Supabase CLI.
- Development timing logs are retained only in development and are not sent to production telemetry.

## Execution Tasks

1. Add typed request context reuse and granular development loader timings.
2. Add route-specific Events and Scanner loaders with narrow projections and concurrent reads.
3. Add regression tests for context reuse, query shape, concurrency, organization scoping, and route failures.
4. Run tests, focused TypeScript/ESLint, full lint/build, warm-route measurements, and `graphify update .`.
5. Append implementation and verification results to `docs/superpowers/phase-log.md`.

## Statistics First-Content Slice

- The Statistics route starts overview and student promises together, but renders the page heading immediately.
- Event turnout and officer activity are streamed through a fast overview boundary.
- Student attendance rows are streamed through a separate boundary with a stable table skeleton and actionable error state.
- The route path does not query `v_attendance_details`; the compatibility `getStatisticsAction()` remains available for non-route callers.

## Conflict Scan

| Tasks | Shared boundary | Result |
| --- | --- | --- |
| Context helper + route loaders | `getSessionUser`, `getEffectiveOrgId`, admin client | Route loaders consume the helper; mutation actions retain their own guards. |
| Events loader + Scanner loader | `events` and `event_slots` projections | Scanner receives only open-event fields; Events keeps management fields and remains free of `term_key`. |
| Diagnostics + tests | `withServerTiming` and loader outputs | Timings are development-only; tests assert behavior rather than console output. |
| Code changes + documentation | `phase-log.md` and this plan | Documentation records decisions and measurements after implementation. |

## Acceptance

- Warm local navigation feedback remains under approximately 100 ms through the existing shell and loading boundaries.
- Events and Scanner application-code timing materially improves, targeting approximately 250 ms median on the existing dataset.
- Fresh reads, organization predicates, authorization, offline scanner scope, and existing action APIs do not regress.
- `npm test`, focused TypeScript, focused ESLint, `npm run lint`, and `npm run build` results are recorded honestly.
