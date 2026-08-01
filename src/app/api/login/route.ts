import { NextResponse, type NextRequest } from "next/server";
import { cookies } from "next/headers";
import {
  SESSION_COOKIE,
  SESSION_TTL,
  checkPasscode,
  getRoomId,
  isLocked,
  recordFailure,
  signSession,
} from "@/lib/auth";
import { requireServerEnv } from "@/lib/env";

export const runtime = "nodejs";

export async function POST(request: NextRequest) {
  try {
    requireServerEnv();
  } catch {
    return NextResponse.json({ error: "Server not configured." }, { status: 500 });
  }

  const ip =
    request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "unknown";
  if (isLocked(ip)) {
    return NextResponse.json(
      { error: "Too many attempts. Try again in a few minutes." },
      { status: 429 },
    );
  }

  let body: { code?: unknown } = {};
  try {
    body = await request.json();
  } catch {
    // fall through
  }

  const code = typeof body.code === "string" ? body.code.trim() : "";
  if (!code || code.length > 200) {
    recordFailure(ip);
    return NextResponse.json({ error: "Invalid passcode." }, { status: 401 });
  }

  if (!checkPasscode(code)) {
    recordFailure(ip);
    return NextResponse.json({ error: "Invalid passcode." }, { status: 401 });
  }

  const cookieStore = await cookies();
  cookieStore.set(SESSION_COOKIE, signSession(), {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: SESSION_TTL,
  });

  return NextResponse.json({
    ok: true,
    roomId: getRoomId(),
    appName: process.env.NEXT_PUBLIC_APP_NAME ?? "Alpine Notes",
  });
}
