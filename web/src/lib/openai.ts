import "server-only";

import type { ContentPackage, Pairing, SavedPost } from "./domain";
import { CONTENT_PILLARS, contentPackageSchema } from "./content-package-schema";
import { parseStructuredJson } from "./openai-response";

const schema = {
  type: "object",
  additionalProperties: false,
  required: [
    "title",
    "format",
    "goal",
    "pillars",
    "spokenHooks",
    "onScreenHooks",
    "selectedHook",
    "selectedOnScreenHook",
    "testVariable",
    "hypothesis",
    "skeleton",
    "closingLine",
    "cta",
    "caption",
    "carouselSlides",
  ],
  properties: {
    title: { type: "string" },
    format: {
      type: "string",
      enum: ["Yap Reel", "Mini Story", "POV / Realization", "Carousel", "Written Post", "Long-form"],
    },
    goal: { type: "string", enum: ["Reach", "Shares", "Saves", "Follows", "Trust"] },
    pillars: {
      type: "array",
      minItems: 1,
      maxItems: 2,
      items: { type: "string", enum: CONTENT_PILLARS },
    },
    spokenHooks: { type: "array", minItems: 3, maxItems: 5, items: { type: "string" } },
    onScreenHooks: { type: "array", minItems: 2, maxItems: 3, items: { type: "string" } },
    selectedHook: { type: "string" },
    selectedOnScreenHook: { type: "string" },
    testVariable: {
      type: "string",
      enum: ["Hook", "Topic", "Length", "Format", "CTA", "Visual", "None"],
    },
    hypothesis: { type: "string" },
    skeleton: { type: "array", minItems: 4, items: { type: "string" } },
    closingLine: { type: "string" },
    cta: { type: "string" },
    caption: { type: "string" },
    carouselSlides: {
      type: "array",
      maxItems: 10,
      items: {
        type: "object",
        additionalProperties: false,
        required: ["headline", "body", "altText"],
        properties: {
          headline: { type: "string" },
          body: { type: "string" },
          altText: { type: "string" },
        },
      },
    },
  },
};

export async function generateContentPackage(
  save: SavedPost,
  pairing: Pairing,
): Promise<Omit<ContentPackage, "id" | "sourceSaveId" | "sourceTitle" | "status" | "platforms" | "createdAt">> {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) throw new Error("OPENAI_API_KEY is not configured.");

  const response = await fetch("https://api.openai.com/v1/responses", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: process.env.OPENAI_MODEL || "gpt-5-mini",
      instructions:
        "You are Mario Polanco's personal content engine. Mario documents reinvention for men rebuilding after failure, loss, and starting over. Use the saved creator only for delivery DNA. Never transfer the creator's topic, wording, claim, story, identity, examples, or lesson. Use only the supplied Mario-owned source. Be direct, specific, speakable, and participant-level rather than guru-like. Generate 3-5 spoken hooks and 2-3 on-screen hooks. The selected spoken and on-screen hooks must exactly match an option in their respective arrays. Use one or two canonical pillars only: Reinvention, Identity, Standards, Action, Responsibility, Self-Respect, Perspective, or Life Story. Choose exactly one test variable and write a falsifiable hypothesis in the form: If [specific change], then [primary metric] should improve because [audience behavior]. Build a talking skeleton, not a polished full script. Always return cta and caption strings; use an empty string when neither is needed. For Carousel format only, return 2-10 carouselSlides with one screenshot-worthy idea per slide, a repeating visual spine, a payoff, and useful alt text. For every other format, return an empty carouselSlides array. Do not invent facts.",
      input: JSON.stringify({
        savedDeliveryDna: {
          framework: save.frameworkDna,
          hookMechanics: save.hookMechanics,
          visualPacing: save.visualPacing,
          prohibitedTransfer: save.prohibitedTransfer,
        },
        marioSource: {
          title: pairing.sourceTitle,
          rationale: pairing.rationale,
          direction: pairing.direction,
          privacyStatus: pairing.privacyStatus,
        },
      }),
      text: {
        format: {
          type: "json_schema",
          name: "mario_content_package",
          strict: true,
          schema,
        },
      },
    }),
  });

  if (!response.ok) {
    throw new Error(`OpenAI generation failed (${response.status}).`);
  }

  const result = await response.json();
  return contentPackageSchema.parse(parseStructuredJson(result));
}
