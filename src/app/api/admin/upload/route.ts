import { NextRequest, NextResponse } from 'next/server';
import { ok, requireAdmin } from '@/lib/api-helpers';
import { saveUploadedImage, UploadError } from '@/lib/uploads';

export const runtime = 'nodejs';

export async function POST(req: NextRequest) {
  const unauth = requireAdmin(req);
  if (unauth) return unauth;

  let form: FormData;
  try {
    form = await req.formData();
  } catch {
    return NextResponse.json({ error: 'invalid_form' }, { status: 400 });
  }

  const file = form.get('file');
  if (!(file instanceof File)) {
    return NextResponse.json({ error: 'missing_file' }, { status: 400 });
  }

  try {
    const saved = await saveUploadedImage(file);
    return ok(saved, 201);
  } catch (e) {
    if (e instanceof UploadError) {
      return NextResponse.json({ error: e.code }, { status: 400 });
    }
    throw e;
  }
}
