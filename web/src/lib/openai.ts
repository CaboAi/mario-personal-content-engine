import "server-only";

import type { BrandSource, ContentFormat, ContentMode, ContentPackage, Pairing, SavedPost } from "./domain";
import { assertSourceEligibleForMode } from "./brand-source-eligibility";
import { CONTENT_PILLARS, contentPackageSchema } from "./content-package-schema";
import {
  fullDraftKind,
  getFormatGenerationInstructions,
  getFullDraftInstructions,
  isLegalModeFormat,
  supportsFullDraft,
} from "./format-contracts";
import { fullScriptSchema } from "./full-script-schema";
import { parseStructuredJson } from "./openai-response";
import { contentPackageText, findCreatorTopicLeaks } from "./topic-quarantine";

const schema = {
  type: "object",
  additionalProperties: false,
  required: [
    "title",
    "format",
    "mode",
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
    mode: { type: "string", enum: ["Dispatch", "Practical", "Reflection"] },
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
  selectedMode: ContentMode,
  source: BrandSource,
): Promise<Omit<ContentPackage, "id" | "sourceSaveId" | "sourceTitle" | "status" | "platforms" | "createdAt">> {
  if (!isLegalModeFormat(selectedMode, selectedFormat)) {
    throw new Error(`${selectedMode} mode cannot use ${selectedFormat}.`);
  }
  assertSourceEligibleForMode(source, selectedMode);
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) throw new Error("OPENAI_API_KEY is not configured.");

  const quarantinedTerms = save.creatorTopicTerms ?? [];
  for (let attempt = 0; attempt < 2; attempt += 1) {
    const response = await fetch("https://api.openai.com/v1/responses", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: process.env.OPENAI_MODEL || "gpt-5-mini",
        instructions:
          `You are Mario Polanco's personal content engine. Mario is operating and building, writing for men in their 30s rebuilding a career, a body, or a standard. Use the saved creator only for topic-neutral delivery DNA. Never transfer the creator's topic, wording, claim, story, identity, examples, or lesson. The quarantined creator terms are boundary data, not writing material; none may appear in the output: ${quarantinedTerms.join(" | ") || "none supplied"}. Use only the supplied Mario-owned source. The required content mode is ${selectedMode} and the required output format is ${selectedFormat}; return both exact values and adapt only compatible delivery mechanics from the save. FORMAT CONTRACT: ${getFormatGenerationInstructions(selectedMode, selectedFormat)} Be direct, specific, make clear claims and land them without being guru-like, and native to the selected mode and format. Generate 3-5 spoken hooks and 2-3 on-screen hooks. For non-video formats, spoken hooks are opening-line options and on-screen hooks are cover or first-frame options. The selected spoken and on-screen hooks must exactly match an option in their respective arrays. Use one or two canonical pillars only: Reinvention, Identity, Standards, Action, Responsibility, Self-Respect, Perspective, or Life Story. Choose exactly one test variable and write a falsifiable hypothesis in the form: If [specific change], then [primary metric] should improve because [audience behavior]. The closing line must land a result, a decision, or a dated claim. It may not be a principle, a realization, a takeaway, a rhetorical question, or a hedge. Always return cta and caption strings; use an empty string when neither is needed. For Carousel format only, return 2-10 carouselSlides with one screenshot-worthy idea per slide, a repeating visual spine, a payoff, and useful alt text. For every other format, return an empty carouselSlides array. Do not invent facts.${attempt ? " A prior draft crossed the creator-topic boundary; rebuild from the Mario source only." : ""}`,
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
            sourceType: source.sourceType,
            dispatch: source.sourceType === "Dispatch" ? {
              whatHappened: source.dispatchWhatHappened,
              specificDetail: source.dispatchSpecificDetail,
              decision: source.dispatchDecision,
              occurredOn: source.dispatchOccurredOn,
              nextImplication: source.dispatchNextImplication,
            } : undefined,
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

    if (!response.ok) throw new Error(`OpenAI generation failed (${response.status}).`);
    const generated = contentPackageSchema.parse(parseStructuredJson(await response.json()));
    if (generated.format !== selectedFormat) {
      throw new Error(`Generation returned ${generated.format} instead of the selected ${selectedFormat} format.`);
    }
    if (generated.mode !== selectedMode) {
      throw new Error(`Generation returned ${generated.mode} instead of the selected ${selectedMode} mode.`);
    }
    const leaks = findCreatorTopicLeaks(contentPackageText(generated), quarantinedTerms);
    if (!leaks.length) return generated;
    if (attempt === 1) {
      throw new Error(`Generation was stopped because it reused creator-topic material: ${leaks.join(", ")}.`);
    }
  }
  throw new Error("Generation could not clear the creator-topic boundary.");
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
  source: BrandSource & { status: string },
) {
  if (!supportsFullDraft(content.format)) {
    throw new Error(`${content.format} intentionally does not use a padded full draft.`);
  }
  if (source.privacyStatus !== "Clear" || source.status !== "Verified") {
    throw new Error("The Mario-owned source is not Clear and Verified.");
  }
  const draftKind = fullDraftKind(content.format);
  const contentMode = content.mode;
  if (!isLegalModeFormat(contentMode, content.format)) {
    throw new Error(`${contentMode} mode cannot use ${content.format}.`);
  }
  assertSourceEligibleForMode(source, contentMode);
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) throw new Error("OPENAI_API_KEY is not configured.");
  const isWrittenDraft = draftKind === "written draft";

  const response = await fetch("https://api.openai.com/v1/responses", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: process.env.OPENAI_MODEL || "gpt-5-mini",
      instructions:
        `You are writing a complete ${draftKind} for Mario Polanco. ${getFullDraftInstructions(contentMode, content.format)} Use only the supplied verified Mario-owned source for every topic, claim, story, example, emotion, and lesson. The saved creator contributes delivery mechanics only; never reuse that creator's topic, wording, identity, story, claim, example, or lesson. Begin with the supplied selected opening exactly. ${isWrittenDraft ? "Write direct, natural prose that makes and lands claims; do not make it sound like a video transcript." : "Preserve natural roughness, short speakable sentences, direct language, and a resolved point of view."} The closing line must land a result, a decision, or a dated claim. It may not be a principle, a realization, a takeaway, a rhetorical question, or a hedge. Never end on uncertainty or a hedge. The closes 'I'm still figuring it out', 'I still don't know', and 'I'm 34 and still...' are banned. When humility is needed, date the belief instead of disowning it: 'I didn't believe this two years ago' does the same work and still makes a claim. Do not add stage directions, fabricated scenes, ages, timelines, metrics, quotations, or outcomes. Use the supplied closing line as the final substantive line. Include an optional CTA only if supplied and natural. Return up to five exact passages from the ${draftKind} in riskLines only when they may sound generic or over-written; otherwise return an empty array.`,
      input: JSON.stringify({
        contentPackage: {
          format: content.format,
          mode: contentMode,
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

  if (!response.ok) throw new Error(`OpenAI ${draftKind} generation failed (${response.status}).`);
  const generated = fullScriptSchema.parse(parseStructuredJson(await response.json()));
  if (!generated.script.trim().startsWith(content.selectedHook.trim())) {
    throw new Error(`Generated ${draftKind} did not preserve the selected opening.`);
  }
  const leaks = findCreatorTopicLeaks(generated.script, save.creatorTopicTerms ?? []);
  if (leaks.length) {
    throw new Error(`The ${draftKind} was stopped because it reused creator-topic material: ${leaks.join(", ")}.`);
  }
  return generated;
}
