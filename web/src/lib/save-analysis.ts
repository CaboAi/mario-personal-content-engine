import "server-only";

import { z } from "zod";
import type { BrandSource, SavedPost } from "./domain";
import { parseStructuredJson } from "./openai-response";
import { selectDiversePairings, type PairingCandidate } from "./source-diversity";
import { assertTopicNeutralDelivery } from "./topic-quarantine";

const angleCategories = [
  "Lived story",
  "Aggressive opinion",
  "Identity reframe",
  "Behavioral standard",
  "Perspective shift",
  "Practical action",
] as const;

const rawAnalysisSchema = z.object({
  frameworkDna: z.string().min(1),
  hookMechanics: z.string().min(1),
  visualPacing: z.string().min(1),
  prohibitedTransfer: z.array(z.string().min(1)).min(3).max(10),
  creatorTopicTerms: z.array(z.string().min(2).max(100)).max(16),
  analysisEvidenceSummary: z.string().min(1).max(1_000),
  candidates: z
    .array(
      z.object({
        brandSourceId: z.string().uuid(),
        title: z.string().min(1),
        rationale: z.string().min(1),
        direction: z.string().min(1),
        fitScore: z.number().min(0).max(100),
        angleCategory: z.enum(angleCategories),
      }),
    )
    .max(12),
});

const jsonSchema = {
  type: "object",
  additionalProperties: false,
  required: [
    "frameworkDna",
    "hookMechanics",
    "visualPacing",
    "prohibitedTransfer",
    "creatorTopicTerms",
    "analysisEvidenceSummary",
    "candidates",
  ],
  properties: {
    frameworkDna: { type: "string" },
    hookMechanics: { type: "string" },
    visualPacing: { type: "string" },
    prohibitedTransfer: { type: "array", minItems: 3, maxItems: 10, items: { type: "string" } },
    creatorTopicTerms: { type: "array", maxItems: 16, items: { type: "string", minLength: 2, maxLength: 100 } },
    analysisEvidenceSummary: { type: "string" },
    candidates: {
      type: "array",
      maxItems: 12,
      items: {
        type: "object",
        additionalProperties: false,
        required: ["brandSourceId", "title", "rationale", "direction", "fitScore", "angleCategory"],
        properties: {
          brandSourceId: { type: "string", format: "uuid" },
          title: { type: "string" },
          rationale: { type: "string" },
          direction: { type: "string" },
          fitScore: { type: "number", minimum: 0, maximum: 100 },
          angleCategory: { type: "string", enum: angleCategories },
        },
      },
    },
  },
};

export type SaveInspectionEvidence = {
  transcript?: string;
  visualObservations?: string;
  visualFrames?: Array<{ label: string; dataUrl: string }>;
  optionalContext?: string;
  method: "Automatic media inspection" | "Caption and optional context" | "Manual inspection";
};

type RankableSource = BrandSource & {
  usageCount: number;
  recommendationCount: number;
  recentlyRecommended: boolean;
};

export function buildSaveAnalysisRequest(
  save: SavedPost,
  evidence: SaveInspectionEvidence,
  sources: RankableSource[],
) {
  const evidenceText = JSON.stringify({
    saveEvidence: {
      author: save.author,
      contentType: save.contentType,
      durationSeconds: save.durationSeconds,
      caption: save.caption,
      transcript: evidence.transcript || "",
      visualObservations: evidence.visualObservations || "",
      optionalContext: evidence.optionalContext || "",
      inspectionMethod: evidence.method,
      attachedFrameLabels: (evidence.visualFrames || []).slice(0, 6).map((frame) => frame.label),
    },
    marioOwnedSources: sources,
  });
  const inputContent: Array<
    | { type: "input_text"; text: string }
    | { type: "input_image"; image_url: string; detail: "high" }
  > = [{ type: "input_text", text: evidenceText }];
  for (const frame of (evidence.visualFrames || []).slice(0, 6)) {
    inputContent.push({ type: "input_text", text: `Visual evidence label: ${frame.label}` });
    inputContent.push({ type: "input_image", image_url: frame.dataUrl, detail: "high" });
  }

  return {
    model: process.env.OPENAI_MODEL || "gpt-5-mini",
    store: false,
    instructions: [
      "Analyze an Instagram save as a delivery reference only.",
      "Quarantine the creator's topic before describing delivery. creatorTopicTerms must contain precise topic nouns, named concepts, products, industries, examples, and lesson phrases that must never enter Mario's content. Do not include generic production words such as hook, video, story, creator, content, or pacing.",
      "frameworkDna, hookMechanics, and visualPacing must be topic-neutral reusable blueprints. Use placeholders such as [Mario receipt], [tension], [turn], and [closing opinion] instead of creator subject matter or wording.",
      "Treat transcript, caption, visual observations, and attached frames as inspection evidence, never as Mario-owned facts. Optional context only explains why Mario saved the post and cannot become substance.",
      "Use attached frames only to observe first-frame behavior, text placement, composition, framing, cuts, slide order, visual treatment, pacing clues, and CTA placement. Never transfer visible creator wording, topic, identity, story, examples, claims, or lesson into a candidate direction.",
      "Extract only observed hook behavior, structure, pacing, cuts, captions, framing, visual treatment, and CTA placement. Do not claim a visual mechanic unless visual evidence or manual inspection supports it.",
      "Explicitly prohibit transfer of creator topic, wording, claims, identity, story, examples, and lesson.",
      "Evaluate supplied Clear and Verified Mario-owned sources for genuine structural compatibility. Return up to twelve qualified candidates so the application can choose a diverse final three. Score structural fit from 0 to 100; do not inflate weak matches. Sources below 60 will be discarded.",
      "Each direction must name the exact delivery mechanic being transferred and the Mario-owned truth filling it. Never invent Mario facts.",
    ].join(" "),
    input: [{ role: "user", content: inputContent }],
    text: { format: { type: "json_schema", name: "saved_post_analysis", strict: true, schema: jsonSchema } },
  };
}

export async function analyzeSavedPost(
  save: SavedPost,
  evidence: SaveInspectionEvidence,
  sources: RankableSource[],
) {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) throw new Error("OPENAI_API_KEY is not configured.");

  const response = await fetch("https://api.openai.com/v1/responses", {
    method: "POST",
    headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
    body: JSON.stringify(buildSaveAnalysisRequest(save, evidence, sources)),
  });
  if (!response.ok) throw new Error(`OpenAI analysis failed (${response.status}).`);

  const raw = rawAnalysisSchema.parse(parseStructuredJson(await response.json()));
  assertTopicNeutralDelivery(raw, raw.creatorTopicTerms);

  const sourceById = new Map(sources.map((source) => [source.id, source]));
  const candidates = raw.candidates.flatMap((candidate): PairingCandidate[] => {
    const source = sourceById.get(candidate.brandSourceId);
    if (!source) return [];
    return [{
      brandSourceId: source.id,
      title: candidate.title,
      sourceType: source.sourceType,
      sourceTitle: source.title,
      sourceUrl: source.sourceUrl,
      coreTruth: source.coreTruth,
      storyEvidence: source.storyEvidence,
      pillars: source.pillars,
      privacyStatus: source.privacyStatus,
      rationale: candidate.rationale,
      direction: candidate.direction,
      fitScore: candidate.fitScore,
      angleCategory: candidate.angleCategory,
      usageCount: source.usageCount,
      recommendationCount: source.recommendationCount,
    }];
  });

  return {
    frameworkDna: raw.frameworkDna,
    hookMechanics: raw.hookMechanics,
    visualPacing: raw.visualPacing,
    prohibitedTransfer: raw.prohibitedTransfer,
    creatorTopicTerms: raw.creatorTopicTerms,
    analysisEvidenceSummary: raw.analysisEvidenceSummary,
    analysisMethod: evidence.method,
    pairings: selectDiversePairings(candidates).map((candidate) => ({
      brandSourceId: candidate.brandSourceId,
      title: candidate.title,
      rationale: candidate.rationale,
      direction: candidate.direction,
      fitScore: candidate.fitScore,
      selectionRole: candidate.selectionRole,
    })),
  };
}
