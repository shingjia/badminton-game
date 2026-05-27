import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { conflict, getSession, ok, parseJson } from '@/lib/api-helpers';
import { ChangePassword } from '@/lib/schemas';
import { hashPassword, verifyPassword } from '@/lib/auth';

export async function POST(req: NextRequest) {
  const session = getSession(req);
  if (!session) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  }

  const parsed = await parseJson(req, ChangePassword);
  if (!parsed.ok) return parsed.res;

  const user = await prisma.adminUser.findUnique({ where: { id: session.u } });
  if (!user) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  }

  if (!verifyPassword(parsed.data.oldPassword, user.passwordHash)) {
    await new Promise((r) => setTimeout(r, 1000));
    return conflict('invalid_old_password');
  }

  await prisma.adminUser.update({
    where: { id: user.id },
    data: { passwordHash: hashPassword(parsed.data.newPassword) },
  });

  return ok({ updated: true });
}
