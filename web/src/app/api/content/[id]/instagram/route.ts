import { NextResponse } from "next/server";
import { z } from "zod";
import type { ContentPackage } from "@/lib/domain";
import { rejectCrossOrigin, requireDashboardSession } from "@/lib/api-auth";
import { fetchInstagramMedia, isMetaConfigured } from "@/lib/meta";
import { isLiveMode, supabaseRequest } from "@/lib/supabase-rest";

const bodySchema = z.object({
  instagramMediaId: z.string().trim().min(1).max(100),
  instagramPermalink: z.string().url().optional().or(z.literal("")),
  mediaProductType: z.string().trim().max(30).optional().or(z.literal("")),
  postDate: z.string().datetime(),
}).strict();

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  if (!isLiveMode()) return NextResponse.json({ error: "Supabase is not configured." }, { status: 503 });
  const originError = rejectCrossOrigin(request); if (originError) return originError;
  const sessionError = await requireDashboardSession(); if (sessionError) return sessionError;
  const { id } = await params;
  if (!z.string().uuid().safeParse(id).success) return NextResponse.json({ error: "Invalid content ID." }, { status: 400 });
  if (Number(request.headers.get("content-length") || 0) > 8_192) return NextResponse.json({ error: "Request is too large." }, { status: 413 });
  let decoded: unknown;
  try { decoded = await request.json(); } catch { return NextResponse.json({ error: "Invalid JSON." }, { status: 400 }); }
  const parsed = bodySchema.safeParse(decoded);
  if (!parsed.success) return NextResponse.json({ error: "Valid Instagram media details are required." }, { status: 400 });

  try {
    let details = parsed.data;
    if (isMetaConfigured()) {
      const media = await fetchInstagramMedia(parsed.data.instagramMediaId);
      details = {
        instagramMediaId: media.id,
        instagramPermalink: media.permalink || parsed.data.instagramPermalink,
        mediaProductType: media.media_product_type || parsed.data.mediaProductType || media.media_type,
        postDate: media.timestamp ? new Date(media.timestamp).toISOString() : parsed.data.postDate,
      };
    }
    const rows = await supabaseRequest<ContentPackage[]>("rpc/link_content_instagram", {
      method: "POST",
      body: JSON.stringify({
        p_content_id: id,
        p_instagram_media_id: details.instagramMediaId,
        p_permalink: details.instagramPermalink || "",
        p_media_product_type: details.mediaProductType || "",
        p_posted_at: details.postDate,
      }),
    });
    return NextResponse.json({ content: rows[0] });
  } catch (cause) {
    return NextResponse.json({ error: cause instanceof Error ? cause.message : "Instagram link failed." }, { status: 500 });
  }
}
