# Owner decisions — 22–23 November 2026

| Date | Owner's words | Decision | Replaces |
|---|---|---|---|
| 2026-11-22 | "I think you will have to overwrite it? or reconcile both" → "Yeah they're live" | Reconcile on `main`'s live schema. Add guards with `CREATE OR REPLACE`; drop nothing. | Sprint branch `feat/complete-attendance-sprint`, built from a stale base |
| 2026-11-22 | "main should be synced to dev as well.." / "Just resync first, then do the next step" | `dev` fast-forwarded to `main` (`2ab251b`) and pushed. | `origin/dev` 13 commits behind |
| 2026-11-22 | "Error: Failed to run sql query: ERROR: 42701: column \"attendance_revision\" of relation \"organization_settings\" already exists (so its a success haha)" | Sprint migration `20261112063129` is live in production. Its file stays in `supabase/migrations/`. | `docs/plan.md` claim that four sprint migrations were applied (only this one is confirmed) |
| 2026-11-23 | "Supabase Auth isn't enabled" | The signup-to-admin chain is not exploitable now. Drop the `on_auth_user_created` trigger anyway. | Critical rating of review finding 0 |
| 2026-11-23 | "Vercel is now on SG region, can't change Supabase without going to another new project" / "Sydney Australia" | Vercel functions: Singapore. Supabase: Sydney. Recommendation: move functions to `syd1`. | Default `iad1` |
| 2026-11-23 | "Yes. You can use Supabase local here." | SQL tests run on `supabase start`. | No SQL test runner |
| 2026-11-23 | "I've already done it in prod." | Test student password changed after it appeared in a dev log. | — |
| 2026-11-23 | "Bring Bintanong, Binturong engineering practices here." / Decision A: "1. Yes." | Project rules live in tracked `CONTRIBUTING.md`. Agent wiring stays local and ignored. Tracked files name no AI tools. | No written contributor rules |
| 2026-11-23 | "please communicate in ASD-STE100 Simplified Technical English (STE) (when needed)" | STE for procedures, warnings and handoffs. | — |
