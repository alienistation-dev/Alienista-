import { describe, it, expect, vi, afterEach } from 'vitest';
import crypto from 'node:crypto';
import {
  createGoogleWalletJwtPayload,
  createGoogleWalletObject,
  deactivateGoogleWalletObject,
  issueGoogleWalletSaveUrl,
  signGoogleWalletJwt,
  syncGoogleWalletObject,
} from '@/lib/badges/google-wallet';
import type { Student } from '@/lib/types/models';

describe('Google Wallet Pass Generation', () => {
  const mockStudent: Student = {
    id: '123e4567-e89b-12d3-a456-426614174000',
    organization_id: 'org-1',
    uid: '2024-0042',
    student_number: '2024-00042',
    full_name: 'Nestor Jann Asag',
    course: 'BSIT',
    year: '3rd Year',
    section: 'Block A',
    status: 'Active',
    is_first_login: false,
    avatar_url: 'https://example.com/avatar.png',
    created_at: '2026-01-01T00:00:00Z',
    updated_at: '2026-01-01T00:00:00Z',
  };

  const mockConfig = {
    issuerId: '3388000000012345678',
    classId: 'student_badge_dev',
    clientEmail: 'wallet-dev@test.iam.gserviceaccount.com',
    appUrl: 'https://alienista.edu',
  };

  it('creates deterministic generic object id and embeds student.uid in QR barcode', () => {
    const payload = createGoogleWalletJwtPayload(mockStudent, mockConfig);

    expect(payload.iss).toBe(mockConfig.clientEmail);
    expect(payload.typ).toBe('savetowallet');
    expect(payload.iat).toEqual(expect.any(Number));
    // The save JWT references the object by id only; the API holds the details.
    expect(payload.payload.genericObjects).toEqual([
      { id: `${mockConfig.issuerId}.${mockStudent.id}`, classId: `${mockConfig.issuerId}.${mockConfig.classId}` },
    ]);

    const genericObject = createGoogleWalletObject(mockStudent, mockConfig);
    expect(genericObject.state).toBe('ACTIVE');
    expect(genericObject.id).toBe(`${mockConfig.issuerId}.${mockStudent.id}`);
    expect(genericObject.classId).toBe(`${mockConfig.issuerId}.${mockConfig.classId}`);
    expect(genericObject.barcode).toEqual({
      type: 'QR_CODE',
      value: '2024-0042',
      alternateText: '2024-0042',
    });
    expect(genericObject.cardTitle.defaultValue.value).toBe('Alienista');
    expect(genericObject.hexBackgroundColor).toBe('#2d6a4f');
    expect(genericObject.logo?.sourceUri.uri).toBe(
      'https://example.com/avatar.png?v=2026-01-01T00%3A00%3A00Z'
    );
    expect(genericObject.logo?.contentDescription.defaultValue.value).toBe('LOGO_IMAGE_DESCRIPTION');
    expect(genericObject.imageModulesData).toEqual([]);
    expect(genericObject.heroImage).toBeUndefined();
    expect(genericObject.subheader.defaultValue.value).toBe('Student Member');
    expect(genericObject.header.defaultValue.value).toBe('Nestor Jann Asag');
    expect(genericObject.textModulesData).toEqual([
      { id: 'program', header: 'Program', body: 'BSIT' },
      { id: 'year_level', header: 'YEAR LEVEL', body: '3rd Year' },
      { id: 'section', header: 'SECTION', body: 'BLOCK A' },
      { id: 'student_no.', header: 'STUDENT NO.', body: '2024-00042' },
    ]);
  });

  it('builds the same deterministic object used by the Wallet patch endpoint', () => {
    const object = createGoogleWalletObject(mockStudent, mockConfig);
    expect(object.id).toBe(`${mockConfig.issuerId}.${mockStudent.id}`);
    expect(object.cardTitle.defaultValue.value).toBe('Alienista');
  });

  it('keeps the legacy variant available for organization-wide rollback', () => {
    const object = createGoogleWalletObject(mockStudent, mockConfig, 'legacy');
    expect(object.logo?.sourceUri.uri).toContain('example.com/avatar.png?v=');
    expect(object.imageModulesData).toEqual([]);
    expect(object.heroImage).toBeUndefined();
    expect(object.subheader.defaultValue.value).toBe('BSIT - 3rd Year');
  });

  it('rejects non-public logo URLs and accepts a configured HTTPS logo', () => {
    process.env.GOOGLE_WALLET_LOGO_URL = 'http://localhost:3000/icon-512.png';
    expect(createGoogleWalletObject(mockStudent, mockConfig).logo?.sourceUri.uri).toContain('example.com/avatar.png?v=');

    process.env.GOOGLE_WALLET_LOGO_URL = 'https://cdn.example.com/alienista.png';
    expect(createGoogleWalletObject(mockStudent, mockConfig).logo?.sourceUri.uri).toBe('https://cdn.example.com/alienista.png');
  });

  it('includes a configured public hero image and ignores local or invalid URLs', () => {
    process.env.GOOGLE_WALLET_HERO_URL = 'http://localhost:3000/wallet-hero.png';
    expect(createGoogleWalletObject(mockStudent, mockConfig).heroImage).toBeUndefined();

    process.env.GOOGLE_WALLET_HERO_URL = 'not-a-url';
    expect(createGoogleWalletObject(mockStudent, mockConfig).heroImage).toBeUndefined();

    process.env.GOOGLE_WALLET_HERO_URL = 'https://cdn.example.com/alienista-wallet-hero.png';
    expect(createGoogleWalletObject(mockStudent, mockConfig).heroImage?.sourceUri.uri).toBe(
      'https://cdn.example.com/alienista-wallet-hero.png'
    );
  });

  it('signs valid RS256 JWT using node:crypto without external libraries', () => {
    const { privateKey, publicKey } = crypto.generateKeyPairSync('rsa', {
      modulusLength: 2048,
    });
    const privateKeyPem = privateKey.export({ type: 'pkcs8', format: 'pem' }) as string;
    const publicKeyPem = publicKey.export({ type: 'spki', format: 'pem' }) as string;

    const payload = createGoogleWalletJwtPayload(mockStudent, mockConfig);
    const token = signGoogleWalletJwt(payload, privateKeyPem);

    const parts = token.split('.');
    expect(parts).toHaveLength(3);

    // Verify signature with public key
    const verifier = crypto.createVerify('RSA-SHA256');
    verifier.update(`${parts[0]}.${parts[1]}`);
    const signature = Buffer.from(parts[2].replace(/-/g, '+').replace(/_/g, '/'), 'base64');
    expect(verifier.verify(publicKeyPem, signature)).toBe(true);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    delete process.env.GOOGLE_WALLET_ISSUER_ID;
    delete process.env.GOOGLE_WALLET_CLASS_ID;
    delete process.env.GOOGLE_WALLET_CLIENT_EMAIL;
    delete process.env.GOOGLE_WALLET_PRIVATE_KEY;
    delete process.env.GOOGLE_WALLET_LOGO_URL;
    delete process.env.GOOGLE_WALLET_HERO_URL;
    delete process.env.GOOGLE_WALLET_HERO_URL;
  });

  it('skips refresh when Wallet server credentials are unavailable', async () => {
    await expect(syncGoogleWalletObject(mockStudent)).resolves.toEqual({ status: 'skipped' });
  });

  it('reports a missing existing pass without failing the student update flow', async () => {
    const { privateKey } = crypto.generateKeyPairSync('rsa', { modulusLength: 2048 });
    process.env.GOOGLE_WALLET_ISSUER_ID = mockConfig.issuerId;
    process.env.GOOGLE_WALLET_CLASS_ID = mockConfig.classId;
    process.env.GOOGLE_WALLET_CLIENT_EMAIL = mockConfig.clientEmail;
    process.env.GOOGLE_WALLET_PRIVATE_KEY = privateKey.export({ type: 'pkcs8', format: 'pem' }) as string;
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(new Response(JSON.stringify({ access_token: 'access-token' }), { status: 200 }))
      .mockResolvedValueOnce(new Response(null, { status: 404 }));
    vi.stubGlobal('fetch', fetchMock);

    await expect(syncGoogleWalletObject(mockStudent)).resolves.toEqual({ status: 'not_found' });
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it('patches the deterministic object when an existing pass is found', async () => {
    const { privateKey } = crypto.generateKeyPairSync('rsa', { modulusLength: 2048 });
    process.env.GOOGLE_WALLET_ISSUER_ID = mockConfig.issuerId;
    process.env.GOOGLE_WALLET_CLASS_ID = mockConfig.classId;
    process.env.GOOGLE_WALLET_CLIENT_EMAIL = mockConfig.clientEmail;
    process.env.GOOGLE_WALLET_PRIVATE_KEY = privateKey.export({ type: 'pkcs8', format: 'pem' }) as string;
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(new Response(JSON.stringify({ access_token: 'access-token' }), { status: 200 }))
      .mockResolvedValueOnce(new Response('{}', { status: 200 }));
    vi.stubGlobal('fetch', fetchMock);

    await expect(syncGoogleWalletObject(mockStudent)).resolves.toEqual({ status: 'updated' });
    const patchCall = fetchMock.mock.calls[1];
    expect(patchCall[0]).toContain(encodeURIComponent(`${mockConfig.issuerId}.${mockStudent.id}`));
    expect(patchCall[1]).toMatchObject({ method: 'PATCH' });
    expect(JSON.parse(patchCall[1].body)).toMatchObject({
      cardTitle: { defaultValue: { value: 'Alienista' } },
      barcode: { value: mockStudent.uid },
      imageModulesData: [],
    });
  });

  function setWalletEnv() {
    const { privateKey } = crypto.generateKeyPairSync('rsa', { modulusLength: 2048 });
    process.env.GOOGLE_WALLET_ISSUER_ID = mockConfig.issuerId;
    process.env.GOOGLE_WALLET_CLASS_ID = mockConfig.classId;
    process.env.GOOGLE_WALLET_CLIENT_EMAIL = mockConfig.clientEmail;
    process.env.GOOGLE_WALLET_PRIVATE_KEY = privateKey.export({ type: 'pkcs8', format: 'pem' }) as string;
  }

  function decodeSavePayload(url: string) {
    const jwt = url.replace('https://pay.google.com/gp/v/save/', '');
    return Buffer.from(jwt.split('.')[1].replace(/-/g, '+').replace(/_/g, '/'), 'base64').toString('utf8');
  }

  it('marks a non-Active student object INACTIVE so profile sync deactivates the pass', async () => {
    setWalletEnv();
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(new Response(JSON.stringify({ access_token: 'access-token' }), { status: 200 }))
      .mockResolvedValueOnce(new Response('{}', { status: 200 }));
    vi.stubGlobal('fetch', fetchMock);

    await syncGoogleWalletObject({ ...mockStudent, status: 'Inactive' });
    expect(JSON.parse(fetchMock.mock.calls[1][1].body).state).toBe('INACTIVE');
  });

  it('inserts the object by API and returns a short ID-only save URL without student details', async () => {
    setWalletEnv();
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(new Response(JSON.stringify({ access_token: 'access-token' }), { status: 200 }))
      .mockResolvedValueOnce(new Response('{}', { status: 200 }));
    vi.stubGlobal('fetch', fetchMock);

    const result = await issueGoogleWalletSaveUrl(mockStudent);
    expect(result.status).toBe('issued');
    if (result.status !== 'issued') return;
    expect(fetchMock.mock.calls[1][0]).toBe('https://walletobjects.googleapis.com/walletobjects/v1/genericObject');
    expect(fetchMock.mock.calls[1][1]).toMatchObject({ method: 'POST' });
    expect(result.url.length).toBeLessThan(1800);
    const decoded = decodeSavePayload(result.url);
    expect(decoded).not.toContain(mockStudent.full_name);
    expect(decoded).not.toContain(mockStudent.student_number);
    expect(decoded).not.toContain(mockStudent.uid);
    expect(JSON.parse(decoded).payload).toEqual({
      genericObjects: [{ id: `${mockConfig.issuerId}.${mockStudent.id}`, classId: `${mockConfig.issuerId}.${mockConfig.classId}` }],
    });
  });

  it('patches the existing object when insert returns 409 conflict', async () => {
    setWalletEnv();
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(new Response(JSON.stringify({ access_token: 'access-token' }), { status: 200 }))
      .mockResolvedValueOnce(new Response('{}', { status: 409 }))
      .mockResolvedValueOnce(new Response('{}', { status: 200 }));
    vi.stubGlobal('fetch', fetchMock);

    await expect(issueGoogleWalletSaveUrl(mockStudent)).resolves.toMatchObject({ status: 'issued' });
    expect(fetchMock.mock.calls[2][0]).toContain(encodeURIComponent(`${mockConfig.issuerId}.${mockStudent.id}`));
    expect(fetchMock.mock.calls[2][1]).toMatchObject({ method: 'PATCH' });
  });

  it('returns no save URL when the object cannot be saved', async () => {
    setWalletEnv();
    vi.stubGlobal('fetch', vi.fn()
      .mockResolvedValueOnce(new Response(JSON.stringify({ access_token: 'access-token' }), { status: 200 }))
      .mockResolvedValueOnce(new Response('{}', { status: 500 })));

    await expect(issueGoogleWalletSaveUrl(mockStudent)).resolves.toEqual({ status: 'failed', error: 'Wallet object save failed (500).' });
  });

  it('sets only the object state to INACTIVE when deactivating a pass', async () => {
    setWalletEnv();
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(new Response(JSON.stringify({ access_token: 'access-token' }), { status: 200 }))
      .mockResolvedValueOnce(new Response('{}', { status: 200 }));
    vi.stubGlobal('fetch', fetchMock);

    await expect(deactivateGoogleWalletObject(mockStudent.id)).resolves.toEqual({ status: 'updated' });
    expect(fetchMock.mock.calls[1][0]).toContain(encodeURIComponent(`${mockConfig.issuerId}.${mockStudent.id}`));
    expect(fetchMock.mock.calls[1][1]).toMatchObject({ method: 'PATCH', body: JSON.stringify({ state: 'INACTIVE' }) });
  });
});
