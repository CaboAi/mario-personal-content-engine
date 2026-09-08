import { z } from "zod";
import { CONTENT_PILLARS } from "./content-package-schema";
import { DISPATCH_FRESHNESS_DAYS, isFreshDispatchSource } from "./brand-source-eligibility";

const extractionFields = [
  "title",
  "coreTruth",
  "storyEvidence",
  "pillars",
  "dispatchWhatHappened",
  "dispatchSpecificDetail",
  "dispatchDecision",
  "dispatchOccurredOn",
  "dispatchNextImplication",
] as const;

export const BRAND_SOURCE_EXTRACTION_SYSTEM_PROMPT = `You extract a proposed Mario-owned source record from Mario's raw capture. Extract only. Never invent a fact, number, date, name, client, outcome, or detail that is not present in Mario's raw text.

If a required field cannot be filled from the raw text, return it empty and name what is missing. Do not guess. Every non-empty field must include an exact supporting excerpt from the raw text in fieldEvidence. If there is no exact support, leave that proposed field empty and list it in missingFields.

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

export function assertExtractionGrounded(rawText: string, proposal: BrandSourceExtraction) {
  for (const field of extractionFields) {
    const value = field === "pillars" ? proposal.pillars.join(", ") : proposal[field];
    if (!value.trim()) continue;
    const evidence = proposal.fieldEvidence[field].trim();
    if (!evidence || !rawText.includes(evidence)) {
      throw new Error(`Extraction was stopped because ${field} lacks an exact supporting excerpt from the raw capture.`);
    }
  }
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
