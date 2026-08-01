import { NextResponse } from "next/server";
import { getAdminClient } from "@/lib/supabase-admin";
import { serverEnv } from "@/lib/env";

export const runtime = "nodejs";

export async function GET() {
  if (!serverEnv.serviceRoleKey || !serverEnv.supabaseUrl) {
    return NextResponse.json({ ok: false }, { status: 500 });
  }
  try {
    const admin = getAdminClient();
    await admin
      .from("messages")
      .select("id", { count: "exact", head: true })
      .limit(1);

    const { data: expired, error: listError } = await admin
      .from("messages")
      .select("id, image_path")
      .not("image_path", "is", null)
      .lt("image_expires_at", new Date().toISOString())
      .limit(500);

    if (!listError && expired && expired.length > 0) {
      await admin.storage.from("attachments").remove(
        expired.map((m) => m.image_path).filter((p): p is string => Boolean(p)),
      );
      const ids = expired.map((m) => m.id);
      for (let i = 0; i < ids.length; i += 100) {
        await admin
          .from("messages")
          .update({ image_path: null, image_expires_at: null })
          .in("id", ids.slice(i, i + 100));
      }
    }

    return NextResponse.json({ ok: true });
  } catch {
    return NextResponse.json({ ok: false }, { status: 500 });
  }
}
