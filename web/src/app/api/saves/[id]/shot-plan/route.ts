import { NextResponse } from "next/server";
import { z } from "zod";
import { rejectCrossOrigin, requireDashboardSession } from "@/lib/api-auth";
import { assertSourceEligibleForMode } from "@/lib/brand-source-eligibility";
import type { BrandSource, Pairing, SavedPost } from "@/lib/domain";
import { generateShotPlan } from "@/lib/shot-plan";
import { isLiveMode, supabaseRequest } from "@/lib/supabase-rest";

const bodySchema = z.object({ pairingId: z.string().uuid(), mode: z.enum(["Dispatch", "Practical", "Reflection"]), regenerate: z.boolean().optional().default(false) }).strict();

type SourceRow = {
  id: string; source_type: BrandSource["sourceType"]; title: string; core_truth: string; story_evidence: string;
  privacy_status: BrandSource["privacyStatus"]; status: BrandSource["status"]; pillars: string[]; source_url?: string; retired: boolean;
  dispatch_what_happened?: string; dispatch_specific_detail?: string; dispatch_decision?: string; dispatch_occurred_on?: string;
  dispatch_next_implication?: string; dispatch_freshness_days?: number;
};

function toSource(row: SourceRow): BrandSource {
  return { id: row.id, sourceType: row.source_type, title: row.title, coreTruth: row.core_truth, storyEvidence: row.story_evidence, privacyStatus: row.privacy_status, status: row.status, pillars: row.pillars, sourceUrl: row.source_url, retired: row.retired, dispatchWhatHappened: row.dispatch_what_happened, dispatchSpecificDetail: row.dispatch_specific_detail, dispatchDecision: row.dispatch_decision, dispatchOccurredOn: row.dispatch_occurred_on, dispatchNextImplication: row.dispatch_next_implication, dispatchFreshnessDays: row.dispatch_freshness_days };
}

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const sessionError = await requireDashboardSession();
  if (sessionError) return sessionError;
  const originError = rejectCrossOrigin(request);
  if (originError) return originError;
  if (!isLiveMode()) return NextResponse.json({ error: "Supabase is not configured." }, { status: 503 });
  const { id } = await params;
  if (!z.string().uuid().safeParse(id).success) return NextResponse.json({ error: "Invalid save ID." }, { status: 400 });
  const parsed = bodySchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "A pairing and mode are required." }, { status: 400 });

  try {
    const saves = await supabaseRequest<SavedPost[]>(`dashboard_saved_posts?id=eq.${encodeURIComponent(id)}&select=*`);
    const save = saves[0];
    if (!save) return NextResponse.json({ error: "Save not found." }, { status: 404 });
    if (save.collectionPurpose !== "recreate") return NextResponse.json({ error: "Shot plans are available only for Recreate saves." }, { status: 409 });
    if (!save.analysisFrames?.length || !save.analysisTranscript) return NextResponse.json({ error: "This recreate save needs its cached media analysis before a shot plan can be generated." }, { status: 409 });
    const pairing = save.pairings.find((candidate: Pairing) => candidate.id === parsed.data.pairingId);
    if (!pairing?.brandSourceId) return NextResponse.json({ error: "Selected Mario source not found." }, { status: 404 });
    const rows = await supabaseRequest<SourceRow[]>(`brand_sources?id=eq.${encodeURIComponent(pairing.brandSourceId)}&select=*`);
    const source = rows[0] ? toSource(rows[0]) : undefined;
    if (!source) return NextResponse.json({ error: "Mario source not found." }, { status: 404 });
    assertSourceEligibleForMode(source, parsed.data.mode);

    const plan = await generateShotPlan(save, source, parsed.data.mode);
    const stored = await supabaseRequest<Array<Record<string, unknown>>>(`saved_posts?id=eq.${encodeURIComponent(id)}`, {
      method: "PATCH", headers: { Prefer: "return=representation" },
      body: JSON.stringify({ shot_plan_skeleton: null, shot_plan: plan, shot_plan_source_id: source.id, shot_plan_generated_at: new Date().toISOString() }),
    });
    if (!stored[0]) throw new Error("Shot plan could not be stored.");
    return NextResponse.json({ shotPlan: plan, analysisCacheHit: true });
  } catch (cause) {
    const message = cause instanceof Error ? cause.message : "Shot plan generation failed.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
