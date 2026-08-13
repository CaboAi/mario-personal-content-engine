import { describe, expect, it } from "vitest";
import type { ContentFormat } from "./domain";
import {
  fullDraftKind,
  getFormatGenerationInstructions,
  getFullDraftInstructions,
  supportsFullDraft,
} from "./format-contracts";

const formats: ContentFormat[] = [
  "Yap Reel",
  "Mini Story",
  "POV / Realization",
  "Carousel",
  "Written Post",
  "Long-form",
];

describe("format generation contracts", () => {
  it("defines a distinct non-empty generation contract for all six formats", () => {
    const contracts = formats.map(getFormatGenerationInstructions);
    expect(contracts.every((contract) => contract.length > 80)).toBe(true);
    expect(new Set(contracts)).toHaveLength(formats.length);
  });

  it("keeps POV lightweight and carousel slide-based", () => {
    expect(getFormatGenerationInstructions("POV / Realization")).toContain("no padded script");
    expect(getFormatGenerationInstructions("Carousel")).toContain("2-10 slides");
    expect(getFormatGenerationInstructions("Long-form")).toContain("do not insert short-Reel production directions");
  });

  it("offers full drafts only where the format benefits from one", () => {
    expect(supportsFullDraft("Yap Reel")).toBe(true);
    expect(supportsFullDraft("Mini Story")).toBe(true);
    expect(supportsFullDraft("Written Post")).toBe(true);
    expect(supportsFullDraft("Long-form")).toBe(true);
    expect(supportsFullDraft("POV / Realization")).toBe(false);
    expect(supportsFullDraft("Carousel")).toBe(false);
    expect(fullDraftKind("Written Post")).toBe("written draft");
    expect(getFullDraftInstructions("Mini Story")).toContain("scene-first");
  });
});
