import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { COOKIE_NAME, DEFAULT_MAX_AGE, passwordMatches, signSession } from '@/lib/auth';

const Body = z.object({ password: z.string().min(1) });

export async function POST(req: NextRequest) {
  const json = await req.json().catch(() => null);
  const parsed = Body.safeParse(json);
  if (!parsed.success) {
    return NextResponse.json({ error: 'invalid_body' }, { status: 400 });
  }

  const adminPw = process.env.ADMIN_PASSWORD;
  const secret = process.env.SESSION_SECRET;
  if (!adminPw || !secret || secret.length < 32) {
    return NextResponse.json({ error: 'server_not_configured' }, { status: 500 });
  }

  if (!passwordMatches(parsed.data.password, adminPw)) {
    await new Promise((r) => setTimeout(r, 1000)); // throttle wrong attempts
    return NextResponse.json({ error: 'invalid_credentials' }, { status: 401 });
  }

  const token = signSession(secret);
  const res = NextResponse.json({ ok: true });
  res.cookies.set(COOKIE_NAME, token, {
    httpOnly: true,
    sameSite: 'lax',
    path: '/',
    maxAge: DEFAULT_MAX_AGE,
  });
  return res;
}
