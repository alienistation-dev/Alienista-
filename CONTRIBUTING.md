# Contributing to Alienista

Alienista is the attendance and membership system of the Association of Computer Scientists (ACS, est. 1994), Palawan State University. Users: admins, officers who scan QR badges at events (often offline, on mid-range Android phones), and students. The system must keep working after its student builders graduate.

App code is in `app/` (Next.js; read `app/AGENTS.md` for version notes). Database migrations are in `supabase/migrations/`.

## Start here

1. Read the newest files in `docs/reviews/` and `docs/decisions/` that apply to your task.
2. Trust Git and fresh test output over notes. If a note and the code disagree, tell the project owner.

## Workflow

- Work on a branch. Commit small, verified units. Do not leave large diffs uncommitted.
- Use test-driven development. Write the test. Run it and see it fail. Make the smallest fix. Run it and see it pass. Then run the full suite: `cd app && npm test && npx tsc --noEmit && npm run lint`.
- Stage files by name. Do not stage unrelated changes.
- Commit messages use [Conventional Commits](https://www.conventionalcommits.org/en/v1.0.0/): `type(scope): summary`, imperative, 72 characters or fewer. Types: `feat`, `fix`, `docs`, `refactor`, `test`, `perf`, `build`, `ci`, `chore`.
- Do not install or upgrade packages without the owner's approval.
- If an approach fails, stop. Report what happened and what would help. Do not retry small variations.
- Record each owner decision in `docs/decisions/YYYY-MM-DD-topic.md`: the date, the owner's exact words, and what it replaces.
- Before a new phase or a big library choice, read current official docs. Write the findings, with dates, in `docs/decisions/`.
- Write procedures, warnings and handoff notes in ASD-STE100 Simplified Technical English: short sentences, active voice, one instruction per sentence.

## Institutional rules

- Custody: the organization owns the GitHub, Vercel and Supabase resources. Document every account and the location of every secret (never the value) so a new officer can take over.
- Role separation: check the role inside every server action and database function. Do not trust the UI, the proxy or a client-supplied ID.
- Audit: corrections to attendance and assessments go through audited database functions. Do not hard-delete records that have history; archive them.
- States: draft, finalized and corrected are different states. Do not show a draft as final.
- Unknown stays unknown. Do not turn a failed query or missing data into zero, "none" or a default term. Show an unavailable state.

## Database rules

- Do not delete or rewrite a migration that production has applied. Check with `supabase migration list --linked` before you remove a file or push. A syntax-only fix to a file that never applied through the CLI is allowed; record it in the commit body.
- Every new function: `SECURITY INVOKER` unless there is a written reason, `SET search_path = public`, `REVOKE ALL ... FROM PUBLIC, anon, authenticated`, `GRANT EXECUTE ... TO service_role`.
- Test SQL locally. Start Docker. Run `supabase start`. Run each `supabase/tests/*.sql` with `psql -v ON_ERROR_STOP=1` (for example `Get-Content file.sql -Raw | docker exec -i supabase_db_<project> psql -U postgres -v ON_ERROR_STOP=1`). Do not test against production.

## Security rules

- Do not print secrets, password values or full student rows. Select explicit columns. `password_hash` must never reach a client component.
- `SESSION_SECRET` must be a random 32-byte value per environment. Generate it with `node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"`.
- Dev logging of Server Action arguments is off (`app/next.config.ts`). Do not turn it on: it prints passwords.

## UI rules

- Colours come from the ACS logo: near-black `#080808`, charcoal `#383830`, dark green ≈ `#1A3822`, white. Green is the one accent. Use the tokens in `app/src/app/globals.css`; do not write hex values in components.
- Use shadcn/ui primitives (`app/components.json`) before hand-rolled dialogs, tables and tabs.
- Build each screen around the one decision its user makes there. Design loading, empty and error states that name the cause and the next action. Work at 360px, with a keyboard and a screen reader. Minimum text size 12px.
- No decorative gradients, glow, glass, emoji or endless animation.
- Google Wallet: use only Google's official "Add to Google Wallet" button artwork, unmodified.
- Judge speed on the deployed site or `npm run build && npm start`, not `npm run dev`.
