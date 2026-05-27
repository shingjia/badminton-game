import { NextRequest, NextResponse } from 'next/server';
import { ZodError, ZodSchema } from 'zod';
import type { TournamentStatus } from '@prisma/client';
import { prisma } from '@/lib/prisma';
import { COOKIE_NAME, SessionPayload, verifySession } from '@/lib/auth';

/**
 * Read + verify the session cookie. Returns the payload or null.
 * Use this when a route needs to know *who* is logged in (e.g. password
 * change), in addition to requireAdmin which only gates access.
 */
export function getSession(req: NextRequest): SessionPayload | null {
  const token = req.cookies.get(COOKIE_NAME)?.value;
  const secret = process.env.SESSION_SECRET ?? '';
  return verifySession(token, secret);
}

/** 401 if no valid session; otherwise null. */
export function requireAdmin(req: NextRequest): NextResponse | null {
  if (!getSession(req)) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  }
  return null;
}

/**
 * Returns NextResponse on failure (401 / 403), or {userId, isOwner} on success.
 * Does an extra DB lookup so use this only on routes that require owner rights.
 */
export async function requireOwner(
  req: NextRequest,
): Promise<{ userId: string; isOwner: true } | NextResponse> {
  const session = getSession(req);
  if (!session) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  }
  const user = await prisma.adminUser.findUnique({
    where: { id: session.u },
    select: { id: true, isOwner: true },
  });
  if (!user) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  }
  if (!user.isOwner) {
    return NextResponse.json({ error: 'forbidden' }, { status: 403 });
  }
  return { userId: user.id, isOwner: true };
}

export async function parseJson<T>(req: NextRequest, schema: ZodSchema<T>): Promise<
  { ok: true; data: T } | { ok: false; res: NextResponse }
> {
  let raw: unknown;
  try {
    raw = await req.json();
  } catch {
    return { ok: false, res: NextResponse.json({ error: 'invalid_json' }, { status: 400 }) };
  }
  const parsed = schema.safeParse(raw);
  if (!parsed.success) {
    return { ok: false, res: NextResponse.json({ error: 'invalid_body', details: flatten(parsed.error) }, { status: 400 }) };
  }
  return { ok: true, data: parsed.data };
}

function flatten(err: ZodError) {
  return err.issues.map((i) => ({ path: i.path.join('.'), message: i.message }));
}

export function notFound(message = 'not_found'): NextResponse {
  return NextResponse.json({ error: message }, { status: 404 });
}

export function conflict(message: string): NextResponse {
  return NextResponse.json({ error: message }, { status: 409 });
}

export function ok<T>(data: T, status = 200): NextResponse {
  return NextResponse.json(data, { status });
}

export function ensureStatus(actual: TournamentStatus, allowed: TournamentStatus[]): NextResponse | null {
  if (!allowed.includes(actual)) {
    return NextResponse.json(
      { error: 'invalid_status', message: `current status is ${actual}, expected one of ${allowed.join(',')}` },
      { status: 409 },
    );
  }
  return null;
}
