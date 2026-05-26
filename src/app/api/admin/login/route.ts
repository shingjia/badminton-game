import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { prisma } from '@/lib/prisma';
import {
  COOKIE_NAME,
  DEFAULT_MAX_AGE,
  hashPassword,
  passwordMatches,
  signSession,
  verifyPassword,
} from '@/lib/auth';

const Body = z.object({ password: z.string().min(1) });

export async function POST(req: NextRequest) {
  const json = await req.json().catch(() => null);
  const parsed = Body.safeParse(json);
  if (!parsed.success) {
    return NextResponse.json({ error: 'invalid_body' }, { status: 400 });
  }

  const secret = process.env.SESSION_SECRET;
  if (!secret || secret.length < 32) {
    return NextResponse.json({ error: 'server_not_configured' }, { status: 500 });
  }

  const config = await prisma.adminConfig.findUnique({ where: { id: 0 } });

  let ok = false;
  if (config) {
    ok = verifyPassword(parsed.data.password, config.passwordHash);
  } else {
    const envPw = process.env.ADMIN_PASSWORD;
    if (!envPw) {
      return NextResponse.json({ error: 'server_not_configured' }, { status: 500 });
    }
    ok = passwordMatches(parsed.data.password, envPw);
    if (ok) {
      await prisma.adminConfig.create({
        data: { id: 0, passwordHash: hashPassword(parsed.data.password) },
      });
    }
  }

  if (!ok) {
    await new Promise((r) => setTimeout(r, 1000));
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
