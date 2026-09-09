import "server-only";

import type { BrandSource, SavedPost } from "./domain";
import { isSourceUsable } from "./brand-source-eligibility";
import { analyzeSavedPost, type SaveInspectionEvidence } from "./save-analysis";
import { supabaseRequest } from "./supabase-rest";

export async function loadRankableBrandSources() {
  const [sourceRows, recommendationRows] = await Promise.all([
    supabaseRequest<Array<{
      id: string;
      source_type: BrandSource["sourceType"];
      title: string;
      core_truth: string;
      story_evidence: string;
      privacy_status: BrandSource["privacyStatus"];
      pillars: string[];
      source_url?: string;
      status: string;
      retired: boolean;
      dispatch_what_happened?: string;
      dispatch_specific_detail?: string;
      dispatch_decision?: string;
      dispatch_occurred_on?: string;
      dispatch_next_implication?: string;
      dispatch_freshness_days?: number;
    }>>("brand_sources?status=eq.Verified&privacy_status=eq.Clear&retired=eq.false&select=*&order=created_at.desc&limit=100"),
    supabaseRequest<Array<{
      brand_source_id: string;
      recommended: boolean;
      created_at: string;
    }>>("pairings?select=brand_source_id,recommended,created_at&order=created_at.desc&limit=500"),
  ]);

  return sourceRows.filter((source) => isSourceUsable({
    sourceType: source.source_type,
    retired: source.retired,
    privacyStatus: source.privacy_status,
    status: source.status as BrandSource["status"],
    dispatchOccurredOn: source.dispatch_occurred_on,
    dispatchFreshnessDays: source.dispatch_freshness_days,
  })).map((source) => {
    const history = recommendationRows.filter((pairing) => pairing.brand_source_id === source.id);
    return {
      id: source.id,
      sourceType: source.source_type,
      title: source.title,
      coreTruth: source.core_truth,
      storyEvidence: source.story_evidence,
      privacyStatus: source.privacy_status,
      status: source.status as BrandSource["status"],
      pillars: source.pillars,
      sourceUrl: source.source_url,
      retired: source.retired,
      dispatchWhatHappened: source.dispatch_what_happened,
      dispatchSpecificDetail: source.dispatch_specific_detail,
      dispatchDecision: source.dispatch_decision,
      dispatchOccurredOn: source.dispatch_occurred_on,
      dispatchNextImplication: source.dispatch_next_implication,
      dispatchFreshnessDays: source.dispatch_freshness_days,
      usageCount: history.length,
      recommendationCount: history.filter((pairing) => pairing.recommended).length,
      recentlyRecommended: history.some(
        (pairing) => pairing.recommended && Date.now() - new Date(pairing.created_at).getTime() < 14 * 86_400_000,
      ),
    };
  });
}

export async function analyzeAndPersistSave(save: SavedPost, evidence: SaveInspectionEvidence) {
  const sources = await loadRankableBrandSources();
  if (!sources.length) {
    throw new Error("No usable Mario-owned sources are available. Capture a verified Story or Daily Entry for Reflection/Practical, or a fresh Dispatch entry for Dispatch.");
  }

  const analysis = await analyzeSavedPost(save, evidence, sources);
  const rows = await supabaseRequest<SavedPost[]>("rpc/apply_save_analysis", {
    method: "POST",
    body: JSON.stringify({
      p_saved_post_id: save.id,
      p_analysis: analysis,
    }),
  });
  return rows[0];
}
