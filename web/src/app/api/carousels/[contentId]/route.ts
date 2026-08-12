import { NextResponse } from "next/server";
import { z } from "zod";
import type { CarouselPublication } from "@/lib/domain";
import { rejectCrossOrigin, requireDashboardSession } from "@/lib/api-auth";
import { carouselDraftSchema } from "@/lib/carousel";
import { isLiveMode, supabaseRequest } from "@/lib/supabase-rest";

export async function PUT(request: Request, { params }: { params: Promise<{ contentId: string }> }) {
  if (!isLiveMode()) return NextResponse.json({ error: "Supabase is not configured." }, { status: 503 });
  const originError = rejectCrossOrigin(request); if (originError) return originError;
  const sessionError = await requireDashboardSession(); if (sessionError) return sessionError;
  const { contentId } = await params;
  if (!z.string().uuid().safeParse(contentId).success) return NextResponse.json({ error: "Invalid content ID." }, { status: 400 });
  if (Number(request.headers.get("content-length") || 0) > 64 * 1024) return NextResponse.json({ error: "Request is too large." }, { status: 413 });
  let decoded: unknown;
  try { decoded = await request.json(); } catch { return NextResponse.json({ error: "Invalid JSON." }, { status: 400 }); }
  const parsed = carouselDraftSchema.safeParse(decoded);
  if (!parsed.success) return NextResponse.json({ error: parsed.error.issues[0]?.message || "Invalid carousel draft." }, { status: 400 });
  try {
    const rows = await supabaseRequest<CarouselPublication[]>("rpc/save_carousel_publication", {
      method: "POST",
      body: JSON.stringify({
        p_content_id: contentId,
        p_asset_urls: parsed.data.assetUrls,
        p_alt_texts: parsed.data.altTexts,
        p_caption: parsed.data.caption,
      }),
    });
    return NextResponse.json({ publication: rows[0] });
  } catch (cause) {
    return NextResponse.json({ error: cause instanceof Error ? cause.message : "Carousel validation failed." }, { status: 500 });
  }
}
