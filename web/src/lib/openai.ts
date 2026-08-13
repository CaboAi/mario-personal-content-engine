import "server-only";

import type { ContentFormat, ContentPackage, Pairing, SavedPost } from "./domain";
import { CONTENT_PILLARS, contentPackageSchema } from "./content-package-schema";
import { getFormatGenerationInstructions, getFullDraftInstructions, supportsFullDraft } from "./format-contracts";
import { fullScriptSchema } from "./full-script-schema";
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
    skeleton: { type: "array", minItems: 2, items: { type: "string" } },
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
  selectedFormat: ContentFormat,
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
        `You are Mario Polanco's personal content engine. Mario documents reinvention for men rebuilding after failure, loss, and starting over. Use the saved creator only for delivery DNA. Never transfer the creator's topic, wording, claim, story, identity, examples, or lesson. Use only the supplied Mario-owned source. The required output format is ${selectedFormat}; return that exact format and adapt only compatible delivery mechanics from the save. FORMAT CONTRACT: ${getFormatGenerationInstructions(selectedFormat)} Be direct, specific, speakable, and participant-level rather than guru-like. Generate 3-5 spoken hooks and 2-3 on-screen hooks. For non-video formats, spoken hooks are opening-line options and on-screen hooks are cover or first-frame options. The selected spoken and on-screen hooks must exactly match an option in their respective arrays. Use one or two canonical pillars only: Reinvention, Identity, Standards, Action, Responsibility, Self-Respect, Perspective, or Life Story. Choose exactly one test variable and write a falsifiable hypothesis in the form: If [specific change], then [primary metric] should improve because [audience behavior]. Always return cta and caption strings; use an empty string when neither is needed. For Carousel format only, return 2-10 carouselSlides with one screenshot-worthy idea per slide, a repeating visual spine, a payoff, and useful alt text. For every other format, return an empty carouselSlides array. Do not invent facts.`,
      input: JSON.stringify({
        savedDeliveryDna: {
          framework: save.frameworkDna,
          hookMechanics: save.hookMechanics,
          visualPacing: save.visualPacing,
          prohibitedTransfer: save.prohibitedTransfer,
        },
        marioSource: {
          title: pairing.sourceTitle,
          coreTruth: pairing.coreTruth,
          storyEvidence: pairing.storyEvidence,
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
  const generated = contentPackageSchema.parse(parseStructuredJson(result));
  if (generated.format !== selectedFormat) {
    throw new Error(`Generation returned ${generated.format} instead of the selected ${selectedFormat} format.`);
  }
  return generated;
}

const fullScriptJsonSchema = {
  type: "object",
  additionalProperties: false,
  required: ["script", "riskLines"],
  properties: {
    script: { type: "string" },
    riskLines: { type: "array", maxItems: 5, items: { type: "string" } },
  },
};

export async function generateFullScript(
  content: ContentPackage,
  save: SavedPost,
  source: {
    title: string;
    coreTruth: string;
    storyEvidence: string;
    privacyStatus: Pairing["privacyStatus"];
    status: string;
  },
) {
  if (!supportsFullDraft(content.format)) {
    throw new Error(`${content.format} intentionally does not use a padded full script.`);
  }
  if (source.privacyStatus !== "Clear" || source.status !== "Verified") {
    throw new Error("The Mario-owned source is not Clear and Verified.");
  }
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
        `You are writing in Full Script mode for Mario Polanco. ${getFullDraftInstructions(content.format)} Use only the supplied verified Mario-owned source for every topic, claim, story, example, emotion, and lesson. The saved creator contributes delivery mechanics only; never reuse that creator's topic, wording, identity, story, claim, example, or lesson. Begin with the supplied selected opening exactly. Preserve natural roughness, short speakable sentences, direct language, and participant-level uncertainty. Do not add stage directions, fabricated scenes, ages, timelines, metrics, quotations, or outcomes. Use the supplied closing line as the final substantive line. Include an optional CTA only if supplied and natural. Return up to five exact lines from the script in riskLines only when they may sound generic or over-written; otherwise return an empty array.`,
      input: JSON.stringify({
        contentPackage: {
          format: content.format,
          title: content.title,
          goal: content.goal,
          pillars: content.pillars,
          selectedOpening: content.selectedHook,
          onScreenHook: content.selectedOnScreenHook,
          outline: content.skeleton,
          closingLine: content.closingLine,
          cta: content.cta ?? "",
          caption: content.caption ?? "",
        },
        marioSource: source,
        savedDeliveryInfluence: {
          creator: save.author,
          framework: save.frameworkDna,
          hookMechanics: save.hookMechanics,
          visualPacing: save.visualPacing,
          prohibitedTransfer: save.prohibitedTransfer,
        },
      }),
      text: {
        format: {
          type: "json_schema",
          name: "mario_full_script",
          strict: true,
          schema: fullScriptJsonSchema,
        },
      },
    }),
  });

  if (!response.ok) throw new Error(`OpenAI script generation failed (${response.status}).`);
  const generated = fullScriptSchema.parse(parseStructuredJson(await response.json()));
  if (!generated.script.trim().startsWith(content.selectedHook.trim())) {
    throw new Error("Generated script did not preserve the selected opening.");
  }
  return generated;
}
