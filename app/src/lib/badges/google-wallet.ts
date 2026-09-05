import crypto from 'node:crypto';
import type { Student } from '@/lib/types/models';

export interface GoogleWalletConfig {
  issuerId: string;
  classId: string;
  clientEmail: string;
  appUrl: string;
}

export function base64UrlEncode(data: string | Buffer): string {
  return Buffer.from(data)
    .toString('base64')
    .replace(/=/g, '')
    .replace(/\+/g, '-')
    .replace(/\//g, '_');
}

export function createGoogleWalletJwtPayload(student: Student, config: GoogleWalletConfig) {
  const sectionLabel = student.section
    ? student.section.startsWith('Block')
      ? student.section
      : `Block ${student.section}`
    : 'Block 1';

  const fullClassId = config.classId.includes('.')
    ? config.classId
    : `${config.issuerId}.${config.classId}`;

  const cleanStudentId = student.id.replace(/[^a-zA-Z0-9_-]/g, '_');
  const fullObjectId = `${config.issuerId}.${cleanStudentId}`;

  return {
    iss: config.clientEmail,
    aud: 'google',
    origins: [config.appUrl].filter(Boolean),
    typ: 'savetowallet',
    payload: {
      genericObjects: [
        {
          id: fullObjectId,
          classId: fullClassId,
          cardTitle: { defaultValue: { language: 'en-US', value: 'Student Membership Badge' } },
          header: { defaultValue: { language: 'en-US', value: student.full_name } },
          subheader: { defaultValue: { language: 'en-US', value: `${student.course} - ${student.year}` } },
          hexBackgroundColor: '#1B4332',
          logo: student.avatar_url
            ? {
                sourceUri: { uri: student.avatar_url },
                contentDescription: { defaultValue: { language: 'en-US', value: student.full_name } },
              }
            : undefined,
          barcode: {
            type: 'QR_CODE',
            value: student.uid,
            alternateText: student.uid,
          },
          textModulesData: [
            { id: 'student_number', header: 'STUDENT NO.', body: student.student_number },
            { id: 'section', header: 'SECTION', body: sectionLabel },
            { id: 'status', header: 'STATUS', body: student.status },
          ],
        },
      ],
    },
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

export function generateGoogleWalletSaveUrl(student: Student): string | null {
  const issuerId = process.env.GOOGLE_WALLET_ISSUER_ID;
  const classId = process.env.GOOGLE_WALLET_CLASS_ID;
  const clientEmail = process.env.GOOGLE_WALLET_CLIENT_EMAIL;
  const privateKey = process.env.GOOGLE_WALLET_PRIVATE_KEY;
  const appUrl = process.env.NEXT_PUBLIC_APP_URL || process.env.NEXT_PUBLIC_SITE_URL || 'http://localhost:3000';

  if (!issuerId || !classId || !clientEmail || !privateKey) return null;

  const payload = createGoogleWalletJwtPayload(student, { issuerId, classId, clientEmail, appUrl });
  const jwt = signGoogleWalletJwt(payload, privateKey);
  return `https://pay.google.com/gp/v/save/${jwt}`;
}
