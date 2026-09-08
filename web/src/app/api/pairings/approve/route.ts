import { NextResponse } from "next/server";
import { z } from "zod";
import type { BrandSource, Pairing, SavedPost } from "@/lib/domain";
import { generateContentPackage } from "@/lib/openai";
import { isLiveMode, supabaseRequest } from "@/lib/supabase-rest";

export async function POST(request: Request) {
  if (!isLiveMode()) {
    return NextResponse.json({ error: "Supabase is not configured." }, { status: 503 });
  }
  const origin = request.headers.get("origin");
  if (origin && origin !== new URL(request.url).origin) {
    return NextResponse.json({ error: "Invalid request origin." }, { status: 403 });
  }
  const contentLength = Number(request.headers.get("content-length") || 0);
  if (contentLength > 256 * 1024) {
    return NextResponse.json({ error: "Request is too large." }, { status: 413 });
  }
  const raw = await request.text();
  if (new TextEncoder().encode(raw).byteLength > 256 * 1024) {
    return NextResponse.json({ error: "Request is too large." }, { status: 413 });
  }
  let decoded: unknown;
  try {
    decoded = JSON.parse(raw);
  } catch {
    return NextResponse.json({ error: "Invalid JSON." }, { status: 400 });
  }
  const bodySchema = z.object({
    save: z.object({ id: z.string().uuid() }).passthrough(),
    pairing: z.object({ id: z.string().uuid() }).passthrough(),
    format: z.enum(["Yap Reel", "Mini Story", "POV / Realization", "Carousel", "Written Post", "Long-form"]),
    mode: z.enum(["Dispatch", "Practical", "Reflection"]),
  });
  const parsed = bodySchema.safeParse(decoded);
  if (!parsed.success) {
    return NextResponse.json({ error: "A save and pairing are required." }, { status: 400 });
  }
  const rows = await supabaseRequest<SavedPost[]>(
    `dashboard_saved_posts?id=eq.${encodeURIComponent(parsed.data.save.id)}&select=*`,
  );
  const save = rows[0];
  const pairing = save?.pairings.find((candidate: Pairing) => candidate.id === parsed.data.pairing.id);
  if (!save || !pairing) {
    return NextResponse.json({ error: "Save or pairing not found." }, { status: 404 });
  }
  if (pairing.privacyStatus !== "Clear") {
    return NextResponse.json(
      { error: "This source still requires privacy confirmation." },
      { status: 409 },
    );
  }

  try {
    if (!pairing.brandSourceId) {
      return NextResponse.json({ error: "Pairing has no Mario source." }, { status: 409 });
    }
    const sources = await supabaseRequest<Array<{
      id: string; source_type: BrandSource["sourceType"]; title: string; core_truth: string;
      story_evidence: string; privacy_status: BrandSource["privacyStatus"]; pillars: string[];
      source_url?: string; retired: boolean; dispatch_what_happened?: string;
      dispatch_specific_detail?: string; dispatch_decision?: string; dispatch_occurred_on?: string;
      dispatch_next_implication?: string; dispatch_freshness_days?: number;
    }>>(`brand_sources?id=eq.${encodeURIComponent(pairing.brandSourceId)}&select=*`);
    const row = sources[0];
    if (!row) return NextResponse.json({ error: "Mario source not found." }, { status: 409 });
    const source: BrandSource = {
      id: row.id, sourceType: row.source_type, title: row.title, coreTruth: row.core_truth,
      storyEvidence: row.story_evidence, privacyStatus: row.privacy_status, pillars: row.pillars,
      sourceUrl: row.source_url, retired: row.retired,
      dispatchWhatHappened: row.dispatch_what_happened, dispatchSpecificDetail: row.dispatch_specific_detail,
      dispatchDecision: row.dispatch_decision, dispatchOccurredOn: row.dispatch_occurred_on,
      dispatchNextImplication: row.dispatch_next_implication, dispatchFreshnessDays: row.dispatch_freshness_days,
    };
    const generated = await generateContentPackage(save, pairing, parsed.data.format, parsed.data.mode, source);
    const created = await supabaseRequest<Array<Record<string, unknown>>>(
      "rpc/promote_pairing",
      {
        method: "POST",
        body: JSON.stringify({
          p_pairing_id: pairing.id,
          p_content: {
            ...generated,
            sourceSaveId: save.id,
            sourceTitle: pairing.sourceTitle,
            platforms: ["Instagram"],
          },
        }),
      },
    );
    return NextResponse.json({ content: created[0] });
  } catch (cause) {
    const message = cause instanceof Error ? cause.message : "Generation failed.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
