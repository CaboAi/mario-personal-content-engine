import { describe, expect, it } from "vitest";
import { getBatchMix, isLegalBatchMix } from "./batch-mix";

describe("batch content-mode mix", () => {
  it("reports actual and target percentages for every content mode", () => {
    const mix = getBatchMix([{ mode: "Dispatch" }, { mode: "Practical" }, { mode: "Reflection" }]);
    expect(mix).toMatchObject({
      legal: true,
      total: 3,
      counts: { Dispatch: 1, Practical: 1, Reflection: 1 },
      targetPercentages: { Dispatch: 60, Practical: 25, Reflection: 15 },
    });
    expect(mix.actualPercentages.Dispatch).toBeCloseTo(33.333, 2);
  });

  it("rejects batches of three or more when Reflection exceeds one-third", () => {
    expect(isLegalBatchMix([{ mode: "Dispatch" }, { mode: "Practical" }, { mode: "Reflection" }])).toBe(true);
    expect(isLegalBatchMix([{ mode: "Dispatch" }, { mode: "Reflection" }, { mode: "Reflection" }])).toBe(false);
    expect(isLegalBatchMix([{ mode: "Reflection" }, { mode: "Reflection" }])).toBe(true);
  });

  it("treats legacy packages without a mode as Reflection", () => {
    expect(getBatchMix([{}, {}, { mode: "Dispatch" }]).counts).toEqual({
      Dispatch: 1,
      Practical: 0,
      Reflection: 2,
    });
  });
});
