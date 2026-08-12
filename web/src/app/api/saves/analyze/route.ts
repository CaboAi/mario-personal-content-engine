import { NextResponse } from "next/server";
import { z } from "zod";
import type { BrandSource, SavedPost } from "@/lib/domain";
import { analyzeSavedPost } from "@/lib/save-analysis";
import { isLiveMode, supabaseRequest } from "@/lib/supabase-rest";

const MAX_BODY_BYTES = 64 * 1024;
const requestSchema = z.object({
  saveId: z.string().uuid(),
  inspectionNotes: z.string().trim().min(40).max(20_000),
}).strict();

export async function POST(request: Request) {
  if (!isLiveMode()) return NextResponse.json({ error: "Supabase is not configured." }, { status: 503 });
  const origin = request.headers.get("origin");
  if (origin && origin !== new URL(request.url).origin) {
    return NextResponse.json({ error: "Invalid request origin." }, { status: 403 });
  }
  const contentLength = Number(request.headers.get("content-length") || 0);
  if (contentLength > MAX_BODY_BYTES) return NextResponse.json({ error: "Request is too large." }, { status: 413 });
  const raw = await request.text();
  if (new TextEncoder().encode(raw).byteLength > MAX_BODY_BYTES) {
    return NextResponse.json({ error: "Request is too large." }, { status: 413 });
  }
  let decoded: unknown;
  try { decoded = JSON.parse(raw); } catch { return NextResponse.json({ error: "Invalid JSON." }, { status: 400 }); }
  const parsed = requestSchema.safeParse(decoded);
  if (!parsed.success) {
    return NextResponse.json({ error: "Add at least 40 characters of observable notes from the actual post." }, { status: 400 });
  }

  const saves = await supabaseRequest<SavedPost[]>(
    `dashboard_saved_posts?id=eq.${encodeURIComponent(parsed.data.saveId)}&select=*`,
  );
  const save = saves[0];
  if (!save) return NextResponse.json({ error: "Save not found." }, { status: 404 });
  if (save.status === "Used") return NextResponse.json({ error: "This save already has a production item." }, { status: 409 });

  const sourceRows = await supabaseRequest<Array<{
    id: string; source_type: BrandSource["sourceType"]; title: string; core_truth: string;
    story_evidence: string; privacy_status: BrandSource["privacyStatus"]; pillars: string[];
    source_url?: string; status: string;
  }>>("brand_sources?status=eq.Verified&privacy_status=eq.Clear&select=*&order=created_at.desc&limit=50");
  const recommendationRows = await supabaseRequest<Array<{
    brand_source_id: string; recommended: boolean; created_at: string;
  }>>("pairings?select=brand_source_id,recommended,created_at&order=created_at.desc&limit=200");
  const sources: Array<BrandSource & { usageCount: number; recommendationCount: number; recentlyRecommended: boolean }> = sourceRows.map((source) => {
    const history = recommendationRows.filter((pairing) => pairing.brand_source_id === source.id);
    return ({
    id: source.id,
    sourceType: source.source_type,
    title: source.title,
    coreTruth: source.core_truth,
    storyEvidence: source.story_evidence,
    privacyStatus: source.privacy_status,
    pillars: source.pillars,
    sourceUrl: source.source_url,
    usageCount: history.length,
    recommendationCount: history.filter((pairing) => pairing.recommended).length,
    recentlyRecommended: history.some((pairing) => pairing.recommended && Date.now() - new Date(pairing.created_at).getTime() < 14 * 86_400_000),
  });
  });
  if (!sources.length) {
    return NextResponse.json({ error: "No Clear and Verified Mario-owned sources are available." }, { status: 409 });
  }

  try {
    const analysis = await analyzeSavedPost(save, parsed.data.inspectionNotes, sources);
    const rows = await supabaseRequest<SavedPost[]>("rpc/apply_save_analysis", {
      method: "POST",
      body: JSON.stringify({
        p_saved_post_id: save.id,
        p_analysis: analysis,
      }),
    });
    return NextResponse.json({ save: rows[0] });
  } catch (cause) {
    const message = cause instanceof Error ? cause.message : "Analysis failed.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
