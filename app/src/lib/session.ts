import { cookies, headers } from 'next/headers';
import { cache } from 'react';
import { SessionUser } from '@/lib/types/actions';
import { env, isSecureOrigin } from '@/lib/env';

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

function bufferToBase64Url(buffer: ArrayBuffer): string {
  const bytes = new Uint8Array(buffer);
  let binary = '';
  for (let i = 0; i < bytes.byteLength; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return btoa(binary)
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '');
}

function base64UrlToBuffer(b64url: string): ArrayBuffer {
  let b64 = b64url.replace(/-/g, '+').replace(/_/g, '/');
  while (b64.length % 4) {
    b64 += '=';
  }
  const binary = atob(b64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes.buffer;
}

export async function signSession(payload: SessionUser): Promise<string> {
  const enc = new TextEncoder();
  const data = JSON.stringify(payload);
  const key = await getCryptoKey();
  const signature = await crypto.subtle.sign('HMAC', key, enc.encode(data));
  const b64Data = bufferToBase64Url(enc.encode(data).buffer);
  const b64Sig = bufferToBase64Url(signature);
  return `${b64Data}.${b64Sig}`;
}

export async function verifySession(token: string, now: number = Date.now()): Promise<SessionUser | null> {
  try {
    const [b64Data, b64Sig] = token.split('.');
    if (!b64Data || !b64Sig || token.split('.').length !== 2) return null;

    const dataBuffer = base64UrlToBuffer(b64Data);
    const sigBuffer = base64UrlToBuffer(b64Sig);
    const key = await getCryptoKey();

    const isValid = await crypto.subtle.verify('HMAC', key, sigBuffer, dataBuffer);
    if (!isValid) return null;

    const dec = new TextDecoder();
    const session = JSON.parse(dec.decode(dataBuffer)) as SessionUser;
    if (
      !session.subject_id ||
      !session.subject_type ||
      !session.organization_id ||
      session.subject_id !== session.id ||
      session.subject_type !== session.role ||
      !Number.isFinite(session.issued_at) ||
      !Number.isFinite(session.expires_at) ||
      session.expires_at <= session.issued_at ||
      now >= session.expires_at
    ) {
      return null;
    }
    return session;
  } catch {
    return null;
  }
}

export async function setSessionCookie(user: SessionUser) {
  const token = await signSession(user);
  const cookieStore = await cookies();
  const requestHeaders = await headers();
  const forwardedProto = requestHeaders.get('x-forwarded-proto');
  const forwardedHost = requestHeaders.get('x-forwarded-host') || requestHeaders.get('host');
  const detectedOrigin = forwardedProto && forwardedHost ? `${forwardedProto}://${forwardedHost}` : env.siteUrl;

  cookieStore.set(SESSION_COOKIE_NAME, token, {
    httpOnly: true,
    secure: isSecureOrigin(detectedOrigin) || process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    path: '/',
    maxAge: Math.max(0, Math.floor((user.expires_at - Date.now()) / 1000)),
  });
}

export const getSessionUser = cache(async function getSessionUser(): Promise<SessionUser | null> {
  const cookieStore = await cookies();
  const token = cookieStore.get(SESSION_COOKIE_NAME)?.value;
  if (!token) return null;
  return verifySession(token);
});

export async function clearSessionCookie() {
  const cookieStore = await cookies();
  cookieStore.delete(SESSION_COOKIE_NAME);
}
