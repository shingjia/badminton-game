import { mkdir, writeFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { randomBytes } from 'node:crypto';

export const UPLOAD_DIR = process.env.UPLOAD_DIR || '/app/data/uploads';
export const MAX_UPLOAD_BYTES = 1_000_000; // 1 MB

const ALLOWED: Record<string, string> = {
  'image/png': 'png',
  'image/jpeg': 'jpg',
  'image/webp': 'webp',
};

export class UploadError extends Error {
  constructor(public code: string, message?: string) {
    super(message ?? code);
  }
}

export type SavedUpload = { filename: string };

/**
 * Validate + save an image file to disk. Returns the generated filename only
 * (no path); callers serve via /api/uploads/[filename].
 */
export async function saveUploadedImage(file: File): Promise<SavedUpload> {
  if (!ALLOWED[file.type]) {
    throw new UploadError('unsupported_mime', `unsupported: ${file.type}`);
  }
  if (file.size > MAX_UPLOAD_BYTES) {
    throw new UploadError('too_large', `${file.size} > ${MAX_UPLOAD_BYTES}`);
  }

  const ext = ALLOWED[file.type];
  const filename = `${randomBytes(12).toString('hex')}.${ext}`;
  const buf = Buffer.from(await file.arrayBuffer());

  await mkdir(UPLOAD_DIR, { recursive: true });
  await writeFile(join(UPLOAD_DIR, filename), buf);

  return { filename };
}

/**
 * Resolve a stored filename to its absolute path on disk. Throws UploadError
 * with code 'bad_filename' if the filename contains path separators or '..'
 * (defense in depth against path traversal).
 */
export function resolveUploadPath(filename: string): string {
  if (!/^[a-z0-9._-]+$/i.test(filename)) {
    throw new UploadError('bad_filename');
  }
  const full = resolve(join(UPLOAD_DIR, filename));
  const base = resolve(UPLOAD_DIR);
  if (!full.startsWith(base + (base.endsWith('/') ? '' : '/')) && full !== base) {
    throw new UploadError('bad_filename');
  }
  return full;
}

export function contentTypeFor(filename: string): string {
  if (filename.endsWith('.png')) return 'image/png';
  if (filename.endsWith('.jpg') || filename.endsWith('.jpeg')) return 'image/jpeg';
  if (filename.endsWith('.webp')) return 'image/webp';
  return 'application/octet-stream';
}
