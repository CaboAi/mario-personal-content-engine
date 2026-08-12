import { NextResponse } from "next/server";
import { z } from "zod";
import { rejectCrossOrigin, requireDashboardSession } from "@/lib/api-auth";
import type { InstagramMediaItem } from "@/lib/domain";
import { supabaseRequest } from "@/lib/supabase-rest";

const percent = z.number().min(0).max(100).nullable();
const schema = z.object({
  hookRate: percent,
  skipRate: percent,
  followerViewPercentage: percent,
  nonFollowerViewPercentage: percent,
  retentionNotes: z.string().trim().max(5_000),
}).strict();

export async function PATCH(request: Request, { params }: { params: Promise<{ mediaId: string }> }) {
  const sessionError = await requireDashboardSession();
  if (sessionError) return sessionError;
  const originError = rejectCrossOrigin(request);
  if (originError) return originError;
  const parsed = schema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Invalid Edits diagnostic values." }, { status: 400 });
  const { mediaId } = await params;
  if (!/^\d{5,40}$/.test(mediaId)) return NextResponse.json({ error: "Invalid Instagram media ID." }, { status: 400 });

  const now = new Date().toISOString();
  const updated = await supabaseRequest<Array<{ instagram_media_id: string }>>(
    `instagram_media_library?instagram_media_id=eq.${encodeURIComponent(mediaId)}&select=instagram_media_id`,
    {
      method: "PATCH",
      headers: { Prefer: "return=representation" },
      body: JSON.stringify({
        hook_rate: parsed.data.hookRate,
        skip_rate: parsed.data.skipRate,
        follower_view_percentage: parsed.data.followerViewPercentage,
        non_follower_view_percentage: parsed.data.nonFollowerViewPercentage,
        retention_notes: parsed.data.retentionNotes || null,
        edits_updated_at: now,
        updated_at: now,
      }),
    },
  );
  if (!updated.length) return NextResponse.json({ error: "Imported Instagram post not found." }, { status: 404 });
  const rows = await supabaseRequest<InstagramMediaItem[]>(
    `dashboard_instagram_media?instagramMediaId=eq.${encodeURIComponent(mediaId)}&select=*`,
  );
  return NextResponse.json({ media: rows[0] });
}
