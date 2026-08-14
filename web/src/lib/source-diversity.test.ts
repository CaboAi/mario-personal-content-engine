import { describe, expect, it } from "vitest";
import { selectDiversePairings, type PairingCandidate } from "./source-diversity";

function candidate(overrides: Partial<PairingCandidate> & Pick<PairingCandidate, "brandSourceId" | "sourceTitle">): PairingCandidate {
  return {
    title: overrides.sourceTitle,
    sourceType: "Story",
    sourceUrl: undefined,
    rationale: "The structure fits.",
    direction: "Transfer the beat sequence only.",
    coreTruth: "A verified Mario truth.",
    storyEvidence: "Verified evidence.",
    pillars: ["Action"],
    privacyStatus: "Clear",
    fitScore: 80,
    angleCategory: "Lived story",
    usageCount: 0,
    recommendationCount: 0,
    ...overrides,
  };
}

describe("selectDiversePairings", () => {
  it("labels three distinct choices by the job each choice performs", () => {
    const result = selectDiversePairings([
      candidate({ brandSourceId: "1", sourceTitle: "Highest fit", fitScore: 95 }),
      candidate({ brandSourceId: "2", sourceTitle: "Different lens", fitScore: 84, pillars: ["Identity"], angleCategory: "Identity reframe" }),
      candidate({ brandSourceId: "3", sourceTitle: "Wildcard", fitScore: 78, pillars: ["Perspective"], angleCategory: "Perspective shift" }),
    ]);

    expect(result.map((item) => item.selectionRole)).toEqual([
      "Best structural fit",
      "Different Mario lens",
      "Credible wildcard",
    ]);
    expect(result[0].recommended).toBe(true);
  });

  it("never lets novelty rescue a weak structural match", () => {
    const result = selectDiversePairings([
      candidate({ brandSourceId: "1", sourceTitle: "Strong", fitScore: 88 }),
      candidate({ brandSourceId: "2", sourceTitle: "Novel but weak", fitScore: 59, pillars: ["Perspective"], angleCategory: "Perspective shift" }),
    ]);
    expect(result.map((item) => item.sourceTitle)).toEqual(["Strong"]);
  });

  it("deduplicates sources and prefers the strongest version", () => {
    const result = selectDiversePairings([
      candidate({ brandSourceId: "1", sourceTitle: "Same", fitScore: 70 }),
      candidate({ brandSourceId: "1", sourceTitle: "Same", fitScore: 91 }),
    ]);
    expect(result).toHaveLength(1);
    expect(result[0].fitScore).toBe(91);
  });
});
