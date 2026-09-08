import { NextResponse } from "next/server";
import { z } from "zod";
import { rejectCrossOrigin, requireDashboardSession } from "@/lib/api-auth";
import type { BrandSource, ContentPackage, SavedPost } from "@/lib/domain";
import { fullDraftKind, supportsFullDraft } from "@/lib/format-contracts";
import { generateFullScript } from "@/lib/openai";
import { isLiveMode, supabaseRequest } from "@/lib/supabase-rest";

const bodySchema = z.object({ replace: z.boolean().optional().default(false) }).strict();

type ContentReference = {
  id: string;
  brand_source_id: string;
  saved_post_id: string;
  archived_at: string | null;
  status: string;
};

type SourceRow = {
  id: string;
  source_type: BrandSource["sourceType"];
  title: string;
  core_truth: string;
  story_evidence: string;
  privacy_status: "Clear" | "Needs confirmation";
  status: string;
  pillars: string[];
  source_url?: string;
  retired: boolean;
  dispatch_what_happened?: string;
  dispatch_specific_detail?: string;
  dispatch_decision?: string;
  dispatch_occurred_on?: string;
  dispatch_next_implication?: string;
  dispatch_freshness_days?: number;
};

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const sessionError = await requireDashboardSession();
  if (sessionError) return sessionError;
  const originError = rejectCrossOrigin(request);
  if (originError) return originError;
  if (!isLiveMode()) {
    return NextResponse.json({ error: "Supabase is not configured." }, { status: 503 });
  }

  const { id } = await params;
  if (!z.string().uuid().safeParse(id).success) {
    return NextResponse.json({ error: "Invalid content ID." }, { status: 400 });
  }
  const contentLength = Number(request.headers.get("content-length") || 0);
  if (contentLength > 4_096) {
    return NextResponse.json({ error: "Request is too large." }, { status: 413 });
  }
  const parsed = bodySchema.safeParse(await request.json().catch(() => ({})));
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid draft request." }, { status: 400 });
  }

  try {
    const [packages, references] = await Promise.all([
      supabaseRequest<ContentPackage[]>(
        `dashboard_content_items?id=eq.${encodeURIComponent(id)}&select=*`,
      ),
      supabaseRequest<ContentReference[]>(
        `content_items?id=eq.${encodeURIComponent(id)}&select=id,brand_source_id,saved_post_id,archived_at,status`,
      ),
    ]);
    const content = packages[0];
    const reference = references[0];
    if (!content || !reference) {
      return NextResponse.json({ error: "Content item not found." }, { status: 404 });
    }
    const draftKind = fullDraftKind(content.format);
    if (reference.archived_at || reference.status === "Posted") {
      return NextResponse.json(
        { error: `A ${draftKind} can only be generated for the active Production project.` },
        { status: 409 },
      );
    }
    if (!supportsFullDraft(content.format)) {
      return NextResponse.json(
        { error: `${content.format} intentionally does not use a padded full draft.` },
        { status: 409 },
      );
    }
    if (content.fullScript && !parsed.data.replace) {
      return NextResponse.json({ content });
    }

    const [sources, saves] = await Promise.all([
      supabaseRequest<SourceRow[]>(
        `brand_sources?id=eq.${encodeURIComponent(reference.brand_source_id)}&select=*`,
      ),
      supabaseRequest<SavedPost[]>(
        `dashboard_saved_posts?id=eq.${encodeURIComponent(reference.saved_post_id)}&select=*`,
      ),
    ]);
    const source = sources[0];
    const save = saves[0];
    if (!source || !save) {
      return NextResponse.json(
        { error: "The verified Mario source or saved-post influence is unavailable." },
        { status: 409 },
      );
    }

    const generated = await generateFullScript(content, save, {
      id: source.id, sourceType: source.source_type, title: source.title, coreTruth: source.core_truth,
      storyEvidence: source.story_evidence, privacyStatus: source.privacy_status, pillars: source.pillars,
      sourceUrl: source.source_url, retired: source.retired, status: source.status,
      dispatchWhatHappened: source.dispatch_what_happened, dispatchSpecificDetail: source.dispatch_specific_detail,
      dispatchDecision: source.dispatch_decision, dispatchOccurredOn: source.dispatch_occurred_on,
      dispatchNextImplication: source.dispatch_next_implication, dispatchFreshnessDays: source.dispatch_freshness_days,
    });
    const rows = await supabaseRequest<ContentPackage[]>("rpc/save_content_full_script", {
      method: "POST",
      body: JSON.stringify({
        p_content_id: id,
        p_full_script: generated.script,
        p_risk_lines: generated.riskLines,
      }),
    });
    return NextResponse.json({ content: rows[0] });
  } catch (cause) {
    const message = cause instanceof Error ? cause.message : "Draft generation failed.";
    const conflict = /not Clear and Verified|intentionally does not|Active content item/.test(message);
    return NextResponse.json({ error: message }, { status: conflict ? 409 : 500 });
  }
}
