import { NextResponse } from "next/server";
import { rejectCrossOrigin, requireDashboardSession } from "@/lib/api-auth";
import { validateBrandSourceCapture } from "@/lib/brand-source-capture";
import type { BrandSourceInventory } from "@/lib/domain";
import { isLiveMode, supabaseRequest } from "@/lib/supabase-rest";

type SourceSummary = {
  id: string;
  source_type: string;
  title: string;
  privacy_status: string;
  status: string;
  source_external_id: string | null;
};

export async function GET() {
  if (!isLiveMode()) {
    return NextResponse.json({ error: "Supabase is not configured." }, { status: 503 });
  }
  const sources = await supabaseRequest<SourceSummary[]>(
    "brand_sources?select=id,source_type,title,privacy_status,status,source_external_id&order=created_at.asc",
  );
  const usable = sources.filter(
    (source) => source.status === "Verified" && source.privacy_status === "Clear",
  );
  return NextResponse.json({
    total: sources.length,
    usable: usable.length,
    categories: [...new Set(sources.map((source) => source.source_type))],
    sources,
  });
}

type SourceRow = {
  id: string;
  source_type: BrandSourceInventory["sourceType"];
  title: string;
  core_truth: string;
  story_evidence: string;
  privacy_status: BrandSourceInventory["privacyStatus"];
  pillars: string[];
  status: BrandSourceInventory["status"];
  retired: boolean;
  dispatch_what_happened?: string;
  dispatch_specific_detail?: string;
  dispatch_decision?: string;
  dispatch_occurred_on?: string;
  dispatch_next_implication?: string;
  dispatch_freshness_days?: number;
  created_at: string;
  updated_at: string;
};

function toInventorySource(row: SourceRow): BrandSourceInventory {
  return {
    id: row.id, sourceType: row.source_type, title: row.title, coreTruth: row.core_truth,
    storyEvidence: row.story_evidence, privacyStatus: row.privacy_status, pillars: row.pillars,
    status: row.status, retired: row.retired, createdAt: row.created_at, updatedAt: row.updated_at,
    usageCount: 0, dispatchWhatHappened: row.dispatch_what_happened,
    dispatchSpecificDetail: row.dispatch_specific_detail, dispatchDecision: row.dispatch_decision,
    dispatchOccurredOn: row.dispatch_occurred_on, dispatchNextImplication: row.dispatch_next_implication,
    dispatchFreshnessDays: row.dispatch_freshness_days,
  };
}

export async function POST(request: Request) {
  const sessionError = await requireDashboardSession();
  if (sessionError) return sessionError;
  const originError = rejectCrossOrigin(request);
  if (originError) return originError;
  if (!isLiveMode()) return NextResponse.json({ error: "Supabase is not configured." }, { status: 503 });
  if (Number(request.headers.get("content-length") || 0) > 32_768) {
    return NextResponse.json({ error: "Request is too large." }, { status: 413 });
  }

  const validation = validateBrandSourceCapture(await request.json().catch(() => null));
  if (!validation.success) {
    return NextResponse.json({ error: "Review the highlighted fields.", fieldErrors: validation.fieldErrors }, { status: 400 });
  }
  const source = validation.data;
  const rows = await supabaseRequest<SourceRow[]>("brand_sources", {
    method: "POST",
    headers: { Prefer: "return=representation" },
    body: JSON.stringify({
      source_type: source.sourceType,
      title: source.title,
      core_truth: source.coreTruth,
      story_evidence: source.storyEvidence,
      pillars: source.pillars,
      privacy_status: source.privacyStatus,
      status: source.status,
      retired: false,
      ...(source.sourceType === "Dispatch" ? {
        dispatch_what_happened: source.dispatchWhatHappened,
        dispatch_specific_detail: source.dispatchSpecificDetail,
        dispatch_decision: source.dispatchDecision,
        dispatch_occurred_on: source.dispatchOccurredOn,
        dispatch_next_implication: source.dispatchNextImplication,
        dispatch_freshness_days: 30,
      } : {}),
    }),
  });
  return NextResponse.json({ source: toInventorySource(rows[0]) }, { status: 201 });
}
