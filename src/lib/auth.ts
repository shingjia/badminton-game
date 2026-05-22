import { createHmac, timingSafeEqual } from 'node:crypto';

export const COOKIE_NAME = 'admin_session';
export const DEFAULT_MAX_AGE = 8 * 3600; // 8 hours

/**
 * Token format: base64url(issuedAtSeconds).base64url(hmac)
 */
export function signSession(secret: string, issuedAtSeconds?: number): string {
  const issued = issuedAtSeconds ?? Math.floor(Date.now() / 1000);
  const payload = Buffer.from(String(issued)).toString('base64url');
  const sig = createHmac('sha256', secret).update(payload).digest('base64url');
  return `${payload}.${sig}`;
}

export function verifySession(
  token: string | undefined,
  secret: string,
  maxAgeSeconds: number = DEFAULT_MAX_AGE,
): boolean {
  if (!token || typeof token !== 'string') return false;
  const parts = token.split('.');
  if (parts.length !== 2) return false;
  const [payload, sig] = parts;

  const expected = createHmac('sha256', secret).update(payload).digest('base64url');
  const a = Buffer.from(sig);
  const b = Buffer.from(expected);
  if (a.length !== b.length) return false;
  if (!timingSafeEqual(a, b)) return false;

  const issued = Number(Buffer.from(payload, 'base64url').toString('utf8'));
  if (!Number.isFinite(issued)) return false;
  const age = Math.floor(Date.now() / 1000) - issued;
  if (age < 0 || age > maxAgeSeconds) return false;

  return true;
}

export function passwordMatches(input: string, expected: string): boolean {
  const a = Buffer.from(input);
  const b = Buffer.from(expected);
  if (a.length !== b.length) return false;
  return timingSafeEqual(a, b);
}
