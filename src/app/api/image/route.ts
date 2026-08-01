import { NextResponse, type NextRequest } from "next/server";
import { cookies } from "next/headers";
import { SESSION_COOKIE, verifySession } from "@/lib/auth";
import { getAdminClient } from "@/lib/supabase-admin";
import { imageIsExpired, isValidImagePath } from "@/lib/images";

export const runtime = "nodejs";

export async function GET(request: NextRequest) {
  const cookieStore = await cookies();
  if (!verifySession(cookieStore.get(SESSION_COOKIE)?.value)) {
    return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  }

  const id = Number(request.nextUrl.searchParams.get("id") ?? "0");
  const path = request.nextUrl.searchParams.get("path") ?? "";
  if (!Number.isInteger(id) || id < 1 || !isValidImagePath(path)) {
    return NextResponse.json({ error: "Not found." }, { status: 404 });
  }

  const { data: message, error } = await getAdminClient()
    .from("messages")
    .select("id, image_path, image_expires_at")
    .eq("id", id)
    .maybeSingle();

  if (
    error ||
    !message ||
    message.image_path !== path ||
    imageIsExpired(message.image_expires_at)
  ) {
    return NextResponse.json({ error: "Not found." }, { status: 404 });
  }

  const { data, error: signError } = await getAdminClient()
    .storage.from("attachments")
    .createSignedUrl(path, 3600);

  if (signError || !data?.signedUrl) {
    return NextResponse.json({ error: "Not found." }, { status: 404 });
  }

  return NextResponse.redirect(data.signedUrl);
}
