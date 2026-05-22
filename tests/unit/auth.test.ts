import { describe, it, expect } from 'vitest';
import { signSession, verifySession, COOKIE_NAME } from '@/lib/auth';

const SECRET = 'a'.repeat(32);

describe('signSession / verifySession', () => {
  it('signs and verifies a fresh token', () => {
    const token = signSession(SECRET);
    const ok = verifySession(token, SECRET);
    expect(ok).toBe(true);
  });

  it('rejects token with wrong secret', () => {
    const token = signSession(SECRET);
    expect(verifySession(token, 'b'.repeat(32))).toBe(false);
  });

  it('rejects tampered payload', () => {
    const token = signSession(SECRET);
    const [payload, sig] = token.split('.');
    const tampered = payload.slice(0, -1) + 'X.' + sig;
    expect(verifySession(tampered, SECRET)).toBe(false);
  });

  it('rejects token older than maxAgeSeconds', () => {
    // sign with issuedAt 9 hours ago
    const oldIssuedAt = Math.floor(Date.now() / 1000) - 9 * 3600;
    const token = signSession(SECRET, oldIssuedAt);
    expect(verifySession(token, SECRET, 8 * 3600)).toBe(false);
  });

  it('exports cookie name constant', () => {
    expect(COOKIE_NAME).toBe('admin_session');
  });
});
