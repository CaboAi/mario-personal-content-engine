import { NextResponse } from "next/server";
import { isLiveMode } from "@/lib/supabase-rest";

export function GET() {
  return NextResponse.json({
    ok: true,
    mode: isLiveMode() ? "live" : "demo",
    generation: Boolean(process.env.OPENAI_API_KEY),
    analytics: Boolean(process.env.META_ACCESS_TOKEN && process.env.META_INSTAGRAM_ACCOUNT_ID),
    publishing: Boolean(process.env.META_ACCESS_TOKEN && process.env.META_INSTAGRAM_ACCOUNT_ID),
  });
}
