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

export async function verifySession(token: string): Promise<SessionUser | null> {
  try {
    const [b64Data, b64Sig] = token.split('.');
    if (!b64Data || !b64Sig) return null;

    const dataBuffer = base64UrlToBuffer(b64Data);
    const sigBuffer = base64UrlToBuffer(b64Sig);
    const key = await getCryptoKey();

    const isValid = await crypto.subtle.verify('HMAC', key, sigBuffer, dataBuffer);
    if (!isValid) return null;

    const dec = new TextDecoder();
    return JSON.parse(dec.decode(dataBuffer)) as SessionUser;
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
