import crypto from 'node:crypto';
import type { GoogleWalletDesign, Student } from '@/lib/types/models';

export interface GoogleWalletConfig {
  issuerId: string;
  classId: string;
  clientEmail: string;
  appUrl: string;
}

const WALLET_SCOPE = 'https://www.googleapis.com/auth/wallet_object.issuer';
const TOKEN_ENDPOINT = 'https://oauth2.googleapis.com/token';
const GENERIC_OBJECT_ENDPOINT = 'https://walletobjects.googleapis.com/walletobjects/v1/genericObject';

function getGoogleWalletAppUrl(): string {
  return process.env.GOOGLE_WALLET_APP_URL
    || process.env.NEXT_PUBLIC_APP_URL
    || process.env.NEXT_PUBLIC_SITE_URL
    || 'http://localhost:3000';
}

export function base64UrlEncode(data: string | Buffer): string {
  return Buffer.from(data)
    .toString('base64')
    .replace(/=/g, '')
    .replace(/\+/g, '-')
    .replace(/\//g, '_');
}

function versionedImageUrl(url: string, updatedAt: string): string {
  const separator = url.includes('?') ? '&' : '?';
  return `${url}${separator}v=${encodeURIComponent(updatedAt)}`;
}

function getWalletLogoUrl(student: Student): string | null {
  const configuredLogo = process.env.GOOGLE_WALLET_LOGO_URL?.trim();
  if (configuredLogo) {
    try {
      const url = new URL(configuredLogo);
      if (url.protocol === 'https:') return url.toString();
    } catch {
      // Fall through to the student's public avatar.
    }
  }

  if (!student.avatar_url) return null;
  try {
    const url = new URL(student.avatar_url);
    return url.protocol === 'https:' ? versionedImageUrl(url.toString(), student.updated_at) : null;
  } catch {
    return null;
  }
}

// Google fetches the hero itself, so only public HTTPS URLs work. Default: the app's own public/wallet-hero.png.
function getWalletHeroUrl(appUrl: string): string | null {
  for (const candidate of [process.env.GOOGLE_WALLET_HERO_URL?.trim(), `${appUrl}/wallet-hero.png`]) {
    if (!candidate) continue;
    try {
      const url = new URL(candidate);
      if (url.protocol === 'https:') return url.toString();
    } catch {
      // Try the next candidate.
    }
  }
  return null;
}

function walletObjectIds(studentId: string, config: GoogleWalletConfig) {
  const classId = config.classId.includes('.')
    ? config.classId
    : `${config.issuerId}.${config.classId}`;
  return { id: `${config.issuerId}.${studentId.replace(/[^a-zA-Z0-9_-]/g, '_')}`, classId };
}

export function createGoogleWalletObject(student: Student, config: GoogleWalletConfig, design: GoogleWalletDesign = 'builder') {
  const rawSection = student.section || '1';
  const sectionLabel = rawSection.toUpperCase().startsWith('BLOCK')
    ? rawSection.toUpperCase()
    : `BLOCK ${rawSection.toUpperCase()}`;

  const { id: fullObjectId, classId: fullClassId } = walletObjectIds(student.id, config);
  const logoUrl = getWalletLogoUrl(student);
  const heroUrl = getWalletHeroUrl(config.appUrl.replace(/\/$/, ''));

  const cardTitle = process.env.GOOGLE_WALLET_CARD_TITLE?.trim() || 'Alienista';
  const subheader = process.env.GOOGLE_WALLET_SUBHEADER?.trim() || 'Student Member';
  const hexBackgroundColor = process.env.GOOGLE_WALLET_HEX_BACKGROUND_COLOR?.trim() || '#1a3822';

  const object = {
    id: fullObjectId,
    classId: fullClassId,
    // Inactive students must not keep a usable pass; every sync writes the current state.
    state: student.status === 'Active' ? 'ACTIVE' : 'INACTIVE',
    cardTitle: { defaultValue: { language: 'en-US', value: cardTitle } },
    header: { defaultValue: { language: 'en-US', value: student.full_name } },
    subheader: { defaultValue: { language: 'en-US', value: subheader } },
    hexBackgroundColor,
    heroImage: heroUrl
      ? {
          sourceUri: { uri: heroUrl },
          contentDescription: { defaultValue: { language: 'en-US', value: 'HERO_IMAGE_DESCRIPTION' } },
        }
      : undefined,
    logo: logoUrl
      ? {
          sourceUri: { uri: logoUrl },
          contentDescription: { defaultValue: { language: 'en-US', value: 'LOGO_IMAGE_DESCRIPTION' } },
        }
      : undefined,
    // PATCH semantics preserve omitted fields, so an empty array removes an old image module.
    imageModulesData: [],
    barcode: {
      type: 'QR_CODE',
      value: student.uid,
      alternateText: student.uid,
    },
    textModulesData: [
      { id: 'program', header: 'Program', body: student.course },
      { id: 'year_level', header: 'YEAR LEVEL', body: student.year },
      { id: 'section', header: 'SECTION', body: sectionLabel },
      { id: 'student_no.', header: 'STUDENT NO.', body: student.student_number },
    ],
  };

  if (design === 'legacy') {
    object.subheader = { defaultValue: { language: 'en-US', value: `${student.course} - ${student.year}` } };
    object.textModulesData = [
      { id: 'program', header: 'PROGRAM', body: `${student.course} - ${student.year}` },
      { id: 'student_number', header: 'STUDENT NO.', body: student.student_number },
      { id: 'section', header: 'SECTION', body: student.section ? (student.section.startsWith('Block') ? student.section : `Block ${student.section}`) : 'Block 1' },
      { id: 'status', header: 'STATUS', body: student.status },
    ];
  }
  return object;
}

// The object is created through the REST API first, so the save JWT carries only its id.
// This keeps the URL short and keeps the student's name and number out of a forwardable link.
export function createGoogleWalletJwtPayload(student: Pick<Student, 'id'>, config: GoogleWalletConfig) {
  return {
    iss: config.clientEmail,
    aud: 'google',
    origins: [config.appUrl].filter(Boolean),
    typ: 'savetowallet',
    iat: Math.floor(Date.now() / 1000),
    payload: { genericObjects: [walletObjectIds(student.id, config)] },
  };
}

export function signGoogleWalletJwt(payload: object, privateKeyPem: string): string {
  const header = { alg: 'RS256', typ: 'JWT' };
  const encodedHeader = base64UrlEncode(JSON.stringify(header));
  const encodedPayload = base64UrlEncode(JSON.stringify(payload));
  const signInput = `${encodedHeader}.${encodedPayload}`;

  const normalizedKey = privateKeyPem.replace(/\\n/g, '\n');
  const signer = crypto.createSign('RSA-SHA256');
  signer.update(signInput);
  const signature = base64UrlEncode(signer.sign(normalizedKey));

  return `${signInput}.${signature}`;
}

function getWalletEnv(): { config: GoogleWalletConfig; privateKey: string } | null {
  const issuerId = process.env.GOOGLE_WALLET_ISSUER_ID;
  const classId = process.env.GOOGLE_WALLET_CLASS_ID;
  const clientEmail = process.env.GOOGLE_WALLET_CLIENT_EMAIL;
  const privateKey = process.env.GOOGLE_WALLET_PRIVATE_KEY;
  if (!issuerId || !classId || !clientEmail || !privateKey) return null;
  return { config: { issuerId, classId, clientEmail, appUrl: getGoogleWalletAppUrl() }, privateKey };
}

function createServiceAccountAssertion(config: GoogleWalletConfig, privateKey: string): string {
  const now = Math.floor(Date.now() / 1000);
  return signGoogleWalletJwt(
    {
      iss: config.clientEmail,
      scope: WALLET_SCOPE,
      aud: TOKEN_ENDPOINT,
      iat: now,
      exp: now + 3600,
    },
    privateKey
  );
}

async function getWalletAccessToken(config: GoogleWalletConfig, privateKey: string): Promise<string> {
  const assertion = createServiceAccountAssertion(config, privateKey);
  const response = await fetch(TOKEN_ENDPOINT, {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer',
      assertion,
    }),
    signal: AbortSignal.timeout(3000),
  });
  if (!response.ok) throw new Error(`Wallet token request failed (${response.status}).`);
  const body = (await response.json()) as { access_token?: string };
  if (!body.access_token) throw new Error('Wallet token response did not contain an access token.');
  return body.access_token;
}

export type GoogleWalletSyncResult =
  | { status: 'updated' }
  | { status: 'not_found' }
  | { status: 'skipped' }
  | { status: 'failed'; error: string };

export type GoogleWalletIssueResult =
  | { status: 'issued'; url: string }
  | { status: 'skipped' }
  | { status: 'failed'; error: string };

function walletRequest(url: string, method: 'POST' | 'PATCH', accessToken: string, body: object): Promise<Response> {
  return fetch(url, {
    method,
    headers: {
      authorization: `Bearer ${accessToken}`,
      'content-type': 'application/json',
    },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(3000),
  });
}

function objectUrl(objectId: string): string {
  return `${GENERIC_OBJECT_ENDPOINT}/${encodeURIComponent(objectId)}`;
}

async function patchWalletObject(objectId: string, body: object): Promise<GoogleWalletSyncResult> {
  const env = getWalletEnv();
  if (!env) return { status: 'skipped' };

  try {
    const accessToken = await getWalletAccessToken(env.config, env.privateKey);
    const response = await walletRequest(objectUrl(objectId), 'PATCH', accessToken, body);
    if (response.status === 404) return { status: 'not_found' };
    if (!response.ok) return { status: 'failed', error: `Wallet object update failed (${response.status}).` };
    return { status: 'updated' };
  } catch (error: unknown) {
    return { status: 'failed', error: error instanceof Error ? error.message : 'Wallet object update failed.' };
  }
}

export async function syncGoogleWalletObject(student: Student, design: GoogleWalletDesign = 'builder'): Promise<GoogleWalletSyncResult> {
  const env = getWalletEnv();
  if (!env) return { status: 'skipped' };
  const object = createGoogleWalletObject(student, env.config, design);
  return patchWalletObject(object.id, object);
}

// Used after a student is deleted, when no student row is left to build the full object from.
export async function deactivateGoogleWalletObject(studentId: string): Promise<GoogleWalletSyncResult> {
  const env = getWalletEnv();
  if (!env) return { status: 'skipped' };
  return patchWalletObject(walletObjectIds(studentId, env.config).id, { state: 'INACTIVE' });
}

export async function issueGoogleWalletSaveUrl(student: Student, design: GoogleWalletDesign = 'builder'): Promise<GoogleWalletIssueResult> {
  const env = getWalletEnv();
  if (!env) return { status: 'skipped' };

  try {
    const accessToken = await getWalletAccessToken(env.config, env.privateKey);
    const object = createGoogleWalletObject(student, env.config, design);
    let response = await walletRequest(GENERIC_OBJECT_ENDPOINT, 'POST', accessToken, object);
    // 409 means the pass was issued before; refresh it so it shows current details and state.
    if (response.status === 409) response = await walletRequest(objectUrl(object.id), 'PATCH', accessToken, object);
    if (!response.ok) return { status: 'failed', error: `Wallet object save failed (${response.status}).` };

    const jwt = signGoogleWalletJwt(createGoogleWalletJwtPayload(student, env.config), env.privateKey);
    return { status: 'issued', url: `https://pay.google.com/gp/v/save/${jwt}` };
  } catch (error: unknown) {
    return { status: 'failed', error: error instanceof Error ? error.message : 'Wallet object save failed.' };
  }
}
