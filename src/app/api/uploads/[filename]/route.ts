import { NextResponse } from 'next/server';
import { readFile, stat } from 'node:fs/promises';
import { contentTypeFor, resolveUploadPath, UploadError } from '@/lib/uploads';

export const runtime = 'nodejs';

type Params = { params: { filename: string } };

export async function GET(_req: Request, { params }: Params) {
  let path: string;
  try {
    path = resolveUploadPath(params.filename);
  } catch (e) {
    if (e instanceof UploadError) {
      return NextResponse.json({ error: e.code }, { status: 400 });
    }
    throw e;
  }

  try {
    await stat(path);
  } catch {
    return NextResponse.json({ error: 'not_found' }, { status: 404 });
  }

  const buf = await readFile(path);
  return new Response(buf, {
    status: 200,
    headers: {
      'Content-Type': contentTypeFor(params.filename),
      'Cache-Control': 'public, max-age=300, must-revalidate',
    },
  });
}
