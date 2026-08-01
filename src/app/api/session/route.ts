import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { SESSION_COOKIE, getRoomId, verifySession } from "@/lib/auth";

export const runtime = "nodejs";

export async function GET() {
  const cookieStore = await cookies();
  const token = cookieStore.get(SESSION_COOKIE)?.value;
  if (!verifySession(token)) {
    return NextResponse.json({ authenticated: false }, { status: 401 });
  }
  return NextResponse.json({
    authenticated: true,
    roomId: getRoomId(),
    appName: process.env.NEXT_PUBLIC_APP_NAME ?? "Alpine Notes",
  });
}
