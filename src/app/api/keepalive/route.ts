import { NextResponse } from "next/server";
import { getAdminClient } from "@/lib/supabase-admin";
import { serverEnv } from "@/lib/env";

export const runtime = "nodejs";

export async function GET() {
  if (!serverEnv.serviceRoleKey || !serverEnv.supabaseUrl) {
    return NextResponse.json({ ok: false }, { status: 500 });
  }
  try {
    await getAdminClient()
      .from("messages")
      .select("id", { count: "exact", head: true })
      .limit(1);
    return NextResponse.json({ ok: true });
  } catch {
    return NextResponse.json({ ok: false }, { status: 500 });
  }
}
