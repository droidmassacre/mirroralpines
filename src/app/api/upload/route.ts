import { NextResponse, type NextRequest } from "next/server";
import { cookies } from "next/headers";
import { randomBytes } from "node:crypto";
import { SESSION_COOKIE, verifySession } from "@/lib/auth";
import { getAdminClient } from "@/lib/supabase-admin";
import { extensionForMime, imageExpiresAt, MAX_UPLOAD_BYTES } from "@/lib/images";

export const runtime = "nodejs";

export async function POST(request: NextRequest) {
  const cookieStore = await cookies();
  if (!verifySession(cookieStore.get(SESSION_COOKIE)?.value)) {
    return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  }

  let form: FormData;
  try {
    form = await request.formData();
  } catch {
    return NextResponse.json({ error: "Bad request." }, { status: 400 });
  }

  const file = form.get("file");
  if (!(file instanceof File)) {
    return NextResponse.json({ error: "No file provided." }, { status: 400 });
  }
  if (file.size < 1 || file.size > MAX_UPLOAD_BYTES) {
    return NextResponse.json({ error: "Image is too large." }, { status: 413 });
  }
  const ext = extensionForMime(file.type);
  if (!ext) {
    return NextResponse.json({ error: "Unsupported image type." }, { status: 415 });
  }

  const path = `msgs/${Date.now()}-${randomBytes(6).toString("hex")}.${ext}`;
  const { error } = await getAdminClient().storage
    .from("attachments")
    .upload(path, file, { contentType: file.type, upsert: false, cacheControl: "3600" });

  if (error) {
    return NextResponse.json({ error: "Upload failed." }, { status: 500 });
  }

  return NextResponse.json({ path, expiresAt: imageExpiresAt() });
}
