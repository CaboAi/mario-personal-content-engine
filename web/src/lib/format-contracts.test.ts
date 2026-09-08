import { describe, expect, it } from "vitest";
import type { ContentFormat, ContentMode } from "./domain";
import {
  fullDraftKind,
  getFormatGenerationInstructions,
  getFullDraftInstructions,
  getLegalFormats,
  initialProductionStatus,
  isProductionStatusForFormat,
  isLegalModeFormat,
  productionStatusesFor,
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
    const contracts = formats.map((format) => getFormatGenerationInstructions(
      format === "Mini Story" ? "Reflection" : "Dispatch",
      format,
    ));
    expect(contracts.every((contract) => contract.length > 80)).toBe(true);
    expect(new Set(contracts)).toHaveLength(formats.length);
  });

  it("keeps POV lightweight and carousel slide-based", () => {
    expect(getFormatGenerationInstructions("Dispatch", "POV / Realization")).toContain("30-45 seconds");
    expect(getFormatGenerationInstructions("Practical", "Carousel")).toContain("2-10 slides");
    expect(getFormatGenerationInstructions("Reflection", "Long-form")).toContain("dated claim");
  });

  it("enforces the legal content-mode and format matrix", () => {
    const expected: Record<ContentMode, ContentFormat[]> = {
      Dispatch: ["Yap Reel", "POV / Realization", "Carousel", "Written Post", "Long-form"],
      Practical: ["Yap Reel", "Carousel", "Written Post", "Long-form"],
      Reflection: ["Yap Reel", "Mini Story", "POV / Realization", "Written Post", "Long-form"],
    };
    for (const [mode, legalFormats] of Object.entries(expected) as Array<[ContentMode, ContentFormat[]]>) {
      expect(getLegalFormats(mode)).toEqual(legalFormats);
      for (const format of formats) expect(isLegalModeFormat(mode, format)).toBe(legalFormats.includes(format));
    }
    expect(() => getFormatGenerationInstructions("Practical", "POV / Realization")).toThrow(
      "Practical mode cannot use POV / Realization",
    );
  });

  it("offers full drafts only where the format benefits from one", () => {
    expect(supportsFullDraft("Yap Reel")).toBe(true);
    expect(supportsFullDraft("Mini Story")).toBe(true);
    expect(supportsFullDraft("Written Post")).toBe(true);
    expect(supportsFullDraft("Long-form")).toBe(true);
    expect(supportsFullDraft("POV / Realization")).toBe(true);
    expect(supportsFullDraft("Carousel")).toBe(false);
    expect(fullDraftKind("Written Post")).toBe("written draft");
    expect(fullDraftKind("Long-form")).toBe("written draft");
    expect(fullDraftKind("Yap Reel")).toBe("script");
    expect(getFullDraftInstructions("Reflection", "Mini Story")).toContain("scene-first");
    expect(getFullDraftInstructions("Dispatch", "POV / Realization")).toContain("brief, complete spoken script");
    expect(getFullDraftInstructions("Dispatch", "POV / Realization")).toContain("do not add a second argument");
    expect(getFullDraftInstructions("Reflection", "Long-form")).toContain("written piece");
    expect(getFullDraftInstructions("Reflection", "Long-form")).not.toContain("speakable");
  });

  it("defines format-specific production workflows and honest initial states", () => {
    expect(initialProductionStatus("Yap Reel")).toBe("Script Ready");
    expect(initialProductionStatus("Mini Story")).toBe("Script Ready");
    expect(initialProductionStatus("POV / Realization")).toBe("Concept Ready");
    expect(initialProductionStatus("Carousel")).toBe("Copy Ready");
    expect(initialProductionStatus("Written Post")).toBe("Outline Ready");
    expect(initialProductionStatus("Long-form")).toBe("Outline Ready");

    expect(productionStatusesFor("Written Post")).toEqual([
      "Outline Ready", "Drafting", "Final Copy", "Scheduled", "Posted",
    ]);
    expect(productionStatusesFor("Long-form")).toEqual(
      productionStatusesFor("Written Post"),
    );
    expect(isProductionStatusForFormat("POV / Realization", "Concept Ready")).toBe(true);
    expect(isProductionStatusForFormat("POV / Realization", "Script Ready")).toBe(false);
    expect(isProductionStatusForFormat("Long-form", "Ready to Record")).toBe(false);
    expect(isProductionStatusForFormat("Carousel", "Scheduled")).toBe(false);

    expect(productionStatusesFor("Yap Reel")).toEqual([
      "Script Ready", "Ready to Record", "Recorded", "Edited", "Scheduled", "Posted",
    ]);
    expect(productionStatusesFor("Mini Story")).toEqual(
      productionStatusesFor("Yap Reel"),
    );
    expect(productionStatusesFor("POV / Realization")).toEqual([
      "Concept Ready", "Ready to Record", "Recorded", "Edited", "Scheduled", "Posted",
    ]);
    expect(productionStatusesFor("Carousel")).toEqual([
      "Copy Ready", "Designing in Canva", "Design Ready", "Posted",
    ]);
  });
});
