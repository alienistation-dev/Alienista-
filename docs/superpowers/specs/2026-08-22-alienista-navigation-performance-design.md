# Alienista Navigation Performance Design

## Goal

Improve warm local navigation responsiveness without weakening authorization or serving stale operational data.

## Decisions

- Keep server-first rendering and fresh reads on every navigation.
- Keep the dashboard/student shell mounted while route content loads through segment loading boundaries.
- Use route skeletons and a pending navigation indicator for immediate feedback.
- Memoize session verification per request and parallelize independent Supabase reads.
- Replace broad route payloads with explicit projections.
- Load camera scanning and badge canvas dependencies only when needed.
- Emit timing marks and loader timings only in development.
- Treat first-visit Turbopack compilation as a separate cold-start measurement.

## Targets

- Warm navigation feedback or skeleton: under 100 ms.
- Warm route content: approximately 1 second or less on the local test dataset.
- Operational data remains fresh after navigation and mutations.

## Verification

Unit tests cover session memoization, dashboard query shape, and route projections. Local browser checks should record navigation start, skeleton visibility, and content-ready marks for desktop and mobile routes.
