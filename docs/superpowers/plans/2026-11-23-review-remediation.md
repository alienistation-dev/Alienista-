# Review remediation plan — 2026-11-23

Source: `docs/reviews/2026-11-22-review.md` (findings by number). Branch: `feat/sprint-reconcile`.
This file holds the order, status and research. Update it in place; history stays in git.

Status words: **Done** (committed, tests pass), **In progress**, **Planned**, **Blocked** (needs the owner).

## Research used (read 2026-11-22/23)

| Topic | Source | What it decided |
|---|---|---|
| Client router cache | Next.js 16 bundled docs, `01-app/.../prefetching.md` | Dynamic pages are not cached on the client by default. `experimental.staleTimes.dynamic: 30` reuses a visited page for 30 s; `revalidatePath` still clears it. |
| Dev logging of action arguments | `next/dist/server/app-render/action-handler.js` | Next prints Server Action arguments only when `NODE_ENV=development`. `logging.serverFunctions: false` stops it. Production never printed them. |
| Service worker caching | Next.js build output (`.next/static` names are hashed); no external doc re-read | Files under `/_next/static/` are content-hashed, so cache-first is safe. Pages are per-user and must not be cached as a shared fallback. |
| Google Wallet button | developers.google.com/wallet/generic/resources/brand-guidelines | Use only Google's official button artwork, unmodified, min height 48 dp, 8 dp clear space. |
| Google Wallet save URL | Review measurement (Reviewer A); docs not re-read | A save JWT that embeds the whole object measured ~2,100 chars; safe length is ~1,800. Create the object by API, then sign an ID-only JWT. |
| PostgREST `ilike` | Checked on local Supabase | `%`, `_` and `*` are wildcards; `\` escapes `%` and `_`. |
| Regions | Owner, Vercel/Supabase dashboards | Supabase: Sydney. Vercel functions: Singapore. Move functions to `syd1`. |

## Phases

| # | Phase | Findings | Status | Done when |
|---|---|---|---|---|
| 1 | Database and secrets | 0, 1, 2, sanctions trigger, migrations apply from scratch | **Done** | SQL tests pass on local Supabase; app refuses a weak `SESSION_SECRET` in production |
| 2 | Access control | 3–6, `ilike` wildcards | **Done** | Unit tests for each; PostgREST escape checked locally |
| 3 | Speed, part 1 | slowness 1, 3 (assessments) | **Done** | `staleTimes` in build output. Browser check **not done** |
| 4 | Offline shell | 12–15 | **Done** | Production build checked in a browser: CSS `200 text/css` from cache offline; offline navigation shows `/offline.html`. Pending v1 scans are kept, but they have no `organization_id`, so they do not sync |
| 5 | Offline replay | 8, 16–18 | **Done** | Unit tests only (database mocked). Open: an officer can still backdate a replay by up to 7 days; replays into closed events without slots are refused; admin-captured scans are credited to whoever syncs |
| 6 | Wallet lifecycle | 11, JWT size, official button | Planned | Official artwork; ID-only JWT under 1,800 chars; inactive students' passes set inactive |
| 7 | UI tokens | 437 hex colours, ACS palette, 9–10px text, manifest `id`/colours | Planned | Colours come from tokens; manifest uses logo colours |
| 8 | Speed, part 2 | region, remaining reloads (settings, policy editor, import), login latency, badge PNG wait | Planned | Measured on the deployed site |
| 9 | Screen-by-screen UI and Wallet UI review | — | Planned | Each screen checked at 360 px with its main task, empty and error states |
| — | Medium findings 7, 9, 10, manual slot check, auto-sync batch size | 7, 9, 10, Medium list | Planned | One test each |

## Owner actions (blocked on the owner)

1. Rotate `SESSION_SECRET` in Vercel Production **before** deploying phase 1.
2. `supabase migration list --linked`; if `20261112063129` or `20260905000001` shows as not applied remotely, `supabase migration repair --status applied <version>`; then `supabase db push`.
3. Set the Vercel function region to `syd1`.
4. Approve merging `feat/sprint-reconcile` to `main` and the deploy.

## Parked

- "My Clearance" page reading the CSG clearance sheet. Needs CSG consent and an owner decision. The CSG's sheet currently exposes every student's record to anyone with one student's link.
