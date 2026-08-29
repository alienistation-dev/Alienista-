# Alienista Attendance System — Design Specification

> **Project:** Serverless attendance system for PSU student organizations (ACS)
> **Stack:** Next.js 15 (App Router) · TypeScript · Tailwind CSS · Shadcn UI · Supabase
> **Hosting:** Vercel free tier · Budget: $0/month
> **Date:** 2026-08-14

---

## 1. Overview

A full rebuild of the legacy Django/SQLite attendance system into a modern, serverless architecture. The system allows Admins to manage students, events, and officers; Officers to scan QR codes for attendance (with offline support); and Students to view their own attendance records.

### Key Architectural Decisions

| Decision | Choice | Rationale |
|---|---|---|
| Architecture | Monolithic App Router (Approach A) | Simplest, fewest moving parts, Server Actions eliminate REST boilerplate |
| Auth | Hybrid: Supabase Auth (admin) + signed cookies (officer/student) | No email required for officers/students, matches legacy behavior |
| Multi-tenancy | `organization_id` FK on all tables | Single Supabase project, ACS-only for now |
| Offline | IndexedDB queue + optimistic-online with 3s timeout + auto-sync | Handles flaky/flapping connectivity at PSU |
| UI | Mobile-first adaptive (bottom tabs → sidebar) | Primary users are officers on phones at outdoor events |
| Deployment | Vercel auto-deploy + GitHub Actions CI | $0 budget, preview deploys on PR |

---

## 2. User Roles & Permissions

| Capability | Admin | Officer | Student |
|---|---|---|---|
| Dashboard | ✅ Full stats | ✅ Full stats | ❌ |
| Students | ✅ Full CRUD | ✅ Read-only | ❌ |
| Events | ✅ Full CRUD + slots | ✅ Read-only | ❌ |
| Scanner | ✅ Can scan | ✅ Can scan | ❌ |
| QR Generator | ✅ Generate + print | ✅ Generate + print | ❌ |
| Statistics | ✅ Full reports | ✅ Full reports | ❌ |
| Device Audit Log | ✅ View | ✅ View | ❌ |
| Settings | ✅ Semester, officers, admin creds | ❌ | ❌ |
| Manual attendance override | ✅ Add/remove records | ❌ | ❌ |
| My QR Badge | ❌ | ❌ | ✅ |
| My Attendance | ❌ | ❌ | ✅ |

---

## 3. Layout & Navigation

### Mobile-First Adaptive Strategy

**Mobile (< 768px):**
- Bottom tab bar with 4-5 role-filtered icon tabs
- Tables collapse to stacked card lists
- Modals become full-screen bottom sheets

**Tablet (768px–1024px):**
- Collapsible icon sidebar
- 2-column card grids
- Tables with horizontal scroll

**Desktop (> 1024px):**
- Persistent labeled sidebar
- Full table views, 2-3 column dashboard grids

### Route Structure

```
src/app/
├── (auth)/
│   ├── login/page.tsx              ← Unified login (role selector)
│   └── layout.tsx                  ← Centered layout, no nav
│
├── (dashboard)/
│   ├── layout.tsx                  ← Sidebar/bottom tabs + role guard
│   ├── page.tsx                    ← Dashboard
│   ├── students/page.tsx           ← Student roster
│   ├── events/page.tsx             ← Events management
│   ├── scanner/page.tsx            ← QR scanner ("use client")
│   ├── qr-generator/page.tsx       ← Badge generator ("use client")
│   ├── statistics/page.tsx         ← Reports & charts
│   ├── device-log/page.tsx         ← Local audit trail ("use client")
│   └── settings/page.tsx           ← Admin-only settings
│
├── (student)/
│   ├── layout.tsx                  ← Student bottom tabs
│   ├── my-qr/page.tsx              ← Student's badge
│   └── my-attendance/page.tsx      ← Student's attendance history
```

---

## 4. Authentication & Session Management

### Three Auth Flows

**Admin → Supabase Auth:**
- Email + password via `supabase.auth.signInWithPassword()`
- Session managed by `@supabase/ssr` cookies
- `profiles` table provides role + organization_id

**Officer → Custom Session Cookie:**
- Name + PIN via Server Action
- PIN verified with `bcryptjs.compare()` against `officers.pin_hash`
- Signed HTTP-only cookie: `{ role: 'officer', officer_id, organization_id, name }`

**Student → Custom Session Cookie:**
- UID or student number + password via Server Action
- Password verified with `bcryptjs.compare()` against `students.password_hash`
- Default password: last name uppercase (compound prefix aware: "De La Cruz" → "DE LA CRUZ")
- `is_first_login` flag → forces password change before proceeding
- Signed HTTP-only cookie: `{ role: 'student', student_id, organization_id, name }`

### Middleware Route Protection

```
middleware.ts reads:
  1. Supabase Auth session cookie (admin)
  2. Custom signed session cookie (officer/student)

Route guards:
  /login            → always allow
  /(dashboard)/*    → admin OR officer
  /(dashboard)/settings → admin only
  /(student)/*      → student only
  no session        → redirect to /login
```

### Session Library (`src/lib/session.ts`)

- `createSession(payload)` — HMAC-signs and sets HTTP-only cookie
- `getSession()` — reads, verifies, returns payload or null
- `destroySession()` — clears cookie
- Uses Web Crypto API (`crypto.subtle`) — no external JWT library

### Rate Limiting

- 5 failed attempts per identifier → locked for 5 minutes
- IP-based tracking via `x-forwarded-for`
- State stored in a `login_attempts` Supabase table or in-memory Map

---

## 5. Data Layer

### Supabase Client Factories

| Client | File | Context | Purpose |
|---|---|---|---|
| Browser | `src/lib/supabase/client.ts` | `"use client"` | Reads cookies from browser |
| Server | `src/lib/supabase/server.ts` | Server Components, Actions | Reads cookies from `next/headers` |
| Admin | `src/lib/supabase/admin.ts` | Server Actions (RLS bypass) | Uses service role key |

### Server Actions

```
src/lib/actions/
├── auth.ts          ← login, logout, changePassword, resetPassword
├── students.ts      ← CRUD, CSV import, bulk promote
├── events.ts        ← CRUD, open/close, slot management
├── attendance.ts    ← recordScan, bulkSync, manualOverride, getStats
├── officers.ts      ← CRUD, resetPIN
├── settings.ts      ← getSettings, updateSemester, updateAdminCreds
└── dashboard.ts     ← getDashboardStats
```

Each action: Zod validation → session check → Supabase query → typed response.

### Action Response Type

```typescript
type ActionResponse<T> =
  | { success: true; data: T }
  | { success: false; error: string; code?: string }
```

### TypeScript Types

```
src/lib/types/
├── database.ts      ← Supabase generated types
├── models.ts        ← Student, Event, Officer, AttendanceRecord, EventSlot
└── actions.ts       ← ActionResponse<T>, SessionPayload, LoginCredentials
```

### Data Fetching Pattern

- **Server Components:** Direct Supabase queries, data arrives with HTML (no loading spinners)
- **Client Components:** `useEffect` + state for Scanner, QR Generator, Device Log
- **Mutations:** Server Actions → `revalidatePath()` to refresh server-rendered data

---

## 6. Database Schema Additions

### New Table: `event_slots`

```sql
event_slots
├── id               UUID PK
├── organization_id  UUID FK → organizations
├── event_id         UUID FK → events (ON DELETE CASCADE)
├── label            TEXT ("Morning Time-In", "Afternoon Time-Out", etc.)
├── slot_type        ENUM ('am_in', 'am_out', 'pm_in', 'pm_out')
├── opens_at         TIMESTAMPTZ
├── closes_at        TIMESTAMPTZ
├── status           ENUM ('upcoming', 'active', 'closed')
├── created_at       TIMESTAMPTZ
```

### Modified: `attendance_records`

```sql
+ slot_id    UUID FK → event_slots (nullable — backward compatible)
```

Unique constraint changes: `(student_id, event_id)` → `(student_id, event_id, slot_id)` so a student can be scanned once per slot.

### Events Without Slots

If no slots are defined, the event works like the legacy system — `status` (Open/Closed) controls scanning, no time window validation. Fully backward compatible.

---

## 7. Event Attendance Slots

### Admin Flow

1. Create/edit event → add 1–4 time-windowed slots
2. Each slot: label, type (am_in/am_out/pm_in/pm_out), opens_at, closes_at
3. Slots auto-transition: `upcoming` → `active` (at opens_at) → `closed` (at closes_at)

### Scanner Behavior

**Online:**
- Scanner auto-detects the currently active slot from the event's slot list
- If no slot is active → "No active attendance window" → scans rejected
- Active slot shown with countdown: "Morning Time-In closes in 23m"
- Countdown turns amber at < 5 minutes

**Offline:**
- Cached event data includes all slot definitions with time windows
- Scan stored with `client_timestamp` from device clock
- On sync, server compares `client_timestamp` against slot windows:
  - Inside a window → ✅ recorded with that `slot_id`
  - Outside all windows → ❌ rejected with explanation message

### Admin Manual Override

- Admin can manually add/remove attendance records for any student on any event/slot
- Manual records tagged with `officer_name: "Admin (Manual)"` for audit trail
- Available from the event's attendance detail view via "Add Attendance Manually" action
- Admin-only (RLS enforced)

---

## 8. Offline / PWA Architecture

### Core Strategy: Write-Local-First

Every scan is saved to IndexedDB **before** attempting the network call. The student sees feedback in <100ms regardless of connectivity.

```
QR Scan → Save to IndexedDB (instant)
        → Try server with 3s AbortController timeout
           ├── 201 Success   → update local status to "synced"
           ├── 409 Duplicate → update local status to "duplicate"
           ├── Timeout/Error → keep as "pending" (⚡ Saved Offline)
           └── Invalid       → update local status to "invalid"
```

### IndexedDB Stores (`src/lib/offline-db.ts`)

| Store | Purpose |
|---|---|
| `pending_scans` | Queued scans waiting to sync |
| `device_scan_history` | Permanent on-device audit log |
| `cached_students` | Offline student name lookup |
| `cached_events` | Offline event list + slot definitions |

### Flapping Connectivity Handling

- `useAutoSync` hook listens for `online` event
- On reconnect: waits 2 seconds (debounce), then auto-syncs pending scans
- If sync request fails (flapped back offline): backs off, retries on next `online`
- Sync badge in header shows pending count (yellow dot)
- Toast: "3 offline scans synced ✓"

### 3-Second Timeout

```typescript
const controller = new AbortController();
const timeout = setTimeout(() => controller.abort(), 3000);
```

No scan ever waits more than 3 seconds for server feedback.

### Deduplication (3 layers)

1. **Database:** `UNIQUE (student_id, event_id, slot_id)` constraint
2. **Server Action:** Pre-check query before INSERT
3. **Client:** `client_id` field prevents same offline scan from double-submitting on retry

### PWA Manifest + Service Worker

- `public/manifest.json` — installable PWA, standalone display, theme: #0B1120
- `public/sw.js` — caches app shell (HTML/CSS/JS) for offline page loads
- API calls NOT cached (IndexedDB handles data)
- Added late in the build order

---

## 9. UI Component Architecture

### Shadcn Components

button, input, label, select, dialog, sheet, table, card, badge, tabs, dropdown-menu, sonner (toast), skeleton, avatar

### Custom Components

```
src/components/
├── layout/
│   ├── sidebar.tsx               ← Desktop/tablet nav
│   ├── bottom-tabs.tsx           ← Mobile nav
│   ├── nav-items.tsx             ← Role-filtered nav config
│   └── header.tsx                ← Org name, semester, user, logout
│
├── scanner/
│   ├── qr-scanner.tsx            ← html5-qrcode React wrapper
│   ├── scan-result.tsx           ← PRESENT / DUPLICATE / INVALID banner
│   ├── manual-input.tsx          ← Manual UID entry
│   ├── recent-scans.tsx          ← Session scan list
│   └── slot-countdown.tsx        ← Active slot timer
│
├── badges/
│   ├── badge-card.tsx            ← Student ID badge with QR
│   └── badge-grid.tsx            ← Paginated bulk badges
│
├── charts/
│   ├── donut-chart.tsx           ← SVG donut (attendance %)
│   ├── bar-chart.tsx             ← SVG bars (horizontal + vertical)
│   └── stat-card.tsx             ← Dashboard metric card
│
├── data-table/
│   ├── data-table.tsx            ← Responsive table wrapper
│   ├── data-table-mobile.tsx     ← Card-list for mobile
│   └── columns/                  ← Column defs per entity
│
└── shared/
    ├── confirm-dialog.tsx        ← Destructive action confirmation
    ├── empty-state.tsx           ← "No data" placeholder
    ├── search-input.tsx          ← Debounced search
    └── pagination.tsx            ← Page controls
```

### Responsive Data Tables

- ≥768px: Standard `<table>` with sortable columns
- <768px: Stacked card list, `...` dropdown for row actions
- Single `<DataTable>` component with `useMediaQuery` hook, two render paths

### Scanner Feedback

- **ScanResult component:** Full-width colored banner (not a small toast) for ✓ PRESENT / ALREADY SCANNED / ✕ INVALID
- **Audio beeps:** Web Audio API tones matching legacy beep() function
- **Sonner toasts:** For general CRUD notifications

---

## 10. Design System

### Theme

- **Dark mode default** matching legacy look
- Navy base (#0B1120 / #151E33), gold accents (#D4AF37), forest green status (#2F6B4F)
- Optional light mode toggle
- Font: Geist (bundled with Next.js via `next/font`)

### Status Colors

| Status | Color |
|---|---|
| Active / Open / Present / Synced | Forest green (#2F6B4F) |
| Inactive / Closed | Slate / muted |
| Duplicate / Already Scanned | Amber (#D97706) |
| Invalid / Error | Rust (#B91C1C) |
| Saved Offline / Pending | Blue (#0284C7) |
| Alumni | Purple / muted |

---

## 11. CI/CD & Deployment

### GitHub Actions

**`ci.yml` — on pull_request → main:**
1. Checkout + Node 20 + npm ci
2. TypeScript typecheck (`tsc --noEmit`)
3. ESLint (`next lint`)
4. Build (`next build`)

**`deploy.yml` — on push → main:**
1. Same lint + typecheck + build checks
2. Vercel auto-deploys via Git integration

### Vercel Configuration

- Root Directory: `app` (Next.js lives in `./app/` subdirectory)
- Environment variables: NEXT_PUBLIC_SUPABASE_URL, NEXT_PUBLIC_SUPABASE_ANON_KEY, SUPABASE_SERVICE_ROLE_KEY, SESSION_SECRET, NEXT_PUBLIC_SITE_URL
- Preview deploys on every PR (automatic)

### Environment Strategy

Single Supabase project for all environments (appropriate for $0 budget).

---

## 12. Build Order

1. **Auth & Login** — Session library, middleware, login page, role-based redirect
2. **Layout & Navigation** — Sidebar/bottom tabs, header, role-filtered nav
3. **Dashboard** — Stat cards, donut chart, bar charts, recent activity
4. **Students** — CRUD table, CSV import, search/filter/sort/paginate
5. **Events** — CRUD, slot management, open/close toggle
6. **Scanner** — QR scanner, manual input, scan result, slot countdown, offline queue
7. **QR Generator** — Badge cards, bulk print, canvas PNG download
8. **Statistics** — Reports, charts, CSV export, print
9. **Device Audit Log** — IndexedDB history viewer, CSV export
10. **Settings** — Semester management, officer roster, admin credentials
11. **PWA/Offline** — Service worker, manifest, auto-sync polish
12. **CI/CD** — GitHub Actions workflows

---

## 13. Files Touched Summary

### New Files

- `src/lib/supabase/client.ts`, `server.ts`, `admin.ts` — Supabase client factories
- `src/lib/session.ts` — Custom session management
- `src/lib/offline-db.ts` — IndexedDB wrapper
- `src/lib/actions/*.ts` — 7 Server Action files
- `src/lib/types/*.ts` — 3 type definition files
- `src/lib/validations/*.ts` — Zod schemas per entity
- `src/app/(auth)/login/page.tsx` + layout
- `src/app/(dashboard)/*.tsx` — 8 page files + layout
- `src/app/(student)/*.tsx` — 2 page files + layout
- `src/components/**/*.tsx` — ~20 component files
- `src/middleware.ts` — Route protection
- `supabase/migrations/002_event_slots.sql` — New event_slots table
- `public/manifest.json`, `public/sw.js` — PWA
- `.github/workflows/ci.yml`, `deploy.yml` — CI/CD

### Modified Files

- `supabase/migrations/001_initial_schema.sql` — Add slot_id to attendance_records
- `src/app/globals.css` — Design system tokens
- `src/app/layout.tsx` — Root layout with providers
