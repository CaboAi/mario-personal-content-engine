import { NextResponse } from "next/server";
import { rejectCrossOrigin, requireDashboardSession } from "@/lib/api-auth";
import type { InstagramMediaItem } from "@/lib/domain";
import { isLiveMode, supabaseRequest } from "@/lib/supabase-rest";

export async function POST(request: Request, { params }: { params: Promise<{ mediaId: string }> }) {
  const sessionError = await requireDashboardSession();
  if (sessionError) return sessionError;
  const originError = rejectCrossOrigin(request);
  if (originError) return originError;
  if (!isLiveMode()) return NextResponse.json({ error: "Supabase is not configured." }, { status: 503 });

  const { mediaId } = await params;
  if (!/^\d{5,40}$/.test(mediaId)) {
    return NextResponse.json({ error: "Invalid Instagram media ID." }, { status: 400 });
  }

  try {
    const rows = await supabaseRequest<InstagramMediaItem[]>("rpc/dismiss_instagram_content_match", {
      method: "POST",
      body: JSON.stringify({ p_instagram_media_id: mediaId }),
    });
    if (!rows.length) return NextResponse.json({ error: "Imported Instagram post not found." }, { status: 404 });
    return NextResponse.json({ media: rows[0] });
  } catch (cause) {
    const message = cause instanceof Error ? cause.message : "Instagram content match dismissal failed.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
