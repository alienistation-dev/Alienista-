# Alienista Sprint Plan — Exportable for ChatGPT Codex

> **For agentic workers:** This is a self-contained plan. Read this document top-to-bottom before writing any code. Each task is independent unless stated otherwise. Use TDD: write the failing test first, make it pass, then commit.

**Goal:** Fix all known bugs, add admin enhancements, harden the offline-sync edge cases, verify the default-password security fix, add pagination, and finalize the sanctioning system UX controls.

**Architecture:** Next.js 16 App Router (React 19, Turbopack) with Supabase PostgreSQL backend, offline-first IndexedDB/Cache API for QR scanning, server actions for all mutations, Vitest for testing.

**Tech Stack:**
- Framework: Next.js 16 (App Router, `src/app/`)
- Styling: Tailwind CSS v4 with CSS variables (`globals.css`)
- Backend: Supabase (PostgreSQL, RLS, Service Role)
- Testing: Vitest (`app/tests/unit/`)
- Validation: Zod v4
- QR: `html5-qrcode` + `qrcode`
- Offline: IndexedDB (`offline-db.ts`) + Cache Storage API

**Spec:** This document is the spec. No separate design doc.

## Global Constraints

- Node.js v20+ / npm v10+
- TypeScript strict mode (`npx tsc --noEmit` must pass)
- All tests must pass: `cd app && npm test`
- Never commit `.env.local` or secrets
- All server actions live in `app/src/lib/actions/` with `'use server'` directive
- All DB access uses `createAdminClient()` from `app/src/lib/supabase/admin.ts`
- Follow existing patterns: ActionResponse<T> return types, `getEffectiveOrgId()`, `requireRole()` guards
- Commits: conventional commits (`fix:`, `feat:`, `test:`)
- Working directory for all commands: `app/` (not project root)

## File Map

```
app/src/app/globals.css                              — CSS variables (theme tokens)
app/src/app/(dashboard)/layout.tsx                   — Dashboard shell layout
app/src/app/(dashboard)/students/page.tsx            — Student Directory page
app/src/app/(dashboard)/students/student-table.tsx   — Student table component (~32KB)
app/src/app/(dashboard)/events/page.tsx              — Events Management page
app/src/app/(dashboard)/events/events-view.tsx       — Events list component (~20KB)
app/src/app/(dashboard)/scanner/page.tsx             — Scanner page
app/src/app/(dashboard)/scanner/scanner-view.tsx     — Scanner component (~23KB)
app/src/app/(dashboard)/qr-generator/page.tsx        — QR Generator page
app/src/app/(dashboard)/qr-generator/qr-generator-view.tsx — QR generator component
app/src/app/(dashboard)/statistics/page.tsx          — Analytics page
app/src/app/(dashboard)/statistics/*                 — Statistics components
app/src/app/(dashboard)/settings/page.tsx            — Settings page
app/src/app/(dashboard)/settings/settings-view.tsx   — Settings component (~18KB)
app/src/app/(dashboard)/assessments/                 — Sanctions/assessments page
app/src/lib/actions/attendance.ts                    — recordScanAction, bulkSyncScansAction
app/src/lib/actions/auth.ts                          — loginAction, changeStudentPasswordAction
app/src/lib/actions/students.ts                      — Student CRUD actions
app/src/lib/actions/settings.ts                      — Settings, officers, semester advance
app/src/lib/actions/assessments.ts                   — Sanctions assessment actions
app/src/lib/actions/statistics.ts                    — Statistics data loaders
app/src/lib/attendance/status.ts                     — evaluateAttendanceStatus()
app/src/lib/auth/resolve-login-identifier.ts         — Login resolution (admin/officer/student)
app/src/lib/offline-sync.ts                          — Offline sync reconciliation
app/src/lib/offline-db.ts                            — IndexedDB offline engine
app/src/lib/sanctions/calculate-assessment.ts        — Sanction point calculator
app/src/lib/types/models.ts                          — All TypeScript types
app/src/lib/types/actions.ts                         — ActionResponse type
app/src/hooks/use-auto-sync.ts                       — Auto-sync hook for offline scans
app/tests/unit/                                      — All unit tests (22 files)
supabase/migrations/                                 — SQL migration files (run in order)
```

---

## Task 1: Fix "All White" Dashboard Pages (Theme Bug)

**Priority:** P0 — Blocks usability of 6 pages
**Root Cause:** Dashboard layout uses `bg-[#F8FAF9]` (near-white ivory) and `text-slate-900`, but page headings use `text-white` (invisible on white) and subtitles use `text-slate-400` (barely visible on ivory). This is a leftover from a dark-theme-to-light-theme migration.

**Affected pages:** Student Directory, Events Management, QR Attendance Scanner, QR Badge Generator, Analytics & Reports, System Settings & Security.

**Files:**
- Modify: `app/src/app/(dashboard)/students/page.tsx`
- Modify: `app/src/app/(dashboard)/events/page.tsx`
- Modify: `app/src/app/(dashboard)/scanner/page.tsx` (check the heading inside `scanner-view.tsx` too)
- Modify: `app/src/app/(dashboard)/qr-generator/qr-generator-view.tsx` (or its page.tsx)
- Modify: `app/src/app/(dashboard)/statistics/page.tsx`
- Modify: `app/src/app/(dashboard)/settings/settings-view.tsx` (or its page.tsx)
- Potentially modify: `app/src/app/(dashboard)/assessments/` if it has the same issue
- Potentially modify: `app/src/app/(dashboard)/page.tsx` (main dashboard)
- Potentially modify: any component inside these pages that uses `text-white`, `text-slate-400`, `bg-slate-800`, `bg-slate-900`, `bg-gray-900` or other dark-theme classes

**Interfaces:**
- Consumes: CSS variables from `globals.css` (--foreground: #111827, --muted-foreground: #4B5563)
- Produces: Visually readable pages on the light `bg-[#F8FAF9]` background

- [ ] **Step 1: Grep for dark-theme color classes across all dashboard files**

Run a project-wide search to find every instance of dark-theme remnants:

```bash
cd app
grep -rn "text-white\|text-slate-[34]00\|bg-slate-[89]00\|bg-gray-[89]00\|bg-zinc-[89]00\|border-slate-[67]00\|text-gray-[34]00" src/app/\(dashboard\)/ --include="*.tsx"
```

Document every file and line number found. These are ALL the lines that need updating.

- [ ] **Step 2: Fix page headings — replace `text-white` with `text-foreground`**

In every dashboard `page.tsx` and view component, replace:
- `text-white` on `<h1>` → `text-foreground` (resolves to #111827, dark text on light bg)
- `text-slate-400` on `<p>` subtitles → `text-muted-foreground` (resolves to #4B5563)

Example fix in `students/page.tsx` (line 21):
```diff
-        <h1 className="text-xl sm:text-2xl font-bold text-white tracking-tight">Student Directory</h1>
+        <h1 className="text-xl sm:text-2xl font-bold text-foreground tracking-tight">Student Directory</h1>
```
```diff
-        <p className="text-xs sm:text-sm text-slate-400 mt-1">
+        <p className="text-xs sm:text-sm text-muted-foreground mt-1">
```

Apply the same pattern to: `events/page.tsx`, `scanner/page.tsx`, `statistics/page.tsx`, `settings/page.tsx` (or `settings-view.tsx`), `qr-generator/page.tsx`.

- [ ] **Step 3: Audit large view components for dark-theme styles**

Open each large view component and search for dark-mode classes. Fix them:
- `student-table.tsx` (~32KB) — search for `text-white`, `bg-slate-800`, etc.
- `events-view.tsx` (~20KB) — same search
- `scanner-view.tsx` (~23KB) — same search
- `settings-view.tsx` (~18KB) — same search
- `qr-generator-view.tsx` (~5KB) — same search
- `statistics-overview.tsx`, `student-statistics-section.tsx` — same search

**Replacement rules for all:**
| Dark-theme class | Light-theme replacement |
|---|---|
| `text-white` (on content text) | `text-foreground` |
| `text-slate-400` / `text-gray-400` | `text-muted-foreground` |
| `text-slate-300` | `text-muted-foreground` |
| `bg-slate-800` / `bg-slate-900` | `bg-card` |
| `bg-gray-800` / `bg-gray-900` | `bg-card` |
| `border-slate-700` | `border-border` |
| `border-slate-600` | `border-border` |
| `text-slate-200` | `text-card-foreground` |
| `bg-slate-700` (for inputs) | `bg-input` |

> **IMPORTANT:** Do NOT change `text-white` when it is used on buttons with colored backgrounds (e.g., `bg-primary text-white` is correct). Only change it on content text sitting on the light background.

- [ ] **Step 4: Check layout components for dark-theme styles**

Also audit:
- `app/src/components/layout/header.tsx`
- `app/src/components/layout/sidebar.tsx`
- `app/src/components/layout/bottom-tabs.tsx`

These are layout chrome — they may intentionally use dark colors for a sidebar. Only fix if the sidebar/header is invisible on the current theme.

- [ ] **Step 5: Visual verification**

Run the dev server and visually verify each of the 6 affected pages:
```bash
cd app && npm run dev
```
Navigate to each page and confirm text is readable:
1. `/students` — Student Directory
2. `/events` — Events Management
3. `/scanner` — QR Attendance Scanner
4. `/qr-generator` — QR Badge Generator
5. `/statistics` — Analytics & Reports
6. `/settings` — System Settings & Security

- [ ] **Step 6: Commit**

```bash
git add -A
git commit -m "fix: replace dark-theme text/bg classes with light-theme CSS variables across all dashboard pages"
```

---

## Task 2: Verify & Harden Default Password Security Fix

**Priority:** P0 — Security
**Context:** Students have a default password (last name uppercased). After first login, they set a permanent password. A bug was reported where the default password STILL WORKED after the student changed their password. Lawrence may have fixed this, but it needs double/triple verification for students, officers, and admins.

**Files:**
- Read: `app/src/lib/auth/resolve-login-identifier.ts` (lines 66-83 — `matchesSecret()`)
- Read: `app/src/lib/actions/auth.ts` (lines 106-131 — `changeStudentPasswordAction()`)
- Test: `app/tests/unit/auth-action.test.ts`

**Interfaces:**
- Consumes: `matchesSecret()` from `resolve-login-identifier.ts`
- Produces: Verified test coverage proving default password is rejected post-change

- [ ] **Step 1: Read and analyze the current `matchesSecret()` logic**

Open `app/src/lib/auth/resolve-login-identifier.ts` lines 66-83. The key logic is:

```typescript
// Student branch of matchesSecret():
if (row.password_hash && await bcrypt.compare(secret, row.password_hash)) return true;
if (!row.is_first_login) return false;  // ← THIS is the fix
const defaultPassword = (row.last_name || row.full_name?.split(' ').pop() || '').trim().toUpperCase();
return secret.trim().toUpperCase() === defaultPassword;
```

Verify the control flow:
1. If `password_hash` exists AND matches → allow login ✓
2. If `is_first_login` is `false` → REJECT (don't fall through to default password check) ✓
3. Default password fallback only runs when `is_first_login` is `true` ✓

- [ ] **Step 2: Verify `changeStudentPasswordAction()` sets `is_first_login: false`**

Open `app/src/lib/actions/auth.ts` line 125:
```typescript
.update({ password_hash: newHash, is_first_login: false })
```

Confirm both fields are updated atomically. ✓

- [ ] **Step 3: Write explicit regression tests**

Add or update tests in `app/tests/unit/auth-action.test.ts`:

```typescript
import { describe, it, expect } from 'vitest';

// Test the matchesSecret logic by testing resolveLoginIdentifier indirectly,
// or extract matchesSecret to be testable. Since matchesSecret is not exported,
// we test the behavior through the login flow.

describe('Default password security', () => {
  it('rejects default password after student changes password', async () => {
    // Scenario: Student has is_first_login=false and password_hash set
    // Attempting login with the default (last name uppercase) should FAIL
    //
    // Mock the Supabase client to return a student record with:
    //   - password_hash: bcrypt hash of "NEWPASSWORD123"
    //   - is_first_login: false
    //   - last_name: "MAGNETICO"
    //
    // Call loginAction with password="MAGNETICO" (the default)
    // Expect: { success: false }
  });

  it('allows default password only on first login', async () => {
    // Scenario: Student has is_first_login=true and password_hash=null
    // Attempting login with last name uppercase should SUCCEED
    //
    // Mock student record with:
    //   - password_hash: null
    //   - is_first_login: true
    //   - last_name: "MAGNETICO"
    //
    // Call loginAction with password="MAGNETICO"
    // Expect: { success: true, data: { must_change_password: true } }
  });

  it('rejects default password for officer login', async () => {
    // Officers use pin_hash, no default fallback should exist
    // Attempt officer login with empty pin → should fail
  });

  it('rejects default password for admin login', async () => {
    // Admins use admin_password_hash, no default fallback should exist
    // Attempt admin login with empty hash → should fail
  });
});
```

Adapt the test structure to match the existing mock patterns in `auth-action.test.ts`. The existing file already has Supabase mocking patterns — follow them.

- [ ] **Step 4: Run the tests**

```bash
cd app && npx vitest run tests/unit/auth-action.test.ts -v
```

All tests must PASS. If any fail, the security fix has a gap — fix the gap in `resolve-login-identifier.ts`.

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "test: add regression tests verifying default password is rejected after password change"
```

---

## Task 3: Admin — Modify Student Attendance Details Per Event

**Priority:** P1
**Context:** Admins need to edit/modify a student's attendance record for a specific event (e.g., change status from 'late' to 'on_time', or delete an incorrect record). Currently only `manualAttendanceOverrideAction()` exists for INSERT-only overrides.

**Files:**
- Create: `app/src/lib/actions/attendance-admin.ts` — new server action for update/delete
- Modify: `app/src/app/(dashboard)/students/student-table.tsx` — add attendance edit UI per student
- Modify OR Create: attendance detail modal/dialog component
- Test: `app/tests/unit/attendance-admin.test.ts`

**Interfaces:**
- Consumes: `createAdminClient()`, `getEffectiveOrgId()`, `requireRole('admin')`, `ActionResponse<T>`
- Produces: `updateAttendanceRecordAction(input: { record_id: string; attendance_status?: AttendanceStatus; late_penalty_percent?: number })` and `deleteAttendanceRecordAction(record_id: string)`

- [ ] **Step 1: Write the failing test for `updateAttendanceRecordAction`**

Create `app/tests/unit/attendance-admin.test.ts`:

```typescript
import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock Supabase and session
vi.mock('@/lib/supabase/admin', () => ({
  createAdminClient: vi.fn(),
  getEffectiveOrgId: vi.fn().mockResolvedValue('org-1'),
}));
vi.mock('@/lib/session', () => ({
  getSessionUser: vi.fn(),
}));

describe('updateAttendanceRecordAction', () => {
  it('updates attendance_status for a valid record', async () => {
    // Mock admin session, mock Supabase update returning success
    // Call updateAttendanceRecordAction({ record_id: 'rec-1', attendance_status: 'on_time' })
    // Expect: { success: true }
  });

  it('rejects non-admin users', async () => {
    // Mock officer session
    // Expect: { success: false, error: contains 'admin' }
  });
});

describe('deleteAttendanceRecordAction', () => {
  it('deletes the attendance record', async () => {
    // Mock admin session, mock Supabase delete returning success
    // Call deleteAttendanceRecordAction('rec-1')
    // Expect: { success: true }
  });
});
```

- [ ] **Step 2: Run tests — verify they fail**

```bash
cd app && npx vitest run tests/unit/attendance-admin.test.ts -v
```

Expected: FAIL (functions don't exist yet)

- [ ] **Step 3: Implement `updateAttendanceRecordAction` and `deleteAttendanceRecordAction`**

Create `app/src/lib/actions/attendance-admin.ts`:

```typescript
'use server';

import { createAdminClient, getEffectiveOrgId } from '@/lib/supabase/admin';
import { requireRole } from '@/lib/auth/guards';
import { ActionResponse } from '@/lib/types/actions';
import { AttendanceStatus } from '@/lib/types/models';
import { revalidatePath } from 'next/cache';

export async function updateAttendanceRecordAction(input: {
  record_id: string;
  attendance_status?: AttendanceStatus;
  late_penalty_percent?: number;
}): Promise<ActionResponse> {
  let user;
  try { user = await requireRole('admin'); }
  catch { return { success: false, error: 'Only admins can modify attendance records.' }; }

  const orgId = await getEffectiveOrgId(user.organization_id);
  const admin = createAdminClient();

  const updates: Record<string, unknown> = {};
  if (input.attendance_status) updates.attendance_status = input.attendance_status;
  if (input.late_penalty_percent !== undefined) updates.late_penalty_percent = input.late_penalty_percent;

  if (Object.keys(updates).length === 0) return { success: false, error: 'No fields to update.' };

  const { error } = await admin
    .from('attendance_records')
    .update(updates)
    .eq('id', input.record_id)
    .eq('organization_id', orgId);

  if (error) return { success: false, error: error.message };
  revalidatePath('/students');
  revalidatePath('/statistics');
  return { success: true, data: undefined, message: 'Attendance record updated.' };
}

export async function deleteAttendanceRecordAction(recordId: string): Promise<ActionResponse> {
  let user;
  try { user = await requireRole('admin'); }
  catch { return { success: false, error: 'Only admins can delete attendance records.' }; }

  const orgId = await getEffectiveOrgId(user.organization_id);
  const admin = createAdminClient();

  const { error } = await admin
    .from('attendance_records')
    .delete()
    .eq('id', recordId)
    .eq('organization_id', orgId);

  if (error) return { success: false, error: error.message };
  revalidatePath('/students');
  revalidatePath('/statistics');
  return { success: true, data: undefined, message: 'Attendance record deleted.' };
}
```

- [ ] **Step 4: Run tests — verify they pass**

```bash
cd app && npx vitest run tests/unit/attendance-admin.test.ts -v
```

- [ ] **Step 5: Add attendance edit UI to the student table**

In `app/src/app/(dashboard)/students/student-table.tsx`, add:
1. An "Attendance" action button per student row (visible only when `userRole === 'admin'`)
2. A dialog/modal that lists the student's attendance records for the current term
3. Each record should show: event name, slot label, status, penalty, with Edit/Delete buttons
4. Edit opens an inline form with status dropdown (`on_time` | `late` | `manual`) and penalty % input
5. Delete requires confirmation

Follow the existing dialog/modal patterns already used in this component (search for existing `Dialog` or `Modal` usage).

- [ ] **Step 6: Commit**

```bash
git add -A
git commit -m "feat: admin attendance record modification (update status/penalty, delete)"
```

---

## Task 4: Admin — Update Student Profile Picture After Initial Set

**Priority:** P1
**Context:** Currently, once a student's profile picture is set, it cannot be updated. Admins need to re-upload photos for 1st years who initially had no pictures.

**Files:**
- Modify: `app/src/lib/actions/students.ts` — find the avatar upload action and remove the "already has avatar" guard
- Modify: `app/src/app/(dashboard)/students/student-table.tsx` — ensure the upload button is visible even when `avatar_url` is not null

**Interfaces:**
- Consumes: Existing avatar upload action in `students.ts`
- Produces: Ability to overwrite existing avatars

- [ ] **Step 1: Find the avatar upload logic**

```bash
cd app && grep -n "avatar" src/lib/actions/students.ts
```

Look for any guard like `if (student.avatar_url) return { success: false, ... }` or similar early-return that blocks re-upload.

- [ ] **Step 2: Remove or relax the guard**

If a guard exists, remove it. If the upload logic uses `insert` instead of `upsert` for the storage bucket, change it to overwrite:

```typescript
// Replace insert-or-skip with overwrite:
const { error } = await admin.storage
  .from('student-avatars')
  .upload(filePath, fileBuffer, { upsert: true }); // ensure upsert: true
```

- [ ] **Step 3: Update the UI to show the upload button regardless**

In `student-table.tsx`, find the photo/avatar upload button. Remove any conditional rendering that hides it when `avatar_url` is already set. The button should always be visible for admins.

- [ ] **Step 4: Verify in dev**

```bash
cd app && npm run dev
```

1. Navigate to `/students`
2. Click on a student who already has an avatar
3. Upload a new photo
4. Confirm the old photo is replaced

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "feat: allow admins to re-upload student profile pictures"
```

---

## Task 5: Pagination for Students, QR Generator, and Statistics

**Priority:** P1
**Context:** These tabs load all data at once. Apply pagination to handle large student rosters.

**Files:**
- Modify: `app/src/lib/actions/students.ts` — add `page` and `pageSize` params to `getStudentsAction`
- Modify: `app/src/app/(dashboard)/students/student-table.tsx` — client-side pagination controls
- Modify: `app/src/app/(dashboard)/qr-generator/qr-generator-view.tsx` — pagination
- Modify: `app/src/app/(dashboard)/statistics/student-statistics-section.tsx` — pagination

**Interfaces:**
- Consumes: Supabase `.range(from, to)` for server-side pagination
- Produces: Paginated data with `{ data: T[], total: number, page: number, pageSize: number }`

- [ ] **Step 1: Add pagination to `getStudentsAction`**

In `app/src/lib/actions/students.ts`, modify `getStudentsAction` to accept optional `page` and `pageSize`:

```typescript
export async function getStudentsAction(
  page: number = 1,
  pageSize: number = 50
): Promise<ActionResponse<{ students: Student[]; total: number }>> {
  // ... existing auth/org logic ...

  const from = (page - 1) * pageSize;
  const to = from + pageSize - 1;

  const { data, error, count } = await admin
    .from('students')
    .select('*', { count: 'exact' })
    .eq('organization_id', orgId)
    .order('full_name')
    .range(from, to);

  return { success: true, data: { students: data || [], total: count || 0 } };
}
```

> **IMPORTANT:** This changes the return type. Update ALL callers:
> - `app/src/app/(dashboard)/students/page.tsx` — pass `res.data.students` instead of `res.data`
> - Any other file that calls `getStudentsAction`

- [ ] **Step 2: Add pagination UI component**

Create a reusable pagination component or use client-side pagination within each view. A simple approach:

```typescript
// In student-table.tsx, add state:
const [currentPage, setCurrentPage] = useState(1);
const PAGE_SIZE = 50;
// Fetch on page change via useTransition + server action
```

Add Previous/Next buttons and a page indicator at the bottom of the table.

- [ ] **Step 3: Apply same pattern to QR Generator**

In `qr-generator-view.tsx`, if it loads all students for badge generation, apply the same pagination pattern. Students should be paginated in the grid.

- [ ] **Step 4: Apply same pattern to Statistics**

In `student-statistics-section.tsx`, paginate the per-student statistics table.

- [ ] **Step 5: Test pagination**

```bash
cd app && npm run dev
```

Verify each paginated page shows correct data, Previous/Next work, and the total count is accurate.

- [ ] **Step 6: Commit**

```bash
git add -A
git commit -m "feat: add pagination to student directory, QR generator, and statistics pages"
```

---

## Task 6: Offline Sync Edge Case Hardening

**Priority:** P0 — Data integrity
**Context:** Complex offline scenarios need testing and potential code fixes. The key scenarios:

1. Officer loses internet 5 minutes before event window closes
2. Officer keeps scanning until the cutoff time
3. Late students are scanned after the window's `late_cutoff_at`
4. When internet reconnects and scans sync, the server must still evaluate `attendance_status` based on the **original scan timestamp** (from the device), not the sync time
5. On-time scans must remain on-time; late scans must remain late
6. Scans that occurred AFTER `closes_at` must be REJECTED (not approved) on sync
7. No race conditions between concurrent sync batches

**Files:**
- Read: `app/src/lib/offline-sync.ts` — `PendingScan.timestamp`, `reconcileSyncResults()`
- Read: `app/src/lib/actions/attendance.ts` — `recordScanAction()` (line 56: `const scanTime = input.timestamp ? new Date(input.timestamp) : new Date()`)
- Read: `app/src/lib/attendance/status.ts` — `evaluateAttendanceStatus()`
- Test: `app/tests/unit/offline-sync.test.ts`
- Test: `app/tests/unit/attendance-action.test.ts`
- Test: `app/tests/unit/attendance-status.test.ts`

**Interfaces:**
- Consumes: `PendingScan.timestamp` (client-side device time), `evaluateAttendanceStatus(scanTime, slot)`
- Produces: Verified test suite covering all offline edge cases

### Key Analysis

The current code in `recordScanAction()` line 56:
```typescript
const scanTime = input.timestamp ? new Date(input.timestamp) : new Date();
```

This is CORRECT — when syncing offline scans, `bulkSyncScansAction` passes each scan to `recordScanAction` which uses the original `timestamp` from the `PendingScan`. The `PendingScan` interface (line 18 of `offline-sync.ts`) stores `timestamp: string` which is the device's local time at scan.

The `evaluateAttendanceStatus()` function (line 22-28 of `status.ts`) throws `'Outside active attendance window.'` if the scan time is outside `[opens_at, closes_at]`, which would cause `recordScanAction` to return `OUTSIDE_WINDOW` error — correctly rejecting post-window scans.

### What needs verification:

- [ ] **Step 1: Write edge-case tests for offline-to-sync flow**

Add to `app/tests/unit/attendance-action.test.ts`:

```typescript
describe('Offline sync edge cases', () => {
  it('preserves on_time status when scan timestamp is before late_cutoff_at', async () => {
    // Slot: opens_at=09:00, closes_at=12:00, late_cutoff_at=09:30
    // Scan timestamp: 09:15 (on_time)
    // Sync happens at: 12:30 (after window close)
    // Expected: attendance_status = 'on_time'
  });

  it('preserves late status when scan timestamp is after late_cutoff_at but before closes_at', async () => {
    // Slot: opens_at=09:00, closes_at=12:00, late_cutoff_at=09:30
    // Scan timestamp: 10:00 (late)
    // Sync happens at: 12:30
    // Expected: attendance_status = 'late'
  });

  it('REJECTS scan when timestamp is after closes_at', async () => {
    // Slot: opens_at=09:00, closes_at=12:00
    // Scan timestamp: 12:05 (after window)
    // Sync happens at: 12:30
    // Expected: { success: false, code: 'OUTSIDE_WINDOW' }
  });

  it('REJECTS scan when timestamp is before opens_at', async () => {
    // Slot: opens_at=09:00, closes_at=12:00
    // Scan timestamp: 08:55
    // Expected: { success: false, code: 'OUTSIDE_WINDOW' }
  });
});
```

- [ ] **Step 2: Write edge-case tests for `evaluateAttendanceStatus`**

Add to `app/tests/unit/attendance-status.test.ts`:

```typescript
describe('evaluateAttendanceStatus edge cases', () => {
  it('throws for scan exactly 1ms after closes_at', () => {
    const slot = {
      opens_at: '2026-09-01T09:00:00Z',
      closes_at: '2026-09-01T12:00:00Z',
      late_cutoff_at: '2026-09-01T09:30:00Z',
      late_penalty_percent: 50,
    };
    expect(() => evaluateAttendanceStatus('2026-09-01T12:00:00.001Z', slot)).toThrow();
  });

  it('accepts scan exactly at closes_at (boundary)', () => {
    const slot = {
      opens_at: '2026-09-01T09:00:00Z',
      closes_at: '2026-09-01T12:00:00Z',
      late_cutoff_at: '2026-09-01T09:30:00Z',
      late_penalty_percent: 50,
    };
    const result = evaluateAttendanceStatus('2026-09-01T12:00:00.000Z', slot);
    expect(result.status).toBe('late'); // after late_cutoff but within window
  });

  it('accepts scan exactly at opens_at (boundary)', () => {
    const slot = {
      opens_at: '2026-09-01T09:00:00Z',
      closes_at: '2026-09-01T12:00:00Z',
      late_cutoff_at: '2026-09-01T09:30:00Z',
      late_penalty_percent: 50,
    };
    const result = evaluateAttendanceStatus('2026-09-01T09:00:00.000Z', slot);
    expect(result.status).toBe('on_time');
  });
});
```

- [ ] **Step 3: Write race-condition test for `reconcileSyncResults`**

Add to `app/tests/unit/offline-sync.test.ts`:

```typescript
describe('reconcileSyncResults race conditions', () => {
  it('handles duplicate client_ids in results (idempotent)', () => {
    const scans: PendingScan[] = [
      { client_id: 'scan-1', organization_id: 'org-1', student_uid: 'uid-1',
        event_id: 'evt-1', officer_name: 'Officer',
        timestamp: '2026-09-01T09:15:00Z', attempts: 0, failure: null },
    ];
    const results: SyncScanResult[] = [
      { client_id: 'scan-1', success: true },
      { client_id: 'scan-1', success: true }, // duplicate
    ];
    const { completedClientIds, retained } = reconcileSyncResults(scans, results);
    expect(completedClientIds).toHaveLength(1);
    expect(retained).toHaveLength(0);
  });

  it('retains scan when result is missing (partial sync failure)', () => {
    const scans: PendingScan[] = [
      { client_id: 'scan-1', organization_id: 'org-1', student_uid: 'uid-1',
        event_id: 'evt-1', officer_name: 'Officer',
        timestamp: '2026-09-01T09:15:00Z', attempts: 0, failure: null },
      { client_id: 'scan-2', organization_id: 'org-1', student_uid: 'uid-2',
        event_id: 'evt-1', officer_name: 'Officer',
        timestamp: '2026-09-01T09:20:00Z', attempts: 0, failure: null },
    ];
    const results: SyncScanResult[] = [
      { client_id: 'scan-1', success: true },
      // scan-2 result missing — network dropped mid-sync
    ];
    const { completedClientIds, retained } = reconcileSyncResults(scans, results);
    expect(completedClientIds).toEqual(['scan-1']);
    expect(retained).toHaveLength(1);
    expect(retained[0].client_id).toBe('scan-2');
  });
});
```

- [ ] **Step 4: Run all tests**

```bash
cd app && npx vitest run -v
```

ALL tests must pass. If any edge case fails, fix the implementation:
- If scans after `closes_at` are being accepted, the slot validation in `recordScanAction` has a bug
- If `reconcileSyncResults` has issues with missing results, it needs a fallback

- [ ] **Step 5: Verify `bulkSyncScansAction` processes in serial batches**

Confirm in `attendance.ts` line 166-183 that the `BATCH_SIZE = 10` loop processes batches sequentially (it does — the `for` loop awaits each batch). This prevents race conditions from concurrent INSERT attempts for the same student+event+slot.

- [ ] **Step 6: Commit**

```bash
git add -A
git commit -m "test: comprehensive offline sync edge case tests (window boundaries, race conditions, late status preservation)"
```

---

## Task 7: Supabase Loading Performance Enhancement

**Priority:** P2
**Context:** Data from Supabase holds up loading the UI elements. The app should show UI skeletons immediately and load data asynchronously.

**Files:**
- Modify: `app/src/app/(dashboard)/students/page.tsx` — add Suspense boundary
- Modify: `app/src/app/(dashboard)/events/page.tsx` — add Suspense boundary
- Modify: `app/src/app/(dashboard)/settings/page.tsx` — add Suspense boundary
- Create: skeleton components for each page if they don't exist
- Modify: `app/next.config.ts` — verify Turbopack optimizations

**Interfaces:**
- Consumes: React Suspense, Next.js streaming
- Produces: Instant page shell render with streaming data

- [ ] **Step 1: Convert blocking server-rendered pages to Suspense streaming**

The `statistics/page.tsx` already uses the correct pattern (Suspense with deferred promises). Apply the same pattern to other pages.

Example conversion for `students/page.tsx`:

```typescript
import React, { Suspense } from 'react';
import { getStudentsAction } from '@/lib/actions/students';
import { getSessionUser } from '@/lib/session';
import { StudentTable } from './student-table';

function StudentTableSkeleton() {
  return <div className="animate-pulse space-y-3">
    <div className="h-10 bg-muted rounded-lg w-full" />
    {Array.from({ length: 8 }).map((_, i) => (
      <div key={i} className="h-12 bg-muted/60 rounded-lg w-full" />
    ))}
  </div>;
}

async function DeferredStudentTable(
  { promise, userRole }: {
    promise: ReturnType<typeof getStudentsAction>;
    userRole: string;
  }
) {
  const res = await promise;
  if (!res.success) {
    return (
      <div className="p-6 rounded-2xl bg-destructive/10 border border-destructive
                      text-destructive text-sm">
        Failed to load students: {res.error}
      </div>
    );
  }
  return <StudentTable initialStudents={res.data} userRole={userRole} />;
}

export default async function StudentsPage() {
  const user = await getSessionUser();
  const studentsPromise = getStudentsAction();

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl sm:text-2xl font-bold text-foreground tracking-tight">
          Student Directory
        </h1>
        <p className="text-xs sm:text-sm text-muted-foreground mt-1">
          {user?.role === 'admin'
            ? 'Manage registered students, issue ID credentials, and export data.'
            : 'Directory roster view for officers.'}
        </p>
      </div>
      <Suspense fallback={<StudentTableSkeleton />}>
        <DeferredStudentTable
          promise={studentsPromise}
          userRole={user?.role || 'officer'}
        />
      </Suspense>
    </div>
  );
}
```

Apply the same pattern to `events/page.tsx` and `settings/page.tsx`.

- [ ] **Step 2: Verify Turbopack is enabled**

Check `app/next.config.ts`:

```bash
cat app/next.config.ts
```

If it does not explicitly enable Turbopack, the `npm run dev` script already uses it (Next.js 16 uses Turbopack by default for dev). No changes needed unless build performance is the concern.

- [ ] **Step 3: Add `loading.tsx` files where missing**

The dashboard layout already has `loading.tsx`. Verify each route group has one:
```bash
find app/src/app -name "loading.tsx" -type f
```

Add `loading.tsx` to any route group missing it:
```typescript
export default function Loading() {
  return <div className="animate-pulse space-y-4">
    <div className="h-8 bg-muted rounded-lg w-48" />
    <div className="h-64 bg-muted/60 rounded-2xl w-full" />
  </div>;
}
```

- [ ] **Step 4: Commit**

```bash
git add -A
git commit -m "perf: add Suspense streaming and skeleton loading for dashboard pages"
```

---

## Task 8: Sanctioning System — Admin Toggle & Explicit Controls

**Priority:** P1
**Context:** The sanctioning system backend is already implemented (`calculate-assessment.ts`, `assessments.ts`, sanctions DB tables). Two enhancements are needed:

1. **An explicit control UI** that admins must configure before sanctions are active (sanction policy creation, point ranges per event, tier definitions)
2. **A global toggle** in Settings to enable/disable the sanctions system entirely

**Files:**
- Modify: `app/src/lib/types/models.ts` — add `sanctions_enabled: boolean` to `OrganizationSettings`
- Modify: `app/src/lib/actions/settings.ts` — add `toggleSanctionsAction(enabled: boolean)`
- Modify: `app/src/app/(dashboard)/settings/settings-view.tsx` — add toggle switch
- Modify: `app/src/lib/actions/assessments.ts` — check `sanctions_enabled` before calculating
- Create: SQL migration `supabase/migrations/20260830000000_sanctions_toggle.sql` — add column
- Test: `app/tests/unit/sanctions.test.ts` — test the toggle guard

**Interfaces:**
- Consumes: `OrganizationSettings.sanctions_enabled`, `getSettingsDataAction()`
- Produces: Global sanctions toggle in Settings UI, guard in assessment actions

- [ ] **Step 1: Create the database migration**

Create `supabase/migrations/20260830000000_sanctions_toggle.sql`:

```sql
-- Add global sanctions toggle to organization_settings
ALTER TABLE organization_settings
  ADD COLUMN IF NOT EXISTS sanctions_enabled boolean NOT NULL DEFAULT false;

COMMENT ON COLUMN organization_settings.sanctions_enabled IS
  'Global toggle for the sanctioning system. When false, assessments cannot
   be calculated or finalized.';
```

- [ ] **Step 2: Update TypeScript types**

In `app/src/lib/types/models.ts`, add to `OrganizationSettings`:

```diff
 export interface OrganizationSettings {
   id: string;
   organization_id: string;
   academic_year: string;
   semester: SemesterType;
   admin_username?: string;
+  sanctions_enabled: boolean;
   updated_at: string;
 }
```

- [ ] **Step 3: Add `toggleSanctionsAction`**

In `app/src/lib/actions/settings.ts`:

```typescript
export async function toggleSanctionsAction(
  enabled: boolean
): Promise<ActionResponse> {
  const user = await getSessionUser();
  if (!user || user.role !== 'admin')
    return { success: false, error: 'Unauthorized.' };

  const orgId = await getEffectiveOrgId(user.organization_id);
  const admin = createAdminClient();

  const { error } = await admin
    .from('organization_settings')
    .update({ sanctions_enabled: enabled })
    .eq('organization_id', orgId);

  if (error) return { success: false, error: error.message };
  revalidatePath('/settings');
  revalidatePath('/assessments');
  return {
    success: true,
    data: undefined,
    message: enabled
      ? 'Sanctions system enabled.'
      : 'Sanctions system disabled.',
  };
}
```

Also update `getSettingsDataAction` to include `sanctions_enabled` in its select query.

- [ ] **Step 4: Guard assessment actions**

In `app/src/lib/actions/assessments.ts`, at the start of `calculateSemesterAssessment`:

```typescript
// After loading org settings for term resolution, also check sanctions_enabled
const { data: settingsData } = await admin
  .from('organization_settings')
  .select('academic_year, semester, sanctions_enabled')
  .eq('organization_id', orgId)
  .maybeSingle();

if (!settingsData?.sanctions_enabled) {
  return {
    success: false,
    error: 'The sanctions system is currently disabled. Enable it in '
         + 'Settings before calculating assessments.',
  };
}
```

Apply the same guard to `finalizeSemesterAssessment`.

- [ ] **Step 5: Add toggle switch to Settings UI**

In `app/src/app/(dashboard)/settings/settings-view.tsx`, add a toggle switch section:

```tsx
{/* Sanctions System Toggle */}
<div className="flex items-center justify-between p-4 rounded-xl bg-card
                border border-border">
  <div>
    <h3 className="font-semibold text-card-foreground">Sanctions System</h3>
    <p className="text-sm text-muted-foreground">
      Enable or disable the attendance sanctions system for this semester.
    </p>
  </div>
  <button
    type="button"
    onClick={async () => {
      const res = await toggleSanctionsAction(!sanctionsEnabled);
      if (res.success) setSanctionsEnabled(!sanctionsEnabled);
    }}
    className={`relative inline-flex h-6 w-11 rounded-full transition-colors
      ${sanctionsEnabled ? 'bg-primary' : 'bg-muted'}`}
  >
    <span className={`inline-block h-5 w-5 transform rounded-full bg-white
      shadow transition-transform
      ${sanctionsEnabled ? 'translate-x-5' : 'translate-x-0.5'} mt-0.5`} />
  </button>
</div>
```

- [ ] **Step 6: Update tests**

Add to `app/tests/unit/sanctions.test.ts`:

```typescript
describe('Sanctions toggle guard', () => {
  it('rejects assessment calculation when sanctions_enabled is false', async () => {
    // Mock settings with sanctions_enabled: false
    // Call calculateSemesterAssessment
    // Expect: { success: false, error: contains 'disabled' }
  });
});
```

- [ ] **Step 7: Run all tests**

```bash
cd app && npx vitest run -v
```

- [ ] **Step 8: Commit**

```bash
git add -A
git commit -m "feat: add global sanctions toggle in settings with assessment guard"
```

---

---

## Task 9: Google Wallet Student Badge & Extensible Tap-to-Log Attendance

**Priority:** P1
**Context:** Enable students to save their membership badge into Google Wallet as a Generic Pass. Attendance scanning remains 100% optical camera QR (scanning phone screens or paper), with an extensible Web NFC door provided for compatible Android PWAs. An admin toggle in Settings enables/disables the feature with a single non-breaking column addition.

### Preparatory Google Wallet Console Setup (Issuer: `3388000000023183187`)

1. **Authorize Service Account (Crucial):**
   * Under [Google Pay & Wallet Console](https://pay.google.com/business/console) > **Google Wallet API > Users / Service Accounts**, invite your GCP service account (e.g. `wallet-dev@...iam.gserviceaccount.com`) as **Developer** or **Admin**.
2. **Provision Generic Pass Class (`/generic/create`):**
   * Direct Link: `https://pay.google.com/business/console/passes/BCR2DN6DVLZMZF25/issuer/3388000000023183187/generic/create`
   * Fill out the form fields section-by-section:
      | Form Section & Field | Exact Value to Enter / Select | Notes / Rationale |
      | :--- | :--- | :--- |
      | **General > Class ID \*** | `student_badge_dev` | Console prefixes with `3388000000023183187.` Full ID: `3388000000023183187.student_badge_dev` |
      | **General > Multiple devices and holders allowed status** | `One user, multiple devices` (`ONE_USER_ALL_DEVICES`) | Allows student's phone & smartwatch, prevents unauthorized sharing across accounts |
      | **Image Modules > Image Module 1 > Image URL** | *Leave Blank* | Dynamic student avatar is injected dynamically in the Next.js pass object |
      | **Text Modules > Text Module 1 > Header & Body** | *Leave Blank* | Student Number, Section, and Status are injected dynamically per student by the app |
      | **Link Modules > Link Module 1 > Link Label** | `Alienista Portal` | Clickable label on pass details in Google Wallet |
      | **Link Modules > Link Module 1 > Link URL** | `https://alienista.vercel.app` (or dev URL) | URL opened when clicking the link |
      | **Smart Tap Settings > Enable Smart Tap?** | **NO / Unchecked** | Alienista uses optical camera QR scanning; Smart Tap requires dedicated merchant terminals |
      | **Redemption Issuers** | *Leave Blank* | N/A (retail loyalty only) |
      | **Callback Settings > Callback URL & Update request URL** | *Leave Blank* | N/A (our signed JWT flow is completely stateless) |
3. **Configure Demo Allowlist:**
   * Under **Google Wallet API > Test accounts**, add `lesleyvancepaxley@gmail.com` and `lawsmagnet6@gmail.com` (Netorare) to allow pass saving during Demo Mode.

**Files:**
- Create: `supabase/migrations/20260905000000_google_wallet_settings.sql`
- Create: `app/src/lib/badges/google-wallet.ts`
- Create: `app/src/lib/actions/google-wallet.ts`
- Create: `app/src/hooks/use-nfc-reader.ts`
- Modify: `app/src/lib/types/models.ts`
- Modify: `app/src/lib/actions/settings.ts`
- Modify: `app/src/components/badges/badge-card.tsx`
- Modify: `app/src/app/(student)/my-qr/page.tsx`
- Modify: `app/src/app/(dashboard)/settings/settings-view.tsx`
- Modify: `app/src/app/(dashboard)/students/student-table.tsx`
- Modify: `app/src/app/(dashboard)/scanner/scanner-view.tsx`
- Test: `app/tests/unit/google-wallet.test.ts`
- Test: `app/tests/unit/settings-google-wallet.test.ts`
- Test: `app/tests/unit/badge-wallet-ui.test.ts`
- Test: `app/tests/unit/nfc-reader.test.ts`

**Interfaces:**
- Consumes: `Student`, `createAdminClient()`, `getEffectiveOrgId()`, `node:crypto`
- Produces: `generateGoogleWalletSaveUrl(student)`, `toggleGoogleWalletAction(enabled)`, `useNfcReader({ onScan })`

- [ ] **Step 1: Create minimal migration and settings toggle**

Create `supabase/migrations/20260905000000_google_wallet_settings.sql`:
```sql
ALTER TABLE public.organization_settings
  ADD COLUMN IF NOT EXISTS google_wallet_enabled BOOLEAN NOT NULL DEFAULT false;
```
Update `OrganizationSettings` in `app/src/lib/types/models.ts` to include `google_wallet_enabled?: boolean`.
In `app/src/lib/actions/settings.ts`, export `toggleGoogleWalletAction(enabled: boolean)`.

- [ ] **Step 2: Implement pure `node:crypto` pass minting**

Create `app/src/lib/badges/google-wallet.ts`:
- Build generic object embedding `student.uid` in `barcode: { type: 'QR_CODE', value: student.uid }`.
- Sign JWT with RS256 via `node:crypto` using `GOOGLE_WALLET_PRIVATE_KEY`.
- Return `https://pay.google.com/gp/v/save/<jwt>`.

Create server action `app/src/lib/actions/google-wallet.ts`:
- Export `getStudentGoogleWalletUrlAction(studentId?: string)`.

- [ ] **Step 3: Add "Save to Google Wallet" button to student badge UI**

In `app/src/components/badges/badge-card.tsx`:
- Add optional `walletSaveUrl?: string | null` prop.
- Render Google Wallet button below "Download Badge PNG".

In `app/src/app/(student)/my-qr/page.tsx`:
- Pass `walletUrl` when `google_wallet_enabled` is true and env credentials exist.

In `app/src/app/(dashboard)/students/student-table.tsx`:
- Add a "Wallet Pass" preview link in student actions for admins.

- [ ] **Step 4: Add Google Wallet switch to Admin Settings UI**

In `app/src/app/(dashboard)/settings/settings-view.tsx`:
- Add an interactive toggle switch calling `toggleGoogleWalletAction`.

- [ ] **Step 5: Add extensible Web NFC hook for PWA tap-to-log**

Create `app/src/hooks/use-nfc-reader.ts`:
- Check for `window.NDEFReader`.
- Extract `student_uid` from text or URI records.

In `app/src/app/(dashboard)/scanner/scanner-view.tsx`:
- Mount `useNfcReader` with `onScan: handleDecodedText` while keeping camera scanner active.

- [ ] **Step 6: Write unit tests and verify**

Run: `cd app && npx vitest run tests/unit/google-wallet.test.ts tests/unit/settings-google-wallet.test.ts tests/unit/badge-wallet-ui.test.ts tests/unit/nfc-reader.test.ts -v`
All tests must pass.

- [ ] **Step 7: Commit**

```bash
git add -A
git commit -m "feat: add Google Wallet student pass with admin toggle and extensible NFC hook"
```

---

## Task 10: TypeScript & Lint Verification

**Priority:** P0 — Must pass before any PR

- [ ] **Step 1: Run TypeScript compiler**

```bash
cd app && npx tsc --noEmit
```

Fix any type errors.

- [ ] **Step 2: Run ESLint**

```bash
cd app && npm run lint
```

Fix any lint errors.

- [ ] **Step 3: Run all tests**

```bash
cd app && npm test
```

All tests must pass.

- [ ] **Step 4: Commit any fixes**

```bash
git add -A
git commit -m "chore: fix TypeScript and lint errors"
```

---

## Execution Order

Tasks can be worked on in this order for optimal dependency flow:

1. **Task 1** (Theme bug) — unblocks visual testing of all other tasks
2. **Task 2** (Password security) — security first, pure test task
3. **Task 6** (Offline edge cases) — pure test task, no code changes expected
4. **Task 7** (Loading performance) — Suspense streaming
5. **Task 4** (Avatar re-upload) — small feature
6. **Task 5** (Pagination) — medium feature
7. **Task 3** (Attendance edit) — medium feature, needs UI work
8. **Task 8** (Sanctions toggle) — medium feature, needs migration + UI
9. **Task 9** (Google Wallet & NFC) — pass minting, admin switch, NFC hook
10. **Task 10** (Final verification) — always last

Tasks 2, 6 are independent and can run in parallel.
Tasks 3, 4, 5 are independent and can run in parallel after Task 1.
Task 8 and Task 9 depend on nothing but should be done after Task 1 (to verify the toggle UI).
Task 10 must be last.

