import { z } from "zod";
import { CONTENT_PILLARS } from "./content-package-schema";
import { DISPATCH_FRESHNESS_DAYS, isFreshDispatchSource } from "./brand-source-eligibility";

const strictExtractionFields = [
  "storyEvidence",
  "dispatchWhatHappened",
  "dispatchSpecificDetail",
  "dispatchDecision",
  "dispatchOccurredOn",
  "dispatchNextImplication",
] as const;

const derivedExtractionFields = ["title", "coreTruth", "pillars"] as const;

export const BRAND_SOURCE_EXTRACTION_SYSTEM_PROMPT = `You extract a proposed Mario-owned source record from Mario's raw capture. Extract only. Never invent a fact, number, date, name, client, outcome, or detail that is not present in Mario's raw text.

If a required field cannot be filled from the raw text, return it empty and name what is missing. Do not guess. There are two evidence tiers:

STRICT factual fields: storyEvidence, dispatchWhatHappened, dispatchSpecificDetail, dispatchDecision, dispatchOccurredOn, and dispatchNextImplication. Every non-empty STRICT field must include a supporting excerpt from the raw text in fieldEvidence. Quote the source faithfully; matching ignores capitalization, punctuation, and irregular spacing. If a typo makes a literal quote impossible, return the closest wording and the system will flag it for Mario to confirm. If there is no support, leave that field empty and list it in missingFields.

DERIVED interpretation fields: title, coreTruth, and pillars. These may be conclusions drawn from the raw text and do not need to be verbatim. For every non-empty DERIVED field, fieldEvidence must still name the part of the raw text it was drawn from so Mario can confirm or rewrite the interpretation. Do not use a DERIVED field to introduce a fact not present in the raw text.

Classify as Dispatch only when the event is within the last 30 days AND there is a decision Mario is currently making or has just made. Otherwise classify as Story or Daily Entry. The request includes today's date and any optional date Mario supplied; use them only to make this classification, never to add a date that is absent from the raw text. A Dispatch requires all five Dispatch fields and dispatchOccurredOn; leave any unsupported requirement empty.

storyEvidence must be the concrete specifics from the raw text, not a restatement of the core truth. Return a concise, editable proposal. classificationReason must state why this classification fits the raw text without adding facts.`;

const stringField = z.string();
const fieldEvidenceSchema = z.object({
  title: stringField,
  coreTruth: stringField,
  storyEvidence: stringField,
  pillars: stringField,
  dispatchWhatHappened: stringField,
  dispatchSpecificDetail: stringField,
  dispatchDecision: stringField,
  dispatchOccurredOn: stringField,
  dispatchNextImplication: stringField,
});

export const brandSourceExtractionSchema = z.object({
  sourceType: z.enum(["Story", "Daily Entry", "Dispatch"]),
  classificationReason: z.string(),
  title: stringField,
  coreTruth: stringField,
  storyEvidence: stringField,
  pillars: z.array(z.enum(CONTENT_PILLARS)),
  dispatchWhatHappened: stringField,
  dispatchSpecificDetail: stringField,
  dispatchDecision: stringField,
  dispatchOccurredOn: stringField,
  dispatchNextImplication: stringField,
  missingFields: z.array(z.string()),
  fieldEvidence: fieldEvidenceSchema,
});

export type BrandSourceExtraction = z.infer<typeof brandSourceExtractionSchema>;

function normalizeForEvidenceMatch(value: string) {
  return value
    .toLocaleLowerCase()
    .replace(/[’']/g, "")
    .replace(/[^\p{L}\p{N}\s]/gu, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function orderedTokenOverlap(evidence: string, rawText: string) {
  const evidenceWords = normalizeForEvidenceMatch(evidence).split(" ").filter(Boolean);
  const rawWords = normalizeForEvidenceMatch(rawText).split(" ").filter(Boolean);
  if (evidenceWords.length === 0) return 0;

  let rawIndex = 0;
  let matched = 0;
  for (const word of evidenceWords) {
    let candidateIndex = rawIndex;
    while (candidateIndex < rawWords.length && rawWords[candidateIndex] !== word) candidateIndex += 1;
    if (candidateIndex < rawWords.length) {
      matched += 1;
      rawIndex = candidateIndex + 1;
    }
  }
  return matched / evidenceWords.length;
}

export function assertExtractionGrounded(rawText: string, proposal: BrandSourceExtraction) {
  const normalizedRaw = normalizeForEvidenceMatch(rawText);
  const approximateFields: string[] = [];
  for (const field of strictExtractionFields) {
    const value = proposal[field];
    if (!value.trim()) continue;
    const evidence = proposal.fieldEvidence[field].trim();
    const normalizedEvidence = normalizeForEvidenceMatch(evidence);
    if (normalizedEvidence && normalizedRaw.includes(normalizedEvidence)) continue;
    if (evidence && orderedTokenOverlap(evidence, rawText) >= 0.8) {
      approximateFields.push(field);
      continue;
    }
    throw new Error(`Extraction was stopped because ${field} lacks a supporting excerpt from the raw capture. Claimed excerpt: "${evidence || "(none)"}".`);
  }

  for (const field of derivedExtractionFields) {
    const value = field === "pillars" ? proposal.pillars.join(", ") : proposal[field];
    if (value.trim() && !proposal.fieldEvidence[field].trim()) {
      throw new Error(`Extraction was stopped because ${field} is missing the raw-capture context for Mario to review.`);
    }
  }

  return { approximateFields };
}

export function normalizeExtractedSource(proposal: BrandSourceExtraction, now = new Date()): BrandSourceExtraction {
  if (proposal.sourceType !== "Dispatch" || isFreshDispatchSource({
    sourceType: "Dispatch",
    dispatchOccurredOn: proposal.dispatchOccurredOn,
    dispatchFreshnessDays: DISPATCH_FRESHNESS_DAYS,
  }, now)) return proposal;

  return {
    ...proposal,
    sourceType: "Story",
    classificationReason: "The event is outside the 30-day Dispatch window, so this is a Story.",
    dispatchWhatHappened: "",
    dispatchSpecificDetail: "",
    dispatchDecision: "",
    dispatchOccurredOn: "",
    dispatchNextImplication: "",
  };
}
