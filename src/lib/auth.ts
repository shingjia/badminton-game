import { createHmac, randomBytes, scryptSync, timingSafeEqual } from 'node:crypto';

export const COOKIE_NAME = 'admin_session';
export const DEFAULT_MAX_AGE = 8 * 3600; // 8 hours

export type SessionPayload = { u: string; t: number };

/**
 * Token format: base64url(JSON{u: userId, t: issuedAtSeconds}).base64url(hmac)
 */
export function signSession(
  secret: string,
  userId: string,
  issuedAtSeconds?: number,
): string {
  const issued = issuedAtSeconds ?? Math.floor(Date.now() / 1000);
  const payload = Buffer.from(JSON.stringify({ u: userId, t: issued })).toString('base64url');
  const sig = createHmac('sha256', secret).update(payload).digest('base64url');
  return `${payload}.${sig}`;
}

/**
 * Returns the decoded payload on success, or null on failure.
 * Old v1 tokens (timestamp-only payload) cannot be parsed as JSON and will
 * return null — those users are forced to log in again.
 */
export function verifySession(
  token: string | undefined,
  secret: string,
  maxAgeSeconds: number = DEFAULT_MAX_AGE,
): SessionPayload | null {
  if (!token || typeof token !== 'string') return null;
  const parts = token.split('.');
  if (parts.length !== 2) return null;
  const [payload, sig] = parts;

  const expected = createHmac('sha256', secret).update(payload).digest('base64url');
  const a = Buffer.from(sig);
  const b = Buffer.from(expected);
  if (a.length !== b.length) return null;
  if (!timingSafeEqual(a, b)) return null;

  let decoded: unknown;
  try {
    decoded = JSON.parse(Buffer.from(payload, 'base64url').toString('utf8'));
  } catch {
    return null;
  }
  if (
    !decoded ||
    typeof decoded !== 'object' ||
    typeof (decoded as any).u !== 'string' ||
    typeof (decoded as any).t !== 'number'
  ) {
    return null;
  }

  const sp = decoded as SessionPayload;
  const age = Math.floor(Date.now() / 1000) - sp.t;
  if (age < 0 || age > maxAgeSeconds) return null;
  return sp;
}

export function passwordMatches(input: string, expected: string): boolean {
  const a = Buffer.from(input);
  const b = Buffer.from(expected);
  if (a.length !== b.length) return false;
  return timingSafeEqual(a, b);
}

/**
 * scrypt-based password hashing. Format: "scrypt$N$r$p$saltHex$hashHex"
 */
export function hashPassword(plain: string): string {
  const salt = randomBytes(16);
  const hash = scryptSync(plain, salt, 64);
  return `scrypt$16384$8$1$${salt.toString('hex')}$${hash.toString('hex')}`;
}

export function verifyPassword(plain: string, stored: string): boolean {
  const parts = stored.split('$');
  if (parts.length !== 6 || parts[0] !== 'scrypt') return false;
  const saltHex = parts[4];
  const hashHex = parts[5];
  if (!saltHex || !hashHex) return false;
  const salt = Buffer.from(saltHex, 'hex');
  const expected = Buffer.from(hashHex, 'hex');
  let actual: Buffer;
  try {
    actual = scryptSync(plain, salt, expected.length);
  } catch {
    return false;
  }
  if (actual.length !== expected.length) return false;
  return timingSafeEqual(actual, expected);
}
