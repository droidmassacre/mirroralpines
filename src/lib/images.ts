export const IMAGE_TTL_MS = 24 * 60 * 60 * 1000;
export const MAX_UPLOAD_BYTES = 3.5 * 1024 * 1024;

const EXT_BY_MIME: Record<string, string> = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
  "image/gif": "gif",
  "image/avif": "avif",
};

const IMAGE_PATH_RE = /^msgs\/[A-Za-z0-9_-]+\.(jpe?g|png|gif|webp|avif)$/;

export function extensionForMime(mime: string): string | undefined {
  return EXT_BY_MIME[mime.toLowerCase()];
}

export function isValidImagePath(p: string): boolean {
  return IMAGE_PATH_RE.test(p);
}

export function imageExpiresAt(): string {
  return new Date(Date.now() + IMAGE_TTL_MS).toISOString();
}

export function imageIsExpired(expiresAt: string | null | undefined): boolean {
  if (!expiresAt) return true;
  return new Date(expiresAt).getTime() <= Date.now();
}
