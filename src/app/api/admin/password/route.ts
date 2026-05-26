import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { conflict, ok, parseJson, requireAdmin } from '@/lib/api-helpers';
import { ChangePassword } from '@/lib/schemas';
import { hashPassword, verifyPassword } from '@/lib/auth';

export async function POST(req: NextRequest) {
  const unauth = requireAdmin(req);
  if (unauth) return unauth;

  const parsed = await parseJson(req, ChangePassword);
  if (!parsed.ok) return parsed.res;

  const config = await prisma.adminConfig.findUnique({ where: { id: 0 } });
  if (!config) {
    return NextResponse.json({ error: 'not_bootstrapped' }, { status: 500 });
  }

  if (!verifyPassword(parsed.data.oldPassword, config.passwordHash)) {
    await new Promise((r) => setTimeout(r, 1000));
    return conflict('invalid_old_password');
  }

  await prisma.adminConfig.update({
    where: { id: 0 },
    data: { passwordHash: hashPassword(parsed.data.newPassword) },
  });

  return ok({ updated: true });
}
