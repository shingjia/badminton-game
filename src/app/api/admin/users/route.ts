import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { conflict, ok, parseJson, requireOwner } from '@/lib/api-helpers';
import { CreateAdminUser } from '@/lib/schemas';
import { hashPassword } from '@/lib/auth';

export async function GET(req: NextRequest) {
  const guard = await requireOwner(req);
  if (guard instanceof NextResponse) return guard;

  const users = await prisma.adminUser.findMany({
    select: { id: true, username: true, isOwner: true, createdAt: true },
    orderBy: [{ isOwner: 'desc' }, { createdAt: 'asc' }],
  });
  return ok(users);
}

export async function POST(req: NextRequest) {
  const guard = await requireOwner(req);
  if (guard instanceof NextResponse) return guard;

  const parsed = await parseJson(req, CreateAdminUser);
  if (!parsed.ok) return parsed.res;

  const existing = await prisma.adminUser.findUnique({
    where: { username: parsed.data.username },
  });
  if (existing) return conflict('username_taken');

  const created = await prisma.adminUser.create({
    data: {
      username: parsed.data.username,
      passwordHash: hashPassword(parsed.data.password),
      isOwner: false,
    },
    select: { id: true, username: true, isOwner: true, createdAt: true },
  });
  return ok(created, 201);
}
