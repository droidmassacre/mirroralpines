import { NextResponse, type NextRequest } from "next/server";
import { cookies } from "next/headers";
import { SESSION_COOKIE, verifySession } from "@/lib/auth";
import { getAdminClient } from "@/lib/supabase-admin";
import { imageExpiresAt, isValidImagePath } from "@/lib/images";

export const runtime = "nodejs";

async function isAuthed(): Promise<boolean> {
  const cookieStore = await cookies();
  return verifySession(cookieStore.get(SESSION_COOKIE)?.value);
}

export async function GET(request: NextRequest) {
  if (!(await isAuthed())) {
    return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  }

  const { searchParams } = request.nextUrl;
  const after = Number(searchParams.get("after") ?? "0");
  const limit = Math.min(Math.max(Number(searchParams.get("limit") ?? "200"), 1), 500);

  const { data, error } = await getAdminClient()
    .from("messages")
    .select("id, sender, body, image_path, image_expires_at, created_at")
    .order("id", { ascending: false })
    .limit(limit)
    .gt("id", after);

  if (error) {
    return NextResponse.json({ error: "Could not load messages." }, { status: 500 });
  }

  const messages = (data ?? []).reverse();
  return NextResponse.json({ messages });
}

export async function POST(request: NextRequest) {
  if (!(await isAuthed())) {
    return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  }

  let body: { body?: unknown; sender?: unknown; imagePath?: unknown } = {};
  try {
    body = await request.json();
  } catch {
    // fall through
  }

  const sender =
    (typeof body.sender === "string" ? body.sender : "").trim().slice(0, 32) ||
    "You";
  const text = (typeof body.body === "string" ? body.body : "").trim().slice(0, 4000);
  const imagePath = typeof body.imagePath === "string" ? body.imagePath : "";

  if (!text && !imagePath) {
    return NextResponse.json({ error: "Message is empty." }, { status: 400 });
  }
  if (imagePath && !isValidImagePath(imagePath)) {
    return NextResponse.json({ error: "Bad image path." }, { status: 400 });
  }

  const insert: Record<string, unknown> = { sender, body: text };
  if (imagePath) {
    insert.image_path = imagePath;
    insert.image_expires_at = imageExpiresAt();
  }

  const { data, error } = await getAdminClient()
    .from("messages")
    .insert(insert)
    .select("id, sender, body, image_path, image_expires_at, created_at")
    .single();

  if (error || !data) {
    return NextResponse.json({ error: "Could not send message." }, { status: 500 });
  }

  return NextResponse.json({ message: data });
}
