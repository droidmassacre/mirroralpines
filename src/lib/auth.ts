import { createHmac, timingSafeEqual } from "node:crypto";
import { serverEnv } from "./env";

export const SESSION_COOKIE = "ma_session";
export const SESSION_TTL = 60 * 60 * 24 * 30;

const FAIL_LIMIT = 5;
const FAIL_WINDOW_MS = 10 * 60 * 1000;
const failures = new Map<string, number>();

function toBase64Url(buf: Buffer): string {
  return Buffer.from(buf).toString("base64url");
}

function hmac(data: string): Buffer {
  return createHmac("sha256", serverEnv.secret).update(data).digest();
}

export function signSession(): string {
  const payload = { exp: Math.floor(Date.now() / 1000) + SESSION_TTL };
  const body = toBase64Url(Buffer.from(JSON.stringify(payload)));
  const sig = toBase64Url(hmac(body));
  return `${body}.${sig}`;
}

export function verifySession(token: string | undefined): boolean {
  if (!token) return false;
  const [body, sig] = token.split(".");
  if (!body || !sig) return false;
  try {
    const expected = toBase64Url(hmac(body));
    if (!timingSafeEqual(Buffer.from(sig), Buffer.from(expected))) return false;
    const payload = JSON.parse(Buffer.from(body, "base64url").toString("utf8")) as {
      exp?: number;
    };
    return typeof payload.exp === "number" && payload.exp * 1000 > Date.now();
  } catch {
    return false;
  }
}

export function checkPasscode(input: string): boolean {
  const a = Buffer.from(input);
  const b = Buffer.from(serverEnv.passcode);
  return a.length === b.length && timingSafeEqual(a, b);
}

export function getRoomId(): string {
  return (
    "room-" +
    createHmac("sha256", serverEnv.secret)
      .update("room:" + serverEnv.passcode)
      .digest("hex")
      .slice(0, 24)
  );
}

export function isLocked(key: string): boolean {
  return (failures.get(key) ?? 0) >= FAIL_LIMIT;
}

export function recordFailure(key: string): void {
  failures.set(key, (failures.get(key) ?? 0) + 1);
  setTimeout(() => {
    failures.set(key, Math.max(0, (failures.get(key) ?? 0) - 1));
  }, FAIL_WINDOW_MS);
}
