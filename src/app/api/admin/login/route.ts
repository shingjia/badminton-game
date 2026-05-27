import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import {
  COOKIE_NAME,
  DEFAULT_MAX_AGE,
  hashPassword,
  passwordMatches,
  signSession,
  verifyPassword,
} from '@/lib/auth';
import { AdminLogin } from '@/lib/schemas';

export async function POST(req: NextRequest) {
  const json = await req.json().catch(() => null);
  const parsed = AdminLogin.safeParse(json);
  if (!parsed.success) {
    return NextResponse.json({ error: 'invalid_body' }, { status: 400 });
  }

  const secret = process.env.SESSION_SECRET;
  if (!secret || secret.length < 32) {
    return NextResponse.json({ error: 'server_not_configured' }, { status: 500 });
  }

  const { username, password } = parsed.data;

  // Look up by username
  const user = await prisma.adminUser.findUnique({ where: { username } });

  let authedUserId: string | null = null;

  if (user) {
    if (verifyPassword(password, user.passwordHash)) {
      authedUserId = user.id;
    }
  } else {
    // No matching user. Two bootstrap paths, only for username 'admin':
    // 1. AdminConfig has a hash (post-Phase-1 install) — verify against it
    // 2. AdminConfig empty — verify against env ADMIN_PASSWORD
    // On success, create the first AdminUser as owner.
    if (username === 'admin') {
      const adminCount = await prisma.adminUser.count();
      if (adminCount === 0) {
        const config = await prisma.adminConfig.findUnique({ where: { id: 0 } });
        let bootstrapOk = false;
        if (config) {
          bootstrapOk = verifyPassword(password, config.passwordHash);
        } else {
          const envPw = process.env.ADMIN_PASSWORD;
          if (envPw) bootstrapOk = passwordMatches(password, envPw);
        }
        if (bootstrapOk) {
          const created = await prisma.adminUser.create({
            data: {
              username: 'admin',
              passwordHash: hashPassword(password),
              isOwner: true,
            },
          });
          authedUserId = created.id;
        }
      }
    }
  }

  if (!authedUserId) {
    await new Promise((r) => setTimeout(r, 1000));
    return NextResponse.json({ error: 'invalid_credentials' }, { status: 401 });
  }

  const token = signSession(secret, authedUserId);
  const res = NextResponse.json({ ok: true });
  res.cookies.set(COOKIE_NAME, token, {
    httpOnly: true,
    sameSite: 'lax',
    path: '/',
    maxAge: DEFAULT_MAX_AGE,
  });
  return res;
}
