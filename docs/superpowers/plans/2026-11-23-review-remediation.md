# Review remediation plan — 2026-11-23

Source: `docs/reviews/2026-11-22-review.md` (findings by number). Branch: `feat/sprint-reconcile`.
This file holds the order, status and research. Update it in place; history stays in git.

Status words: **Done** (committed, tests pass), **In progress**, **Planned**, **Blocked** (needs the owner).

## Checklist

Code (details in Phases below):
- [x] 1. Database and secrets
- [x] 2. Access control
- [x] 3. Speed, part 1 (browser check still open)
- [x] 4. Offline shell
- [x] 5. Offline replay
- [x] 6. Wallet lifecycle: official button, ID-only save link, pass state on deactivation (mocked API only)
- [x] 7. UI tokens and ACS colours (0 hex colours left in `.tsx`)
- [x] 8. Speed, part 2: reloads, login round trip, badge wait, fonts (region deferred)
- [x] 9. Screen review at 360 px, production build, local data: 11 screens, admin and student

Follow-ups found in phases 6–9:
- [x] Printed badge and Wallet pass use ACS colours (`2ab6d92`)
- [ ] Deferred by owner 2026-11-23 ("Maybe defer it for now. Or maybe some kind of a souvenir?"): semester advance sets 4th years Inactive in SQL, but their Wallet passes stay ACTIVE. Possible design: keep the pass as an alumni keepsake that no scanner accepts
- [ ] Wallet calls not yet tested against the real Google API (needs a test issuer)
- [ ] Statistics student table is wider than a phone; it scrolls, but the Year column starts off-screen
- [ ] Uppercase tracked labels on stat cards and table headers (style drift, low)

Owner:
- [x] Rotate `SESSION_SECRET` in Vercel Production (owner, 2026-11-23)
- [x] Production database catch-up (2026-11-23), see "Production database" below
- [ ] Set Vercel function region to `syd1` — deferred by owner 2026-11-23 ("for now, maybe no"; again "No for now.")
- [x] Merge into `dev` (fast-forward; now `1af1615`, 2026-11-23). Owner: "the feat should be in dev for now (but once im ok with it, then go to main"
- [x] Merge `dev` to `main` (fast-forward to `2ab6d92`, 2026-11-23). Owner: "Go." Tests 201/201, `tsc` and build passed first

Parked:
- [ ] My Clearance (needs CSG consent and an owner decision)

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
| 6 | Wallet lifecycle | 11, JWT size, official button | **Done** (`508b3ff`) | Official artwork; ID-only JWT (~740 chars); inactive/deleted students' passes set INACTIVE. Google API mocked only |
| 7 | UI tokens | 437 hex colours, ACS palette, 9–10px text, manifest `id`/colours | **Done** (`39a0921`) | 0 hex colours in `.tsx`; manifest uses logo colours. Printed badge/Wallet pass colours left for owner |
| 8 | Speed, part 2 | region, remaining reloads (settings, policy editor, import), login latency, badge PNG wait | **Done** (`d0796b9`), region deferred | No full reloads; login one round trip shorter. Not yet measured on the deployed site |
| 9 | Screen-by-screen UI and Wallet UI review | — | **Done** (`1af1615`) | 11 screens at 360 px, admin and student, production build on local data. Wallet button not seen live (Wallet disabled locally) |
| — | Medium findings 7, 9, 10, manual slot check, auto-sync batch size | 7, 9, 10, Medium list | Planned | One test each |

## Production database (project `izznqcirnxazbpyqcach`, Sydney)

Work only in `C:\Users\Hawksprey\source\repos\Alienista-reconcile` (branch `feat/sprint-reconcile`). The other checkouts do not have the current migrations.

**Caught up 2026-11-23.** The CLI history now matches the schema, so future migrations go out with plain `npx supabase db push`.

What was found: migrations had been applied by hand, so the history table was empty. Everything was live except `correct_semester_assessment` (from `20260822033000`), `google_wallet_design` (`20260905000001`, never applied: it had a syntax error) and the two new migrations. The `anon`/`authenticated` revokes from `20260822033000` were confirmed live, and the avatar MIME list (`20260829180000`) was already set.

Steps done:
1. [x] `supabase/checks/migration-markers.sql` and `supabase/checks/missing-objects.sql` (read-only).
2. [x] Catch-up migration `20261123080000_restore_correct_semester_assessment.sql`, tested locally in both orders with `20261123090000`.
3. [x] `migration repair --status applied` for the 13 live versions: `001`–`004`, `20260821164553`, `20260821172605`, `20260822020500`, `20260822033000`, `20260829180000`, `20260830071747`, `20260830073118`, `20260905000000`, `20261112063129`.
4. [x] `db push --include-all`: dry run, then pushed `20260905000001`, `20261122130000`, `20261123080000` and `20261123090000`.
5. [x] Re-ran both checks with `npx supabase db query --linked -f <file>`. All markers are present; only the intentionally dropped `handle_new_user` and `on_auth_user_created` are missing. `correct_semester_assessment` is SECURITY INVOKER and only `service_role` can execute it.

Other owner items: `syd1` region (deferred), approve `dev` → `main`.
## Parked

- "My Clearance" page reading the CSG clearance sheet. Needs CSG consent and an owner decision. The CSG's sheet currently exposes every student's record to anyone with one student's link.
