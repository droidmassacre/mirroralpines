import { NextResponse, type NextRequest } from "next/server";
import { cookies } from "next/headers";
import {
  SESSION_COOKIE,
  SESSION_TTL,
  checkPasscode,
  getRoomId,
  signSession,
} from "@/lib/auth";
import { requireServerEnv } from "@/lib/env";
import { isValidName } from "@/lib/names";

export const runtime = "nodejs";

export async function POST(request: NextRequest) {
  try {
    requireServerEnv();
  } catch {
    return NextResponse.json({ error: "Server not configured." }, { status: 500 });
  }

  let body: { code?: unknown; name?: unknown } = {};
  try {
    body = await request.json();
  } catch {

  }

  const code = typeof body.code === "string" ? body.code.trim() : "";
  const name = typeof body.name === "string" ? body.name.trim() : "";
  if (
    !code ||
    code.length > 200 ||
    !checkPasscode(code) ||
    !isValidName(name)
  ) {
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
