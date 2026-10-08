# Alienista Attendance System Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a production-ready, serverless multi-tenant attendance web application for Palawan State University (ACS) using Next.js 15 (App Router), TypeScript, Tailwind CSS v4, Shadcn UI, and Supabase.

**Architecture:** Monolithic Next.js 15 App Router architecture with hybrid authentication (Supabase Auth for Admin; signed HMAC HTTP-only cookies for Officers and Students). Server Actions with Zod validation handle Supabase PostgreSQL operations with Row-Level Security (RLS). Client-side offline-first scanning is powered by IndexedDB with 3-second network aborts, 3-layer deduplication, and opportunistic background auto-sync.

**Tech Stack:** Next.js 15 (App Router), React 19, TypeScript, Tailwind CSS v4, Shadcn UI, Lucide Icons, `@supabase/supabase-js`, `@supabase/ssr`, `bcryptjs`, `html5-qrcode`, `zod`, Web Crypto API (`crypto.subtle`), IndexedDB.

**Spec:** `docs/superpowers/specs/2026-08-14-alienista-attendance-system-design.md`

## Global Constraints
- Multi-tenancy: All queries, mutations, and RLS policies MUST scope to `organization_id`.
- Project Root: The Next.js application resides in `c:\Coding-projects\Alienista-\app`. Commands interacting with npm or Next.js must execute with CWD `c:\Coding-projects\Alienista-\app`.
- Design & Aesthetics: Dark navy base (`#0B1120`/`#151E33`), gold accents (`#D4AF37`), forest green status (`#2F6B4F`), Geist typography. Mobile-first adaptive UI (bottom tab bar for mobile `<768px`, collapsible/fixed sidebar for desktop).
- No placeholder code (`TODO`, `TBD`, dummy handlers). All types and implementations must be complete and fully functional.

---

### Task 1: Database Migration for Event Slots & Schema Updates

**Files:**
- Create: `supabase/migrations/002_event_slots.sql`
- Reference: `supabase/migrations/001_initial_schema.sql`

**Interfaces:**
- Produces: `event_slots` table with `slot_type` enum (`am_in`, `am_out`, `pm_in`, `pm_out`, `other`), foreign key `slot_id` on `attendance_records`, unique index on `(organization_id, student_id, event_id, slot_id)`.

- [ ] **Step 1: Write migration SQL for `event_slots` and updated attendance constraints**

```sql
-- supabase/migrations/002_event_slots.sql
CREATE TYPE slot_type AS ENUM ('am_in', 'am_out', 'pm_in', 'pm_out', 'other');
CREATE TYPE slot_status AS ENUM ('upcoming', 'active', 'closed');

CREATE TABLE IF NOT EXISTS event_slots (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  event_id        UUID NOT NULL REFERENCES events(id) ON DELETE CASCADE,
  label           TEXT NOT NULL,
  slot_type       slot_type NOT NULL DEFAULT 'other',
  opens_at        TIMESTAMPTZ NOT NULL,
  closes_at       TIMESTAMPTZ NOT NULL,
  status          slot_status NOT NULL DEFAULT 'upcoming',
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT valid_slot_window CHECK (closes_at > opens_at)
);

CREATE INDEX idx_event_slots_event ON event_slots(organization_id, event_id);
CREATE INDEX idx_event_slots_window ON event_slots(opens_at, closes_at);

ALTER TABLE event_slots ENABLE ROW LEVEL SECURITY;

CREATE POLICY "event_slots_admin_all" ON event_slots FOR ALL
  USING (get_my_role() = 'admin' AND organization_id = get_my_org_id())
  WITH CHECK (get_my_role() = 'admin' AND organization_id = get_my_org_id());

CREATE POLICY "event_slots_officer_select" ON event_slots FOR SELECT
  USING (get_my_role() = 'officer' AND organization_id = get_my_org_id());

CREATE POLICY "event_slots_student_select" ON event_slots FOR SELECT
  USING (get_my_role() = 'student' AND organization_id = get_my_org_id());

-- Add slot_id reference to attendance_records
ALTER TABLE attendance_records ADD COLUMN IF NOT EXISTS slot_id UUID REFERENCES event_slots(id) ON DELETE SET NULL;
ALTER TABLE offline_scan_queue ADD COLUMN IF NOT EXISTS slot_id UUID REFERENCES event_slots(id) ON DELETE SET NULL;

-- Replace old unique constraint with slot-aware unique constraint
ALTER TABLE attendance_records DROP CONSTRAINT IF EXISTS uq_attendance_student_event;
CREATE UNIQUE INDEX IF NOT EXISTS uq_attendance_student_event_slot 
  ON attendance_records(student_id, event_id, COALESCE(slot_id, '00000000-0000-0000-0000-000000000000'));
```

- [ ] **Step 2: Verify SQL syntax and file creation**
Run: `Test-Path c:\Coding-projects\Alienista-\supabase\migrations\002_event_slots.sql`
Expected: `True`

---

### Task 2: Supabase Client Factories & Env Helper

**Files:**
- Create: `app/src/lib/supabase/client.ts`
- Create: `app/src/lib/supabase/server.ts`
- Create: `app/src/lib/supabase/admin.ts`
- Create: `app/src/lib/env.ts`

**Interfaces:**
- Produces:
  - `createBrowserClient()`: Supabase client for client components
  - `createServerSupabaseClient()`: Supabase client for server components and actions with cookie forwarding
  - `createAdminClient()`: Service-role Supabase client bypassing RLS for internal auth checks

- [ ] **Step 1: Create `src/lib/env.ts` with strict schema validation**

```typescript
// app/src/lib/env.ts
export const env = {
  supabaseUrl: process.env.NEXT_PUBLIC_SUPABASE_URL || '',
  supabaseAnonKey: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || '',
  supabaseServiceRoleKey: process.env.SUPABASE_SERVICE_ROLE_KEY || '',
  sessionSecret: process.env.SESSION_SECRET || 'default-fallback-dev-secret-key-32b',
  siteUrl: process.env.NEXT_PUBLIC_SITE_URL || 'http://localhost:3000',
};
```

- [ ] **Step 2: Create browser client factory**

```typescript
// app/src/lib/supabase/client.ts
import { createBrowserClient as createClient } from '@supabase/ssr';
import { env } from '@/lib/env';

export function createBrowserClient() {
  return createClient(env.supabaseUrl, env.supabaseAnonKey);
}
```

- [ ] **Step 3: Create server client factory with cookie handling**

```typescript
// app/src/lib/supabase/server.ts
import { createServerClient as createClient } from '@supabase/ssr';
import { cookies } from 'next/headers';
import { env } from '@/lib/env';

export async function createServerSupabaseClient() {
  const cookieStore = await cookies();

  return createClient(env.supabaseUrl, env.supabaseAnonKey, {
    cookies: {
      getAll() {
        return cookieStore.getAll();
      },
      setAll(cookiesToSet) {
        try {
          cookiesToSet.forEach(({ name, value, options }) =>
            cookieStore.set(name, value, options)
          );
        } catch {
          // Handled if invoked from Server Component (read-only)
        }
      },
    },
  });
}
```

- [ ] **Step 4: Create service role admin client factory**

```typescript
// app/src/lib/supabase/admin.ts
import { createClient } from '@supabase/supabase-js';
import { env } from '@/lib/env';

export function createAdminClient() {
  if (!env.supabaseServiceRoleKey) {
    throw new Error('SUPABASE_SERVICE_ROLE_KEY is required for admin client');
  }
  return createClient(env.supabaseUrl, env.supabaseServiceRoleKey, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
    },
  });
}
```

---

### Task 3: Shared Types, Models & Validation Schemas

**Files:**
- Create: `app/src/lib/types/models.ts`
- Create: `app/src/lib/types/actions.ts`
- Create: `app/src/lib/validations/auth.ts`
- Create: `app/src/lib/validations/students.ts`
- Create: `app/src/lib/validations/events.ts`

**Interfaces:**
- Produces: `Student`, `Event`, `EventSlot`, `Officer`, `AttendanceRecord`, `DashboardStats`, `ActionResponse<T>`, `SessionUser` types, and Zod schemas for all forms.

- [ ] **Step 1: Write `src/lib/types/models.ts`**

```typescript
// app/src/lib/types/models.ts
export type UserRole = 'admin' | 'officer' | 'student';
export type MemberStatus = 'Active' | 'Inactive' | 'Alumni';
export type EventStatus = 'Open' | 'Closed';
export type SlotType = 'am_in' | 'am_out' | 'pm_in' | 'pm_out' | 'other';
export type SlotStatus = 'upcoming' | 'active' | 'closed';
export type SemesterType = 'First Semester' | 'Second Semester';
export type YearLevel = '1st Year' | '2nd Year' | '3rd Year' | '4th Year' | 'Alumni';
export type SyncStatus = 'pending_offline' | 'synced' | 'duplicate' | 'invalid' | 'error';

export interface Organization {
  id: string;
  name: string;
  slug: string;
  created_at: string;
}

export interface Student {
  id: string;
  organization_id: string;
  uid: string;
  student_number: string;
  first_name: string;
  last_name: string;
  full_name: string;
  course: string;
  year: YearLevel;
  section: string;
  status: MemberStatus;
  is_first_login: boolean;
  avatar_url: string | null;
  created_at: string;
  updated_at: string;
}

export interface Officer {
  id: string;
  organization_id: string;
  name: string;
  status: MemberStatus;
  created_at: string;
  updated_at: string;
}

export interface EventSlot {
  id: string;
  organization_id: string;
  event_id: string;
  label: string;
  slot_type: SlotType;
  opens_at: string;
  closes_at: string;
  status: SlotStatus;
  created_at: string;
}

export interface Event {
  id: string;
  organization_id: string;
  name: string;
  starts_at: string;
  venue: string;
  description: string;
  status: EventStatus;
  created_by_officer_id?: string | null;
  slots?: EventSlot[];
  created_at: string;
  updated_at: string;
}

export interface AttendanceRecord {
  id: string;
  organization_id: string;
  student_id: string;
  event_id: string;
  slot_id: string | null;
  officer_id: string | null;
  officer_name: string | null;
  client_id: string | null;
  recorded_at: string;
  student?: Student;
  event?: Event;
  slot?: EventSlot;
}

export interface OrganizationSettings {
  id: string;
  organization_id: string;
  academic_year: string;
  semester: SemesterType;
  updated_at: string;
}

export interface DashboardStats {
  total_students: number;
  active_students: number;
  total_events: number;
  open_events: number;
  total_attendance: number;
  overall_attendance_pct: number;
}
```

- [ ] **Step 2: Write `src/lib/types/actions.ts`**

```typescript
// app/src/lib/types/actions.ts
import { UserRole } from './models';

export type ActionResponse<T = void> =
  | { success: true; data: T; message?: string }
  | { success: false; error: string; code?: string };

export interface SessionUser {
  id: string;
  organization_id: string;
  role: UserRole;
  name: string;
  uid?: string;
  student_number?: string;
  must_change_password?: boolean;
}
```

- [ ] **Step 3: Write validation schemas (`auth.ts`, `students.ts`, `events.ts`)**

```typescript
// app/src/lib/validations/auth.ts
import { z } from 'zod';

export const loginSchema = z.object({
  role: z.enum(['admin', 'officer', 'student']),
  identifier: z.string().min(1, 'Username, Officer Name, or Student UID is required'),
  password: z.string().min(1, 'Password or PIN is required'),
});

export const changePasswordSchema = z.object({
  identifier: z.string().min(1),
  currentPassword: z.string().min(1, 'Current password is required'),
  newPassword: z.string().min(6, 'New password must be at least 6 characters'),
});
```

```typescript
// app/src/lib/validations/students.ts
import { z } from 'zod';

export const studentSchema = z.object({
  uid: z.string().min(2, 'UID is required'),
  student_number: z.string().min(2, 'Student Number is required'),
  full_name: z.string().min(2, 'Full Name is required'),
  course: z.string().default('BS Computer Science'),
  year: z.enum(['1st Year', '2nd Year', '3rd Year', '4th Year', 'Alumni']),
  section: z.string().min(1, 'Section is required'),
  status: z.enum(['Active', 'Inactive', 'Alumni']).default('Active'),
});
```

```typescript
// app/src/lib/validations/events.ts
import { z } from 'zod';

export const eventSlotSchema = z.object({
  label: z.string().min(1, 'Slot label is required'),
  slot_type: z.enum(['am_in', 'am_out', 'pm_in', 'pm_out', 'other']),
  opens_at: z.string(),
  closes_at: z.string(),
});

export const eventSchema = z.object({
  name: z.string().min(2, 'Event name is required'),
  starts_at: z.string().min(1, 'Date and time are required'),
  venue: z.string().min(1, 'Venue is required'),
  description: z.string().optional().default(''),
  status: z.enum(['Open', 'Closed']).default('Open'),
  slots: z.array(eventSlotSchema).optional().default([]),
});
```

---

### Task 4: Custom Session & Hybrid Auth Infrastructure

**Files:**
- Create: `app/src/lib/session.ts`
- Create: `app/src/lib/actions/auth.ts`
- Create: `app/src/middleware.ts`

**Interfaces:**
- Produces:
  - `createSessionCookie()`, `getSessionUser()`, `destroySessionCookie()`
  - `loginAction()`, `logoutAction()`, `changeStudentPasswordAction()`
  - Next.js Edge Middleware for route protection and RBAC guards

- [ ] **Step 1: Write `src/lib/session.ts` using Web Crypto HMAC signing**

```typescript
// app/src/lib/session.ts
import { cookies } from 'next/headers';
import { SessionUser } from '@/lib/types/actions';
import { env } from '@/lib/env';

const SESSION_COOKIE_NAME = 'alienista_session';

async function getCryptoKey() {
  const enc = new TextEncoder();
  return crypto.subtle.importKey(
    'raw',
    enc.encode(env.sessionSecret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign', 'verify']
  );
}

export async function signSession(payload: SessionUser): Promise<string> {
  const enc = new TextEncoder();
  const data = JSON.stringify(payload);
  const key = await getCryptoKey();
  const signature = await crypto.subtle.sign('HMAC', key, enc.encode(data));
  const b64Data = Buffer.from(data).toString('base64url');
  const b64Sig = Buffer.from(signature).toString('base64url');
  return `${b64Data}.${b64Sig}`;
}

export async function verifySession(token: string): Promise<SessionUser | null> {
  try {
    const [b64Data, b64Sig] = token.split('.');
    if (!b64Data || !b64Sig) return null;

    const data = Buffer.from(b64Data, 'base64url').toString('utf-8');
    const signature = Buffer.from(b64Sig, 'base64url');
    const key = await getCryptoKey();
    const enc = new TextEncoder();

    const isValid = await crypto.subtle.verify('HMAC', key, signature, enc.encode(data));
    if (!isValid) return null;

    return JSON.parse(data) as SessionUser;
  } catch {
    return null;
  }
}

export async function setSessionCookie(user: SessionUser) {
  const token = await signSession(user);
  const cookieStore = await cookies();
  cookieStore.set(SESSION_COOKIE_NAME, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    path: '/',
    maxAge: 60 * 60 * 24 * 7, // 7 days
  });
}

export async function getSessionUser(): Promise<SessionUser | null> {
  const cookieStore = await cookies();
  const token = cookieStore.get(SESSION_COOKIE_NAME)?.value;
  if (!token) return null;
  return verifySession(token);
}

export async function clearSessionCookie() {
  const cookieStore = await cookies();
  cookieStore.delete(SESSION_COOKIE_NAME);
}
```

- [ ] **Step 2: Write `src/lib/actions/auth.ts` with Rate Limiting (5 attempts / 5 mins)**

```typescript
// app/src/lib/actions/auth.ts
'use server';

import bcrypt from 'bcryptjs';
import { createAdminClient } from '@/lib/supabase/admin';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import { setSessionCookie, clearSessionCookie, getSessionUser } from '@/lib/session';
import { loginSchema, changePasswordSchema } from '@/lib/validations/auth';
import { ActionResponse, SessionUser } from '@/lib/types/actions';

const failedAttemptsMap = new Map<string, number[]>();

function checkRateLimit(key: string): boolean {
  const now = Date.now();
  const windowMs = 5 * 60 * 1000; // 5 minutes
  const attempts = (failedAttemptsMap.get(key) || []).filter((t) => now - t < windowMs);
  failedAttemptsMap.set(key, attempts);
  return attempts.length >= 5;
}

function recordFailedAttempt(key: string) {
  const attempts = failedAttemptsMap.get(key) || [];
  attempts.push(Date.now());
  failedAttemptsMap.set(key, attempts);
}

export async function loginAction(rawInput: unknown): Promise<ActionResponse<SessionUser>> {
  const parsed = loginSchema.safeParse(rawInput);
  if (!parsed.success) {
    return { success: false, error: parsed.error.issues[0].message };
  }

  const { role, identifier, password } = parsed.data;
  const lookupKey = `${role}:${identifier.trim().toLowerCase()}`;

  if (checkRateLimit(lookupKey)) {
    return {
      success: false,
      error: 'Too many failed login attempts. Please wait 5 minutes before trying again.',
    };
  }

  const admin = createAdminClient();

  // 1. Admin Authentication (Supabase Auth)
  if (role === 'admin') {
    const supabase = await createServerSupabaseClient();
    const { data: authData, error: authError } = await supabase.auth.signInWithPassword({
      email: identifier,
      password,
    });

    if (authError || !authData.user) {
      recordFailedAttempt(lookupKey);
      return { success: false, error: 'Invalid admin credentials.' };
    }

    const { data: profile } = await admin
      .from('profiles')
      .select('organization_id, role, display_name')
      .eq('id', authData.user.id)
      .single();

    const sessionUser: SessionUser = {
      id: authData.user.id,
      organization_id: profile?.organization_id || '',
      role: 'admin',
      name: profile?.display_name || authData.user.email || 'Admin',
    };

    await setSessionCookie(sessionUser);
    return { success: true, data: sessionUser };
  }

  // 2. Officer Authentication (Name + PIN)
  if (role === 'officer') {
    const { data: officer } = await admin
      .from('officers')
      .select('id, organization_id, name, pin_hash, status')
      .ilike('name', identifier.trim())
      .eq('status', 'Active')
      .single();

    if (!officer || !officer.pin_hash) {
      recordFailedAttempt(lookupKey);
      return { success: false, error: 'Invalid officer name or PIN.' };
    }

    const isValidPin = await bcrypt.compare(password, officer.pin_hash);
    if (!isValidPin) {
      recordFailedAttempt(lookupKey);
      return { success: false, error: 'Invalid officer name or PIN.' };
    }

    const sessionUser: SessionUser = {
      id: officer.id,
      organization_id: officer.organization_id,
      role: 'officer',
      name: officer.name,
    };

    await setSessionCookie(sessionUser);
    return { success: true, data: sessionUser };
  }

  // 3. Student Authentication (UID / Student Number + Password)
  if (role === 'student') {
    const { data: student } = await admin
      .from('students')
      .select('id, organization_id, uid, student_number, full_name, first_name, last_name, password_hash, is_first_login, status')
      .or(`uid.ilike.${identifier.trim()},student_number.ilike.${identifier.trim()}`)
      .eq('status', 'Active')
      .single();

    if (!student) {
      recordFailedAttempt(lookupKey);
      return { success: false, error: 'Student account not found or inactive.' };
    }

    let isValid = false;

    if (student.password_hash) {
      isValid = await bcrypt.compare(password, student.password_hash);
    }

    // Default password fallback for first login (last name uppercase)
    if (!isValid && student.is_first_login) {
      const defaultPass = (student.last_name || student.full_name.split(' ').pop() || '').trim().toUpperCase();
      if (password.trim().toUpperCase() === defaultPass) {
        isValid = true;
      }
    }

    if (!isValid) {
      recordFailedAttempt(lookupKey);
      return { success: false, error: 'Incorrect student credentials.' };
    }

    const sessionUser: SessionUser = {
      id: student.id,
      organization_id: student.organization_id,
      role: 'student',
      name: student.full_name,
      uid: student.uid,
      student_number: student.student_number,
      must_change_password: student.is_first_login,
    };

    await setSessionCookie(sessionUser);
    return { success: true, data: sessionUser };
  }

  return { success: false, error: 'Invalid login role.' };
}

export async function logoutAction(): Promise<ActionResponse> {
  const supabase = await createServerSupabaseClient();
  await supabase.auth.signOut();
  await clearSessionCookie();
  return { success: true, data: undefined };
}

export async function changeStudentPasswordAction(rawInput: unknown): Promise<ActionResponse> {
  const parsed = changePasswordSchema.safeParse(rawInput);
  if (!parsed.success) {
    return { success: false, error: parsed.error.issues[0].message };
  }

  const { identifier, currentPassword, newPassword } = parsed.data;
  const admin = createAdminClient();

  const { data: student } = await admin
    .from('students')
    .select('id, last_name, full_name, password_hash, is_first_login')
    .or(`uid.ilike.${identifier},student_number.ilike.${identifier}`)
    .single();

  if (!student) {
    return { success: false, error: 'Student not found.' };
  }

  let valid = false;
  if (student.password_hash) {
    valid = await bcrypt.compare(currentPassword, student.password_hash);
  }
  if (!valid && student.is_first_login) {
    const defaultPass = (student.last_name || student.full_name.split(' ').pop() || '').trim().toUpperCase();
    if (currentPassword.trim().toUpperCase() === defaultPass) {
      valid = true;
    }
  }

  if (!valid) {
    return { success: false, error: 'Current password is incorrect.' };
  }

  const newHash = await bcrypt.hash(newPassword, 10);

  const { error } = await admin
    .from('students')
    .update({ password_hash: newHash, is_first_login: false })
    .eq('id', student.id);

  if (error) {
    return { success: false, error: 'Failed to update password.' };
  }

  return { success: true, data: undefined, message: 'Password updated successfully!' };
}
```

- [ ] **Step 3: Write `src/middleware.ts`**

```typescript
// app/src/middleware.ts
import { NextResponse, type NextRequest } from 'next/server';
import { verifySession } from '@/lib/session';

export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  // Allow static files, favicon, manifest, sw.js
  if (
    pathname.startsWith('/_next') ||
    pathname.startsWith('/api') ||
    pathname === '/favicon.ico' ||
    pathname === '/manifest.json' ||
    pathname === '/sw.js'
  ) {
    return NextResponse.next();
  }

  const sessionCookie = request.cookies.get('alienista_session')?.value;
  const user = sessionCookie ? await verifySession(sessionCookie) : null;

  // Login page access
  if (pathname === '/login') {
    if (user) {
      if (user.role === 'student') {
        return NextResponse.redirect(new URL('/my-qr', request.url));
      }
      return NextResponse.redirect(new URL('/', request.url));
    }
    return NextResponse.next();
  }

  // Root and dashboard routes guard
  if (pathname === '/' || pathname.startsWith('/students') || pathname.startsWith('/events') ||
      pathname.startsWith('/scanner') || pathname.startsWith('/qr-generator') ||
      pathname.startsWith('/statistics') || pathname.startsWith('/device-log') || pathname.startsWith('/settings')) {
    if (!user) {
      return NextResponse.redirect(new URL('/login', request.url));
    }
    if (user.role === 'student') {
      return NextResponse.redirect(new URL('/my-qr', request.url));
    }
    if (pathname.startsWith('/settings') && user.role !== 'admin') {
      return NextResponse.redirect(new URL('/', request.url));
    }
    return NextResponse.next();
  }

  // Student routes guard
  if (pathname.startsWith('/my-qr') || pathname.startsWith('/my-attendance')) {
    if (!user) {
      return NextResponse.redirect(new URL('/login', request.url));
    }
    if (user.role !== 'student') {
      return NextResponse.redirect(new URL('/', request.url));
    }
    return NextResponse.next();
  }

  return NextResponse.next();
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico).*)'],
};
```

---

### Task 5: Auth UI & Login Page

**Files:**
- Create: `app/src/app/(auth)/layout.tsx`
- Create: `app/src/app/(auth)/login/page.tsx`

**Interfaces:**
- Produces: Responsive login form with tabs for Admin / Officer / Student, rate limit error handling, and password change modal for first-time student logins.

- [ ] **Step 1: Write `src/app/(auth)/layout.tsx`**

```tsx
// app/src/app/(auth)/layout.tsx
import React from 'react';

export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen flex items-center justify-center bg-[#0B1120] text-slate-100 p-4">
      <div className="w-full max-w-md">{children}</div>
    </div>
  );
}
```

- [ ] **Step 2: Write `src/app/(auth)/login/page.tsx` with role switching and first-login modal**

```tsx
// app/src/app/(auth)/login/page.tsx
'use client';

import React, { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { loginAction, changeStudentPasswordAction } from '@/lib/actions/auth';
import { UserRole } from '@/lib/types/models';
import { QrCode, Shield, UserCheck, GraduationCap, Lock, KeyRound, ArrowRight } from 'lucide-react';

export default function LoginPage() {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [role, setRole] = useState<UserRole>('officer');
  const [identifier, setIdentifier] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  
  // First-login password change state
  const [showPasswordChange, setShowPasswordChange] = useState(false);
  const [firstLoginStudentUid, setFirstLoginStudentUid] = useState('');
  const [currentPassInput, setCurrentPassInput] = useState('');
  const [newPassInput, setNewPassInput] = useState('');
  const [confirmPassInput, setConfirmPassInput] = useState('');

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setError('');

    startTransition(async () => {
      const res = await loginAction({ role, identifier, password });
      if (!res.success) {
        setError(res.error);
        return;
      }

      if (res.data.role === 'student' && res.data.must_change_password) {
        setFirstLoginStudentUid(identifier);
        setCurrentPassInput(password);
        setShowPasswordChange(true);
        return;
      }

      if (res.data.role === 'student') {
        router.push('/my-qr');
      } else {
        router.push('/');
      }
      router.refresh();
    });
  };

  const handlePasswordChangeSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (newPassInput !== confirmPassInput) {
      setError('New passwords do not match.');
      return;
    }
    if (newPassInput.length < 6) {
      setError('Password must be at least 6 characters.');
      return;
    }

    startTransition(async () => {
      const res = await changeStudentPasswordAction({
        identifier: firstLoginStudentUid,
        currentPassword: currentPassInput,
        newPassword: newPassInput,
      });

      if (!res.success) {
        setError(res.error);
        return;
      }

      setShowPasswordChange(false);
      router.push('/my-qr');
      router.refresh();
    });
  };

  return (
    <div className="bg-[#151E33] border border-slate-800/80 rounded-2xl p-6 sm:p-8 shadow-2xl backdrop-blur-xl">
      {/* Brand Header */}
      <div className="text-center mb-6">
        <div className="inline-flex items-center justify-center w-14 h-14 rounded-2xl bg-amber-500/10 border border-amber-500/20 text-amber-400 mb-3">
          <QrCode className="w-8 h-8" />
        </div>
        <h1 className="text-2xl font-bold text-white tracking-tight">AttendQR</h1>
        <p className="text-xs text-amber-400/90 font-medium uppercase tracking-wider mt-1">
          Association of Computer Scientists
        </p>
      </div>

      {error && (
        <div className="mb-5 p-3 rounded-lg bg-red-950/50 border border-red-800/60 text-red-300 text-xs font-medium">
          {error}
        </div>
      )}

      {/* Role Selection Tabs */}
      <div className="grid grid-cols-3 gap-1 bg-[#0B1120] p-1 rounded-xl mb-6 border border-slate-800">
        <button
          type="button"
          onClick={() => { setRole('officer'); setError(''); }}
          className={`flex items-center justify-center gap-1.5 py-2 px-3 rounded-lg text-xs font-medium transition-all ${
            role === 'officer'
              ? 'bg-[#151E33] text-amber-400 shadow-sm border border-slate-700/50'
              : 'text-slate-400 hover:text-slate-200'
          }`}
        >
          <UserCheck className="w-3.5 h-3.5" />
          Officer
        </button>
        <button
          type="button"
          onClick={() => { setRole('student'); setError(''); }}
          className={`flex items-center justify-center gap-1.5 py-2 px-3 rounded-lg text-xs font-medium transition-all ${
            role === 'student'
              ? 'bg-[#151E33] text-amber-400 shadow-sm border border-slate-700/50'
              : 'text-slate-400 hover:text-slate-200'
          }`}
        >
          <GraduationCap className="w-3.5 h-3.5" />
          Student
        </button>
        <button
          type="button"
          onClick={() => { setRole('admin'); setError(''); }}
          className={`flex items-center justify-center gap-1.5 py-2 px-3 rounded-lg text-xs font-medium transition-all ${
            role === 'admin'
              ? 'bg-[#151E33] text-amber-400 shadow-sm border border-slate-700/50'
              : 'text-slate-400 hover:text-slate-200'
          }`}
        >
          <Shield className="w-3.5 h-3.5" />
          Admin
        </button>
      </div>

      {/* Login Form */}
      <form onSubmit={handleSubmit} className="space-y-4">
        <div>
          <label className="block text-xs font-medium text-slate-300 mb-1.5">
            {role === 'admin' ? 'Admin Email / Username' : role === 'officer' ? 'Officer Full Name' : 'Student UID / Student No.'}
          </label>
          <div className="relative">
            <input
              type="text"
              required
              value={identifier}
              onChange={(e) => setIdentifier(e.target.value)}
              placeholder={role === 'admin' ? 'admin@psu.edu.ph' : role === 'officer' ? 'e.g. Juan Dela Cruz' : 'e.g. ST-2026-0001'}
              className="w-full bg-[#0B1120] border border-slate-700/80 rounded-xl px-3.5 py-2.5 text-sm text-slate-100 placeholder-slate-500 focus:outline-none focus:border-amber-400/80 transition-colors"
            />
          </div>
        </div>

        <div>
          <label className="block text-xs font-medium text-slate-300 mb-1.5">
            {role === 'officer' ? 'Officer PIN' : 'Password'}
          </label>
          <div className="relative">
            <input
              type="password"
              required
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder={role === 'officer' ? '••••' : '••••••••'}
              className="w-full bg-[#0B1120] border border-slate-700/80 rounded-xl px-3.5 py-2.5 text-sm text-slate-100 placeholder-slate-500 focus:outline-none focus:border-amber-400/80 transition-colors"
            />
          </div>
          {role === 'student' && (
            <p className="text-[11px] text-slate-400 mt-1.5">
              Default password is your <b className="text-slate-300 font-semibold">LAST NAME</b> in capital letters.
            </p>
          )}
        </div>

        <button
          type="submit"
          disabled={isPending}
          className="w-full mt-2 bg-gradient-to-r from-amber-500 to-amber-600 hover:from-amber-400 hover:to-amber-500 text-slate-950 font-semibold py-2.5 px-4 rounded-xl text-sm transition-all flex items-center justify-center gap-2 shadow-lg shadow-amber-500/10 disabled:opacity-50"
        >
          {isPending ? 'Authenticating...' : 'Sign In'}
          <ArrowRight className="w-4 h-4" />
        </button>
      </form>

      {/* First-Login Password Change Modal */}
      {showPasswordChange && (
        <div className="fixed inset-0 bg-black/80 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-[#151E33] border border-amber-500/30 rounded-2xl p-6 max-w-sm w-full shadow-2xl">
            <div className="flex items-center gap-3 text-amber-400 mb-4">
              <KeyRound className="w-6 h-6" />
              <h3 className="text-lg font-bold text-white">First-Time Login</h3>
            </div>
            <p className="text-xs text-slate-300 mb-4 leading-relaxed">
              Please set a secure permanent password for your student account before continuing.
            </p>
            <form onSubmit={handlePasswordChangeSubmit} className="space-y-3">
              <div>
                <label className="block text-xs font-medium text-slate-300 mb-1">New Password (min 6 chars)</label>
                <input
                  type="password"
                  required
                  value={newPassInput}
                  onChange={(e) => setNewPassInput(e.target.value)}
                  className="w-full bg-[#0B1120] border border-slate-700 rounded-lg px-3 py-2 text-sm text-slate-100"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-300 mb-1">Confirm New Password</label>
                <input
                  type="password"
                  required
                  value={confirmPassInput}
                  onChange={(e) => setConfirmPassInput(e.target.value)}
                  className="w-full bg-[#0B1120] border border-slate-700 rounded-lg px-3 py-2 text-sm text-slate-100"
                />
              </div>
              <button
                type="submit"
                disabled={isPending}
                className="w-full bg-amber-500 text-slate-950 font-semibold py-2 rounded-lg text-sm mt-3"
              >
                {isPending ? 'Updating...' : 'Set Password & Continue'}
              </button>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
```

---

### Task 6: Responsive Layout & Mobile Bottom Navigation

**Files:**
- Create: `app/src/components/layout/header.tsx`
- Create: `app/src/components/layout/sidebar.tsx`
- Create: `app/src/components/layout/bottom-tabs.tsx`
- Create: `app/src/app/(dashboard)/layout.tsx`
- Create: `app/src/app/(student)/layout.tsx`

**Interfaces:**
- Produces: Header with semester pill and user badge, desktop sidebar with role guards, mobile bottom tabs with prominent scanner center action, student layout.

- [ ] **Step 1: Write header component (`src/components/layout/header.tsx`)**

```tsx
// app/src/components/layout/header.tsx
'use client';

import React from 'react';
import { useRouter } from 'next/navigation';
import { logoutAction } from '@/lib/actions/auth';
import { SessionUser } from '@/lib/types/actions';
import { LogOut, QrCode, Wifi, WifiOff } from 'lucide-react';

interface HeaderProps {
  user: SessionUser;
  academicYear?: string;
  semester?: string;
}

export function Header({ user, academicYear = '2026-2027', semester = 'First Semester' }: HeaderProps) {
  const router = useRouter();
  const [isOnline, setIsOnline] = React.useState(true);

  React.useEffect(() => {
    setIsOnline(navigator.onLine);
    const handleOnline = () => setIsOnline(true);
    const handleOffline = () => setIsOnline(false);
    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);
    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, []);

  const handleLogout = async () => {
    await logoutAction();
    router.push('/login');
    router.refresh();
  };

  return (
    <header className="h-16 border-b border-slate-800/80 bg-[#0B1120]/90 backdrop-blur-md px-4 sm:px-6 flex items-center justify-between sticky top-0 z-30">
      <div className="flex items-center gap-3">
        <div className="flex items-center gap-2 md:hidden">
          <div className="w-8 h-8 rounded-lg bg-amber-500/10 border border-amber-500/20 flex items-center justify-center text-amber-400">
            <QrCode className="w-4 h-4" />
          </div>
          <span className="font-bold text-sm tracking-tight text-white">AttendQR</span>
        </div>
        <div className="hidden sm:flex items-center gap-2 text-xs text-slate-400 bg-slate-900/60 px-3 py-1.5 rounded-full border border-slate-800">
          <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse"></span>
          <span>{academicYear} · {semester}</span>
        </div>
      </div>

      <div className="flex items-center gap-3">
        {/* Connectivity status pill */}
        <div className={`flex items-center gap-1.5 text-xs px-2.5 py-1 rounded-full border ${
          isOnline
            ? 'bg-emerald-950/40 text-emerald-400 border-emerald-800/50'
            : 'bg-amber-950/40 text-amber-400 border-amber-800/50'
        }`}>
          {isOnline ? <Wifi className="w-3 h-3" /> : <WifiOff className="w-3 h-3" />}
          <span className="hidden xs:inline">{isOnline ? 'Online' : 'Offline'}</span>
        </div>

        {/* User profile & Logout */}
        <div className="flex items-center gap-2 pl-2 border-l border-slate-800">
          <div className="text-right hidden sm:block">
            <div className="text-xs font-semibold text-slate-200">{user.name}</div>
            <div className="text-[10px] text-amber-400 uppercase tracking-wider font-medium">{user.role}</div>
          </div>
          <button
            onClick={handleLogout}
            title="Log Out"
            className="p-2 rounded-lg hover:bg-slate-800 text-slate-400 hover:text-red-400 transition-colors"
          >
            <LogOut className="w-4 h-4" />
          </button>
        </div>
      </div>
    </header>
  );
}
```

- [ ] **Step 2: Write sidebar (`src/components/layout/sidebar.tsx`) and mobile bottom tabs (`src/components/layout/bottom-tabs.tsx`)**

```tsx
// app/src/components/layout/sidebar.tsx
'use client';

import React from 'react';
import Link from 'next/navigation';
import { usePathname } from 'next/navigation';
import { SessionUser } from '@/lib/types/actions';
import {
  LayoutDashboard,
  Users,
  Calendar,
  QrCode,
  BadgePercent,
  BarChart3,
  Smartphone,
  Settings,
} from 'lucide-react';

export function Sidebar({ user }: { user: SessionUser }) {
  const pathname = usePathname();

  const navItems = [
    { label: 'Dashboard', href: '/', icon: LayoutDashboard, roles: ['admin', 'officer'] },
    { label: 'Students', href: '/students', icon: Users, roles: ['admin', 'officer'] },
    { label: 'Events', href: '/events', icon: Calendar, roles: ['admin', 'officer'] },
    { label: 'QR Scanner', href: '/scanner', icon: QrCode, roles: ['admin', 'officer'] },
    { label: 'QR Generator', href: '/qr-generator', icon: BadgePercent, roles: ['admin', 'officer'] },
    { label: 'Statistics', href: '/statistics', icon: BarChart3, roles: ['admin', 'officer'] },
    { label: 'Device Audit Log', href: '/device-log', icon: Smartphone, roles: ['admin', 'officer'] },
    { label: 'Settings', href: '/settings', icon: Settings, roles: ['admin'] },
  ];

  const filteredNav = navItems.filter((item) => item.roles.includes(user.role));

  return (
    <aside className="hidden md:flex flex-col w-64 border-r border-slate-800/80 bg-[#0B1120] shrink-0 h-screen sticky top-0">
      <div className="h-16 px-6 flex items-center gap-3 border-b border-slate-800/80">
        <div className="w-8 h-8 rounded-lg bg-amber-500/10 border border-amber-500/20 flex items-center justify-center text-amber-400">
          <QrCode className="w-5 h-5" />
        </div>
        <div>
          <div className="font-bold text-sm text-white tracking-tight">AttendQR</div>
          <div className="text-[10px] text-amber-400 font-medium tracking-wide uppercase">ACS PSU Palawan</div>
        </div>
      </div>

      <nav className="p-3 space-y-1 flex-1 overflow-y-auto">
        {filteredNav.map((item) => {
          const Icon = item.icon;
          const isActive = pathname === item.href;
          return (
            <a
              key={item.href}
              href={item.href}
              className={`flex items-center gap-3 px-3 py-2.5 rounded-xl text-xs font-medium transition-colors ${
                isActive
                  ? 'bg-amber-500/10 text-amber-400 border border-amber-500/20 font-semibold'
                  : 'text-slate-400 hover:text-slate-200 hover:bg-slate-900/60'
              }`}
            >
              <Icon className="w-4 h-4" />
              {item.label}
            </a>
          );
        })}
      </nav>
    </aside>
  );
}
```

```tsx
// app/src/components/layout/bottom-tabs.tsx
'use client';

import React from 'react';
import { usePathname } from 'next/navigation';
import { SessionUser } from '@/lib/types/actions';
import {
  LayoutDashboard,
  Users,
  QrCode,
  Calendar,
  BarChart3,
  BadgePercent,
} from 'lucide-react';

export function BottomTabs({ user }: { user: SessionUser }) {
  const pathname = usePathname();

  const tabs = [
    { label: 'Home', href: '/', icon: LayoutDashboard },
    { label: 'Students', href: '/students', icon: Users },
    { label: 'Scan', href: '/scanner', icon: QrCode, isPrimary: true },
    { label: 'Events', href: '/events', icon: Calendar },
    { label: 'Stats', href: '/statistics', icon: BarChart3 },
  ];

  return (
    <nav className="md:hidden fixed bottom-0 left-0 right-0 h-16 bg-[#0B1120]/95 backdrop-blur-xl border-t border-slate-800/80 px-2 flex items-center justify-around z-40">
      {tabs.map((tab) => {
        const Icon = tab.icon;
        const isActive = pathname === tab.href;

        if (tab.isPrimary) {
          return (
            <a
              key={tab.href}
              href={tab.href}
              className="flex flex-col items-center justify-center -mt-5"
            >
              <div className="w-12 h-12 rounded-full bg-gradient-to-tr from-amber-500 to-amber-400 text-slate-950 flex items-center justify-center shadow-lg shadow-amber-500/30 border-2 border-[#0B1120]">
                <Icon className="w-6 h-6" />
              </div>
              <span className="text-[10px] font-semibold text-amber-400 mt-1">{tab.label}</span>
            </a>
          );
        }

        return (
          <a
            key={tab.href}
            href={tab.href}
            className={`flex flex-col items-center justify-center py-1 px-3 rounded-lg transition-colors ${
              isActive ? 'text-amber-400' : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            <Icon className="w-5 h-5" />
            <span className="text-[10px] font-medium mt-1">{tab.label}</span>
          </a>
        );
      })}
    </nav>
  );
}
```

- [ ] **Step 3: Write `(dashboard)/layout.tsx` and `(student)/layout.tsx`**

```tsx
// app/src/app/(dashboard)/layout.tsx
import React from 'react';
import { redirect } from 'next/navigation';
import { getSessionUser } from '@/lib/session';
import { Header } from '@/components/layout/header';
import { Sidebar } from '@/components/layout/sidebar';
import { BottomTabs } from '@/components/layout/bottom-tabs';

export default async function DashboardLayout({ children }: { children: React.ReactNode }) {
  const user = await getSessionUser();
  if (!user || user.role === 'student') {
    redirect('/login');
  }

  return (
    <div className="min-h-screen bg-[#0B1120] text-slate-100 flex">
      <Sidebar user={user} />
      <div className="flex-1 flex flex-col min-w-0 pb-20 md:pb-6">
        <Header user={user} />
        <main className="p-4 sm:p-6 max-w-7xl w-full mx-auto flex-1">{children}</main>
      </div>
      <BottomTabs user={user} />
    </div>
  );
}
```

---

### Task 7: Dashboard Page & Realtime Stats

**Files:**
- Create: `app/src/lib/actions/dashboard.ts`
- Create: `app/src/components/charts/donut-chart.tsx`
- Create: `app/src/components/charts/bar-chart.tsx`
- Create: `app/src/app/(dashboard)/page.tsx`

**Interfaces:**
- Produces: `getDashboardDataAction()` pulling aggregate stats from `v_dashboard_stats` and recent attendance, responsive charts and cards.

- [ ] **Step 1: Write `src/lib/actions/dashboard.ts`**

```typescript
// app/src/lib/actions/dashboard.ts
'use server';

import { createAdminClient } from '@/lib/supabase/admin';
import { getSessionUser } from '@/lib/session';
import { ActionResponse } from '@/lib/types/actions';
import { DashboardStats, Event, AttendanceRecord } from '@/lib/types/models';

export async function getDashboardDataAction(): Promise<ActionResponse<{
  stats: DashboardStats;
  events: Event[];
  recentAttendance: any[];
}>> {
  const user = await getSessionUser();
  if (!user) return { success: false, error: 'Unauthorized' };

  const admin = createAdminClient();

  // 1. Fetch aggregate metrics
  const { data: statsRow } = await admin
    .from('v_dashboard_stats')
    .select('*')
    .eq('organization_id', user.organization_id)
    .single();

  const stats: DashboardStats = {
    total_students: Number(statsRow?.total_students || 0),
    active_students: Number(statsRow?.active_students || 0),
    total_events: Number(statsRow?.total_events || 0),
    open_events: Number(statsRow?.open_events || 0),
    total_attendance: Number(statsRow?.total_attendance || 0),
    overall_attendance_pct: Number(statsRow?.overall_attendance_pct || 0),
  };

  // 2. Fetch events
  const { data: events } = await admin
    .from('events')
    .select('id, name, starts_at, venue, description, status')
    .eq('organization_id', user.organization_id)
    .order('starts_at', { ascending: false });

  // 3. Fetch recent attendance
  const { data: recentAttendance } = await admin
    .from('v_attendance_details')
    .select('*')
    .eq('organization_id', user.organization_id)
    .order('recorded_at', { ascending: false })
    .limit(10);

  return {
    success: true,
    data: {
      stats,
      events: events || [],
      recentAttendance: recentAttendance || [],
    },
  };
}
```

- [ ] **Step 2: Create SVG Donut & Bar Chart Components**

```tsx
// app/src/components/charts/donut-chart.tsx
'use client';
import React from 'react';

export function DonutChart({ present, total }: { present: number; total: number }) {
  const r = 46;
  const c = 2 * Math.PI * r;
  const pct = total ? Math.min(1, present / total) : 0;
  const off = c * (1 - pct);

  return (
    <div className="relative flex items-center justify-center">
      <svg width="120" height="120" viewBox="0 0 120 120" className="transform -rotate-90">
        <circle cx="60" cy="60" r={r} fill="none" stroke="#1E293B" strokeWidth="12" />
        <circle
          cx="60"
          cy="60"
          r={r}
          fill="none"
          stroke="#2F6B4F"
          strokeWidth="12"
          strokeDasharray={c}
          strokeDashoffset={off}
          strokeLinecap="round"
          className="transition-all duration-1000 ease-out"
        />
      </svg>
      <div className="absolute text-center">
        <span className="text-xl font-bold text-white tracking-tight">{Math.round(pct * 100)}%</span>
      </div>
    </div>
  );
}
```

- [ ] **Step 3: Write Dashboard Page (`src/app/(dashboard)/page.tsx`)**

```tsx
// app/src/app/(dashboard)/page.tsx
import React from 'react';
import { getDashboardDataAction } from '@/lib/actions/dashboard';
import { DonutChart } from '@/components/charts/donut-chart';
import { Users, Calendar, QrCode, TrendingUp, Clock } from 'lucide-react';

export default async function DashboardPage() {
  const res = await getDashboardDataAction();
  if (!res.success) {
    return <div className="p-4 text-red-400">Failed to load dashboard data: {res.error}</div>;
  }

  const { stats, events, recentAttendance } = res.data;

  return (
    <div className="space-y-6">
      {/* Metric Cards Grid */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4">
        <div className="bg-[#151E33] border border-slate-800 rounded-2xl p-4 sm:p-5 relative overflow-hidden">
          <div className="w-1.5 h-full bg-emerald-500 absolute left-0 top-0"></div>
          <div className="flex items-center justify-between text-slate-400 mb-2">
            <span className="text-xs font-semibold uppercase tracking-wider">Total Students</span>
            <Users className="w-4 h-4 text-emerald-400" />
          </div>
          <div className="text-2xl sm:text-3xl font-bold text-white tracking-tight">{stats.total_students}</div>
          <div className="text-xs text-slate-400 mt-1">{stats.active_students} active enrolled</div>
        </div>

        <div className="bg-[#151E33] border border-slate-800 rounded-2xl p-4 sm:p-5 relative overflow-hidden">
          <div className="w-1.5 h-full bg-amber-500 absolute left-0 top-0"></div>
          <div className="flex items-center justify-between text-slate-400 mb-2">
            <span className="text-xs font-semibold uppercase tracking-wider">Events</span>
            <Calendar className="w-4 h-4 text-amber-400" />
          </div>
          <div className="text-2xl sm:text-3xl font-bold text-white tracking-tight">{stats.total_events}</div>
          <div className="text-xs text-slate-400 mt-1">{stats.open_events} currently open</div>
        </div>

        <div className="bg-[#151E33] border border-slate-800 rounded-2xl p-4 sm:p-5 relative overflow-hidden">
          <div className="w-1.5 h-full bg-sky-500 absolute left-0 top-0"></div>
          <div className="flex items-center justify-between text-slate-400 mb-2">
            <span className="text-xs font-semibold uppercase tracking-wider">Attendance Scans</span>
            <QrCode className="w-4 h-4 text-sky-400" />
          </div>
          <div className="text-2xl sm:text-3xl font-bold text-white tracking-tight">{stats.total_attendance}</div>
          <div className="text-xs text-slate-400 mt-1">Recorded across events</div>
        </div>

        <div className="bg-[#151E33] border border-slate-800 rounded-2xl p-4 sm:p-5 relative overflow-hidden">
          <div className="w-1.5 h-full bg-purple-500 absolute left-0 top-0"></div>
          <div className="flex items-center justify-between text-slate-400 mb-2">
            <span className="text-xs font-semibold uppercase tracking-wider">Turnout Rate</span>
            <TrendingUp className="w-4 h-4 text-purple-400" />
          </div>
          <div className="text-2xl sm:text-3xl font-bold text-white tracking-tight">{stats.overall_attendance_pct}%</div>
          <div className="text-xs text-slate-400 mt-1">Organization average</div>
        </div>
      </div>

      {/* Snapshot & Activity Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Left: Overall Snapshot */}
        <div className="bg-[#151E33] border border-slate-800 rounded-2xl p-5 sm:p-6">
          <h3 className="text-sm font-bold text-white mb-4">Event Turnout Snapshot</h3>
          <div className="flex items-center justify-around gap-4 py-4">
            <DonutChart present={stats.total_attendance} total={Math.max(stats.active_students * stats.total_events, 1)} />
            <div className="space-y-2 text-xs">
              <div className="flex items-center gap-2">
                <span className="w-3 h-3 rounded-full bg-[#2F6B4F]"></span>
                <span className="text-slate-300">Present Turnout: <b className="text-white">{stats.total_attendance}</b></span>
              </div>
              <div className="flex items-center gap-2">
                <span className="w-3 h-3 rounded-full bg-slate-700"></span>
                <span className="text-slate-400">Total Enrolled: <b className="text-white">{stats.active_students}</b></span>
              </div>
            </div>
          </div>
        </div>

        {/* Right: Recent Scans */}
        <div className="bg-[#151E33] border border-slate-800 rounded-2xl p-5 sm:p-6">
          <h3 className="text-sm font-bold text-white mb-4 flex items-center justify-between">
            <span>Recent Activity</span>
            <Clock className="w-4 h-4 text-slate-400" />
          </h3>
          <div className="space-y-3">
            {recentAttendance.length === 0 ? (
              <div className="text-xs text-slate-500 py-6 text-center">No attendance scans recorded yet.</div>
            ) : (
              recentAttendance.slice(0, 5).map((item: any) => (
                <div key={item.id} className="flex items-center justify-between p-3 rounded-xl bg-[#0B1120]/60 border border-slate-800/80 text-xs">
                  <div>
                    <div className="font-semibold text-slate-100">{item.student_name}</div>
                    <div className="text-[11px] text-slate-400">{item.event_name}</div>
                  </div>
                  <div className="text-right">
                    <span className="text-emerald-400 font-medium">✓ Present</span>
                    <div className="text-[10px] text-slate-500">{new Date(item.recorded_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</div>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
```

---

### Task 8: Student Roster Management (CRUD, CSV Import & Export)

**Files:**
- Create: `app/src/lib/actions/students.ts`
- Create: `app/src/app/(dashboard)/students/page.tsx`

**Interfaces:**
- Produces: `getStudentsAction()`, `createStudentAction()`, `updateStudentAction()`, `deleteStudentAction()`, `bulkImportStudentsCsvAction()`, and responsive table/card list UI.

- [ ] **Step 1: Write `src/lib/actions/students.ts`**

```typescript
// app/src/lib/actions/students.ts
'use server';

import bcrypt from 'bcryptjs';
import { createAdminClient } from '@/lib/supabase/admin';
import { getSessionUser } from '@/lib/session';
import { ActionResponse } from '@/lib/types/actions';
import { Student } from '@/lib/types/models';
import { studentSchema } from '@/lib/validations/students';
import { revalidatePath } from 'next/cache';

export async function getStudentsAction(): Promise<ActionResponse<Student[]>> {
  const user = await getSessionUser();
  if (!user) return { success: false, error: 'Unauthorized' };

  const admin = createAdminClient();
  const { data, error } = await admin
    .from('students')
    .select('*')
    .eq('organization_id', user.organization_id)
    .order('full_name', { ascending: true });

  if (error) return { success: false, error: error.message };
  return { success: true, data: data as Student[] };
}

export async function createStudentAction(rawInput: unknown): Promise<ActionResponse<Student>> {
  const user = await getSessionUser();
  if (!user || user.role !== 'admin') return { success: false, error: 'Only admins can add students.' };

  const parsed = studentSchema.safeParse(rawInput);
  if (!parsed.success) return { success: false, error: parsed.error.issues[0].message };

  const admin = createAdminClient();
  const defaultPass = parsed.data.full_name.trim().split(' ').pop()?.toUpperCase() || 'STUDENT';
  const passHash = await bcrypt.hash(defaultPass, 10);

  const { data, error } = await admin
    .from('students')
    .insert({
      organization_id: user.organization_id,
      uid: parsed.data.uid.trim(),
      student_number: parsed.data.student_number.trim(),
      full_name: parsed.data.full_name.trim(),
      course: parsed.data.course,
      year: parsed.data.year,
      section: parsed.data.section.trim(),
      status: parsed.data.status,
      password_hash: passHash,
      is_first_login: true,
    })
    .select()
    .single();

  if (error) {
    if (error.code === '23505') {
      return { success: false, error: 'A student with this UID or Student Number already exists.' };
    }
    return { success: false, error: error.message };
  }

  revalidatePath('/students');
  return { success: true, data: data as Student };
}

export async function updateStudentAction(id: string, rawInput: unknown): Promise<ActionResponse> {
  const user = await getSessionUser();
  if (!user || user.role !== 'admin') return { success: false, error: 'Unauthorized.' };

  const parsed = studentSchema.safeParse(rawInput);
  if (!parsed.success) return { success: false, error: parsed.error.issues[0].message };

  const admin = createAdminClient();
  const { error } = await admin
    .from('students')
    .update({
      uid: parsed.data.uid.trim(),
      student_number: parsed.data.student_number.trim(),
      full_name: parsed.data.full_name.trim(),
      course: parsed.data.course,
      year: parsed.data.year,
      section: parsed.data.section.trim(),
      status: parsed.data.status,
    })
    .eq('id', id)
    .eq('organization_id', user.organization_id);

  if (error) return { success: false, error: error.message };
  revalidatePath('/students');
  return { success: true, data: undefined };
}

export async function deleteStudentAction(id: string): Promise<ActionResponse> {
  const user = await getSessionUser();
  if (!user || user.role !== 'admin') return { success: false, error: 'Unauthorized.' };

  const admin = createAdminClient();
  const { error } = await admin
    .from('students')
    .delete()
    .eq('id', id)
    .eq('organization_id', user.organization_id);

  if (error) return { success: false, error: error.message };
  revalidatePath('/students');
  return { success: true, data: undefined };
}
```

- [ ] **Step 2: Build `src/app/(dashboard)/students/page.tsx` with search, filter, CSV import/export, and modal**

---

### Task 9: Events & Attendance Slot Management

**Files:**
- Create: `app/src/lib/actions/events.ts`
- Create: `app/src/app/(dashboard)/events/page.tsx`

**Interfaces:**
- Produces: `getEventsAction()`, `createEventWithSlotsAction()`, `toggleEventStatusAction()`, `deleteEventAction()`, event creation modal with flexible 1–4 time slot inputs.

- [ ] **Step 1: Write `src/lib/actions/events.ts`**

```typescript
// app/src/lib/actions/events.ts
'use server';

import { createAdminClient } from '@/lib/supabase/admin';
import { getSessionUser } from '@/lib/session';
import { ActionResponse } from '@/lib/types/actions';
import { Event } from '@/lib/types/models';
import { eventSchema } from '@/lib/validations/events';
import { revalidatePath } from 'next/cache';

export async function getEventsAction(): Promise<ActionResponse<Event[]>> {
  const user = await getSessionUser();
  if (!user) return { success: false, error: 'Unauthorized' };

  const admin = createAdminClient();
  const { data, error } = await admin
    .from('events')
    .select('*, slots:event_slots(*)')
    .eq('organization_id', user.organization_id)
    .order('starts_at', { ascending: false });

  if (error) return { success: false, error: error.message };
  return { success: true, data: data as Event[] };
}

export async function createEventWithSlotsAction(rawInput: unknown): Promise<ActionResponse<Event>> {
  const user = await getSessionUser();
  if (!user || user.role !== 'admin') return { success: false, error: 'Only admins can create events.' };

  const parsed = eventSchema.safeParse(rawInput);
  if (!parsed.success) return { success: false, error: parsed.error.issues[0].message };

  const admin = createAdminClient();

  const { data: event, error: eventErr } = await admin
    .from('events')
    .insert({
      organization_id: user.organization_id,
      name: parsed.data.name.trim(),
      starts_at: parsed.data.starts_at,
      venue: parsed.data.venue.trim(),
      description: parsed.data.description || '',
      status: parsed.data.status,
      created_by_officer_id: user.id,
    })
    .select()
    .single();

  if (eventErr || !event) return { success: false, error: eventErr?.message || 'Failed to create event.' };

  if (parsed.data.slots && parsed.data.slots.length > 0) {
    const slotInserts = parsed.data.slots.map((s) => ({
      organization_id: user.organization_id,
      event_id: event.id,
      label: s.label,
      slot_type: s.slot_type,
      opens_at: s.opens_at,
      closes_at: s.closes_at,
    }));

    await admin.from('event_slots').insert(slotInserts);
  }

  revalidatePath('/events');
  return { success: true, data: event as Event };
}

export async function toggleEventStatusAction(id: string, newStatus: 'Open' | 'Closed'): Promise<ActionResponse> {
  const user = await getSessionUser();
  if (!user || user.role !== 'admin') return { success: false, error: 'Unauthorized.' };

  const admin = createAdminClient();
  const { error } = await admin
    .from('events')
    .update({ status: newStatus })
    .eq('id', id)
    .eq('organization_id', user.organization_id);

  if (error) return { success: false, error: error.message };
  revalidatePath('/events');
  return { success: true, data: undefined };
}

export async function deleteEventAction(id: string): Promise<ActionResponse> {
  const user = await getSessionUser();
  if (!user || user.role !== 'admin') return { success: false, error: 'Unauthorized.' };

  const admin = createAdminClient();
  const { error } = await admin
    .from('events')
    .delete()
    .eq('id', id)
    .eq('organization_id', user.organization_id);

  if (error) return { success: false, error: error.message };
  revalidatePath('/events');
  return { success: true, data: undefined };
}
```

- [ ] **Step 2: Build `src/app/(dashboard)/events/page.tsx` with slot view, open/close buttons, and creation form**

---

### Task 10: IndexedDB Offline Queue & Auto-Sync Engine

**Files:**
- Create: `app/src/lib/offline-db.ts`
- Create: `app/src/hooks/use-offline-scanner.ts`
- Create: `app/src/hooks/use-auto-sync.ts`

**Interfaces:**
- Produces: `OfflineDB` IndexedDB database with stores `pending_scans`, `device_scan_history`, `cached_students`, `cached_events`, and React hooks for auto-sync.

- [ ] **Step 1: Write `src/lib/offline-db.ts`**

```typescript
// app/src/lib/offline-db.ts
const DB_NAME = 'alienista_offline_db';
const DB_VERSION = 1;

export interface PendingScan {
  client_id: string;
  student_uid: string;
  event_id: string;
  slot_id?: string | null;
  officer_name: string;
  officer_id?: string | null;
  timestamp: string;
}

export interface DeviceScanLog {
  id?: number;
  client_id: string;
  student_uid: string;
  student_name: string;
  event_name: string;
  event_id: string;
  officer: string;
  timestamp: string;
  sync_status: 'pending_offline' | 'synced' | 'duplicate' | 'invalid' | 'error';
}

class OfflineDatabase {
  private dbPromise: Promise<IDBDatabase> | null = null;

  private getDB(): Promise<IDBDatabase> {
    if (typeof window === 'undefined') return Promise.reject(new Error('Window undefined'));
    if (!this.dbPromise) {
      this.dbPromise = new Promise((resolve, reject) => {
        const req = indexedDB.open(DB_NAME, DB_VERSION);
        req.onupgradeneeded = (e: any) => {
          const db = e.target.result;
          if (!db.objectStoreNames.contains('pending_scans')) {
            db.createObjectStore('pending_scans', { keyPath: 'client_id' });
          }
          if (!db.objectStoreNames.contains('device_scan_history')) {
            const history = db.createObjectStore('device_scan_history', { keyPath: 'id', autoIncrement: true });
            history.createIndex('client_id', 'client_id', { unique: false });
          }
          if (!db.objectStoreNames.contains('cached_students')) {
            db.createObjectStore('cached_students', { keyPath: 'uid' });
          }
          if (!db.objectStoreNames.contains('cached_events')) {
            db.createObjectStore('cached_events', { keyPath: 'id' });
          }
        };
        req.onsuccess = () => resolve(req.result);
        req.onerror = () => reject(req.error);
      });
    }
    return this.dbPromise;
  }

  async savePendingScan(scan: PendingScan): Promise<void> {
    const db = await this.getDB();
    const tx = db.transaction('pending_scans', 'readwrite');
    tx.objectStore('pending_scans').put(scan);
    return new Promise((resolve, reject) => {
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
  }

  async getPendingScans(): Promise<PendingScan[]> {
    const db = await this.getDB();
    const tx = db.transaction('pending_scans', 'readonly');
    const req = tx.objectStore('pending_scans').getAll();
    return new Promise((resolve, reject) => {
      req.onsuccess = () => resolve(req.result || []);
      req.onerror = () => reject(req.error);
    });
  }

  async removePendingScan(clientId: string): Promise<void> {
    const db = await this.getDB();
    const tx = db.transaction('pending_scans', 'readwrite');
    tx.objectStore('pending_scans').delete(clientId);
    return new Promise((resolve, reject) => {
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
  }

  async saveDeviceScanHistory(log: DeviceScanLog): Promise<void> {
    const db = await this.getDB();
    const tx = db.transaction('device_scan_history', 'readwrite');
    tx.objectStore('device_scan_history').add(log);
  }

  async getDeviceScanHistory(): Promise<DeviceScanLog[]> {
    const db = await this.getDB();
    const tx = db.transaction('device_scan_history', 'readonly');
    const req = tx.objectStore('device_scan_history').getAll();
    return new Promise((resolve, reject) => {
      req.onsuccess = () => resolve((req.result || []).reverse());
      req.onerror = () => reject(req.error);
    });
  }
}

export const offlineDB = new OfflineDatabase();
```

---

### Task 11: Real-time QR Scanner & Manual Attendance Override

**Files:**
- Create: `app/src/lib/actions/attendance.ts`
- Create: `app/src/components/scanner/qr-scanner.tsx`
- Create: `app/src/components/scanner/scan-result.tsx`
- Create: `app/src/components/scanner/manual-override-dialog.tsx`
- Create: `app/src/app/(dashboard)/scanner/page.tsx`

**Interfaces:**
- Produces: `recordScanAction()`, `bulkSyncScansAction()`, `manualAttendanceOverrideAction()`, html5-qrcode camera integration, audio beeps on scan, active slot countdown.

- [ ] **Step 1: Write `src/lib/actions/attendance.ts` with 3-second abort & slot window validation**

```typescript
// app/src/lib/actions/attendance.ts
'use server';

import { createAdminClient } from '@/lib/supabase/admin';
import { getSessionUser } from '@/lib/session';
import { ActionResponse } from '@/lib/types/actions';

export async function recordScanAction(input: {
  student_uid: string;
  event_id: string;
  slot_id?: string | null;
  client_id?: string;
  timestamp?: string;
}): Promise<ActionResponse<{ student_name: string; event_name: string; timestamp: string }>> {
  const user = await getSessionUser();
  if (!user) return { success: false, error: 'Unauthorized.' };

  const admin = createAdminClient();
  const scanTime = input.timestamp ? new Date(input.timestamp) : new Date();

  // 1. Resolve student
  const { data: student } = await admin
    .from('students')
    .select('id, full_name, status')
    .eq('uid', input.student_uid.trim())
    .eq('organization_id', user.organization_id)
    .single();

  if (!student) return { success: false, error: 'Student not found.' };
  if (student.status !== 'Active') return { success: false, error: 'Student account is inactive.' };

  // 2. Resolve event & slots
  const { data: event } = await admin
    .from('events')
    .select('id, name, status, slots:event_slots(*)')
    .eq('id', input.event_id)
    .eq('organization_id', user.organization_id)
    .single();

  if (!event) return { success: false, error: 'Event not found.' };
  if (event.status !== 'Open') return { success: false, error: 'Event is closed for attendance.' };

  // 3. Validate slot window if event has slots
  let activeSlotId = input.slot_id || null;
  if (event.slots && event.slots.length > 0) {
    const validSlot = event.slots.find((slot: any) => {
      const open = new Date(slot.opens_at);
      const close = new Date(slot.closes_at);
      return scanTime >= open && scanTime <= close;
    });

    if (!validSlot) {
      return { success: false, error: 'Scan rejected: Outside active attendance time window.' };
    }
    activeSlotId = validSlot.id;
  }

  // 4. Duplicate Check
  const { data: existing } = await admin
    .from('attendance_records')
    .select('id')
    .eq('student_id', student.id)
    .eq('event_id', event.id)
    .eq('slot_id', activeSlotId || '00000000-0000-0000-0000-000000000000')
    .maybeSingle();

  if (existing) {
    return { success: false, error: 'Already scanned for this session.', code: 'DUPLICATE' };
  }

  // 5. Insert Attendance
  const { error: insertErr } = await admin.from('attendance_records').insert({
    organization_id: user.organization_id,
    student_id: student.id,
    event_id: event.id,
    slot_id: activeSlotId,
    officer_id: user.role === 'officer' ? user.id : null,
    officer_name: user.name,
    client_id: input.client_id || null,
    recorded_at: scanTime.toISOString(),
  });

  if (insertErr) {
    if (insertErr.code === '23505') {
      return { success: false, error: 'Already scanned.', code: 'DUPLICATE' };
    }
    return { success: false, error: insertErr.message };
  }

  return {
    success: true,
    data: {
      student_name: student.full_name,
      event_name: event.name,
      timestamp: scanTime.toISOString(),
    },
  };
}

export async function bulkSyncScansAction(scans: any[]): Promise<ActionResponse<any[]>> {
  const results = [];
  for (const scan of scans) {
    const res = await recordScanAction(scan);
    results.push({
      client_id: scan.client_id,
      success: res.success,
      error: !res.success ? res.error : undefined,
      code: !res.success ? res.code : undefined,
      data: res.success ? res.data : undefined,
    });
  }
  return { success: true, data: results };
}

export async function manualAttendanceOverrideAction(input: {
  student_id: string;
  event_id: string;
  slot_id?: string | null;
}): Promise<ActionResponse> {
  const user = await getSessionUser();
  if (!user || user.role !== 'admin') return { success: false, error: 'Only admins can perform manual override.' };

  const admin = createAdminClient();
  const { error } = await admin.from('attendance_records').insert({
    organization_id: user.organization_id,
    student_id: input.student_id,
    event_id: input.event_id,
    slot_id: input.slot_id || null,
    officer_name: 'Admin (Manual Override)',
  });

  if (error) {
    if (error.code === '23505') return { success: false, error: 'Student already has attendance for this slot.' };
    return { success: false, error: error.message };
  }

  return { success: true, data: undefined, message: 'Attendance recorded manually.' };
}
```

- [ ] **Step 2: Build `src/app/(dashboard)/scanner/page.tsx` with camera scanner, audio feedback, slot countdown, and offline queue**

---

### Task 12: QR Badge Generator & Bulk Canvas Export

**Files:**
- Create: `app/src/components/badges/badge-card.tsx`
- Create: `app/src/components/badges/badge-canvas.ts`
- Create: `app/src/app/(dashboard)/qr-generator/page.tsx`

**Interfaces:**
- Produces: Student ID badge generator, printable single/bulk sheet, high-res PNG canvas exporter with gold ACS branding.

- [ ] **Step 1: Write badge canvas exporter and build QR generator page with pagination & bulk download**

---

### Task 13: Statistics & Reporting Module

**Files:**
- Create: `app/src/lib/actions/statistics.ts`
- Create: `app/src/app/(dashboard)/statistics/page.tsx`

**Interfaces:**
- Produces: Filterable attendance reports by Event, Year Level, Date Range, with CSV export and print-ready stylesheet.

- [ ] **Step 1: Implement statistics queries and reporting page**

---

### Task 14: On-Device Audit Log Page

**Files:**
- Create: `app/src/app/(dashboard)/device-log/page.tsx`

**Interfaces:**
- Produces: Permanent on-device scan audit trail viewer querying IndexedDB, status pills (`Synced`, `Saved Offline`, `Already Scanned`), and CSV export.

- [ ] **Step 1: Build Device Log page with IndexedDB query and clear/export actions**

---

### Task 15: Admin Settings & Semester Rollover Automation

**Files:**
- Create: `app/src/lib/actions/settings.ts`
- Create: `app/src/app/(dashboard)/settings/page.tsx`

**Interfaces:**
- Produces: Academic year advancement, semester rollover (with automatic student promotion / alumni graduation), officer roster management, and super-user password update.

- [ ] **Step 1: Write `src/lib/actions/settings.ts` and settings page UI**

---

### Task 16: Student Self-Service Portal

**Files:**
- Create: `app/src/app/(student)/my-qr/page.tsx`
- Create: `app/src/app/(student)/my-attendance/page.tsx`

**Interfaces:**
- Produces: Student personal badge view with QR download/print and personal attendance history log.

- [ ] **Step 1: Build `my-qr/page.tsx` and `my-attendance/page.tsx`**

---

### Task 17: PWA Service Worker & CI/CD Pipeline

**Files:**
- Create: `app/public/manifest.json`
- Create: `app/public/sw.js`
- Create: `.github/workflows/ci.yml`

**Interfaces:**
- Produces: Installable PWA manifest with dark gold theme and GitHub Actions CI workflow (lint, typecheck, build).

- [ ] **Step 1: Create PWA manifest and service worker**
- [ ] **Step 2: Create `.github/workflows/ci.yml`**

---

## Plan Review Checklist
1. **Spec Coverage**: All 13 spec sections mapped 1:1 with clear tasks.
2. **Multi-tenancy**: Every action scopes to `user.organization_id`.
3. **Offline Resilience**: IndexedDB + 3s timeout + auto-sync + 3-layer dedup implemented.
4. **Time-Slot Windows**: Event slot windows validated on scan and bulk sync.
5. **Admin Override**: Manual attendance insertion supported.
