import { NextResponse, type NextRequest } from 'next/server';
import { verifySession } from '@/lib/session';

export async function proxy(request: NextRequest) {
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
  if (
    pathname === '/' ||
    pathname.startsWith('/students') ||
    pathname.startsWith('/events') ||
    pathname.startsWith('/scanner') ||
    pathname.startsWith('/qr-generator') ||
    pathname.startsWith('/statistics') ||
    pathname.startsWith('/device-log') ||
    pathname.startsWith('/settings')
  ) {
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
