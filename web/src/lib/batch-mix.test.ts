import { describe, expect, it } from "vitest";
import { getBatchMix, isLegalBatchMix } from "./batch-mix";

describe("batch content-mode mix", () => {
  it("reports actual and target percentages for every content mode", () => {
    const mix = getBatchMix([
      { mode: "Dispatch" }, { mode: "Dispatch" }, { mode: "Practical" }, { mode: "Reflection" },
    ]);
    expect(mix).toMatchObject({
      legal: true,
      total: 4,
      counts: { Dispatch: 2, Practical: 1, Reflection: 1 },
      targetPercentages: { Dispatch: 60, Practical: 25, Reflection: 15 },
    });
    expect(mix.actualPercentages.Dispatch).toBe(50);
  });

  it("reports a Dispatch floor failure with the actual and required shares", () => {
    const mix = getBatchMix([{ mode: "Dispatch" }, { mode: "Practical" }, { mode: "Practical" }]);
    expect(mix.legal).toBe(false);
    expect(mix.violations).toEqual([expect.objectContaining({
      mode: "Dispatch",
      rule: "minimum",
      actualPercentage: expect.any(Number),
      requiredPercentage: 50,
      message: "Dispatch is 33%, needs at least 50%.",
    })]);
    expect(mix.violations[0].actualPercentage).toBeCloseTo(100 / 3, 8);
  });

  it("reports a Reflection ceiling failure with the actual and required shares", () => {
    const mix = getBatchMix([
      { mode: "Dispatch" }, { mode: "Dispatch" }, { mode: "Reflection" }, { mode: "Reflection" },
    ]);
    expect(mix.legal).toBe(false);
    expect(mix.violations).toEqual([expect.objectContaining({
      mode: "Reflection",
      rule: "maximum",
      actualPercentage: 50,
      requiredPercentage: 100 / 3,
      message: "Reflection is 50%, must be at most 33%.",
    })]);
  });

  it("reports both violations when Dispatch is below the floor and Reflection exceeds the ceiling", () => {
    const mix = getBatchMix([
      { mode: "Dispatch" }, { mode: "Reflection" }, { mode: "Reflection" }, { mode: "Reflection" },
    ]);
    expect(mix.legal).toBe(false);
    expect(mix.violations.map((violation) => violation.mode)).toEqual(["Dispatch", "Reflection"]);
  });

  it("keeps batches of two legal by default", () => {
    const mix = getBatchMix([{ mode: "Reflection" }, { mode: "Reflection" }]);
    expect(isLegalBatchMix([{ mode: "Reflection" }, { mode: "Reflection" }])).toBe(true);
    expect(mix.violations).toEqual([]);
  });
});
