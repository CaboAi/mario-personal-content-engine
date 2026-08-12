import "server-only";

import { z } from "zod";
import type { BrandSource, SavedPost } from "./domain";
import { parseStructuredJson } from "./openai-response";

const analysisSchema = z.object({
  frameworkDna: z.string().min(1),
  hookMechanics: z.string().min(1),
  visualPacing: z.string().min(1),
  prohibitedTransfer: z.array(z.string().min(1)).min(3).max(8),
  pairings: z
    .array(
      z.object({
        brandSourceId: z.string().uuid(),
        title: z.string().min(1),
        rationale: z.string().min(1),
        direction: z.string().min(1),
      }),
    )
    .max(3),
});

const jsonSchema = {
  type: "object",
  additionalProperties: false,
  required: ["frameworkDna", "hookMechanics", "visualPacing", "prohibitedTransfer", "pairings"],
  properties: {
    frameworkDna: { type: "string" },
    hookMechanics: { type: "string" },
    visualPacing: { type: "string" },
    prohibitedTransfer: { type: "array", minItems: 3, maxItems: 8, items: { type: "string" } },
    pairings: {
      type: "array",
      maxItems: 3,
      items: {
        type: "object",
        additionalProperties: false,
        required: ["brandSourceId", "title", "rationale", "direction"],
        properties: {
          brandSourceId: { type: "string", format: "uuid" },
          title: { type: "string" },
          rationale: { type: "string" },
          direction: { type: "string" },
        },
      },
    },
  },
};

export async function analyzeSavedPost(
  save: SavedPost,
  inspectionNotes: string,
  sources: BrandSource[],
) {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) throw new Error("OPENAI_API_KEY is not configured.");

  const response = await fetch("https://api.openai.com/v1/responses", {
    method: "POST",
    headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      model: process.env.OPENAI_MODEL || "gpt-5-mini",
      instructions:
        "Analyze an Instagram save as delivery reference only. The inspection notes are human-observed evidence from the actual post; do not claim mechanics not present there. Extract hook, structure, pacing, visual treatment, and CTA placement. Explicitly prohibit transfer of creator topic, wording, claims, identity, story, examples, and lesson. Then select no more than three supplied Mario-owned sources whose substance genuinely fits the observed delivery structure. When at least three sources genuinely fit, return exactly three ranked pairings. Never invent Mario facts. Return zero pairings if none fit. Pairing directions must name the exact structural element being transferred, not the creator's substance.",
      input: JSON.stringify({
        save: {
          author: save.author,
          contentType: save.contentType,
          durationSeconds: save.durationSeconds,
          caption: save.caption,
          inspectionNotes,
        },
        marioOwnedSources: sources,
      }),
      text: { format: { type: "json_schema", name: "saved_post_analysis", strict: true, schema: jsonSchema } },
    }),
  });
  if (!response.ok) throw new Error(`OpenAI analysis failed (${response.status}).`);
  const result = await response.json();
  return analysisSchema.parse(parseStructuredJson(result));
}
