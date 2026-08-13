import { describe, expect, it } from "vitest";
import { fullScriptSchema } from "./full-script-schema";

describe("full script validation", () => {
  it("accepts a substantial script and optional exact risk lines", () => {
    const script = "I kept waiting for confidence to show up first. It never did. The move only became real after I made it while I was still scared.";
    expect(fullScriptSchema.parse({ script, riskLines: ["The move only became real."] }).script).toBe(script);
  });

  it("rejects empty, tiny, or overloaded responses", () => {
    expect(() => fullScriptSchema.parse({ script: "Too short.", riskLines: [] })).toThrow();
    expect(() => fullScriptSchema.parse({ script: "x".repeat(100), riskLines: Array(6).fill("Risk") })).toThrow();
  });
});
