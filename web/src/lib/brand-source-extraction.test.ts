import { describe, expect, it } from "vitest";
import {
  assertExtractionGrounded,
  normalizeExtractedSource,
  type BrandSourceExtraction,
} from "./brand-source-extraction";

function proposal(overrides: Partial<BrandSourceExtraction> = {}): BrandSourceExtraction {
  return {
    sourceType: "Story",
    classificationReason: "The raw text describes a past event.",
    title: "A project update",
    coreTruth: "The project changed",
    storyEvidence: "The project changed",
    pillars: [],
    dispatchWhatHappened: "",
    dispatchSpecificDetail: "",
    dispatchDecision: "",
    dispatchOccurredOn: "",
    dispatchNextImplication: "",
    missingFields: [],
    fieldEvidence: {
      title: "project", coreTruth: "changed", storyEvidence: "project changed", pillars: "",
      dispatchWhatHappened: "", dispatchSpecificDetail: "", dispatchDecision: "",
      dispatchOccurredOn: "", dispatchNextImplication: "",
    },
    ...overrides,
  };
}

describe("brand source extraction safeguards", () => {
  it("allows a derived core truth when the events are present but the lesson is not stated", () => {
    const extracted = proposal({
      coreTruth: "The right role followed the work, not the title.",
      fieldEvidence: { ...proposal().fieldEvidence, coreTruth: "The project changed" },
    });

    expect(() => assertExtractionGrounded("A project changed.", extracted)).not.toThrow();
  });

  it("rejects fabricated factual story evidence without an exact raw-text receipt", () => {
    const extracted = proposal({
      storyEvidence: "A client doubled revenue",
      fieldEvidence: { ...proposal().fieldEvidence, storyEvidence: "doubled revenue" },
    });

    expect(() => assertExtractionGrounded("A project changed.", extracted)).toThrow(/storyEvidence lacks an exact supporting excerpt/);
  });

  it("downgrades an older Dispatch classification to Story", () => {
    const extracted = proposal({
      sourceType: "Dispatch",
      dispatchWhatHappened: "The project changed",
      dispatchSpecificDetail: "project",
      dispatchDecision: "changed",
      dispatchOccurredOn: "2026-07-01",
      dispatchNextImplication: "project",
    });

    const normalized = normalizeExtractedSource(extracted, new Date("2026-09-08T00:00:00.000Z"));
    expect(normalized.sourceType).toBe("Story");
    expect(normalized.classificationReason).toMatch(/outside the 30-day Dispatch window/);
  });
});
