import { describe, expect, it } from "vitest";
import { validateBrandSourceCapture } from "./brand-source-capture";

const shared = {
  title: "A working title",
  coreTruth: "A core truth.",
  storyEvidence: "The supporting evidence.",
  pillars: ["Action"] as const,
  privacyStatus: "Clear" as const,
  status: "Captured" as const,
};

describe("brand-source capture validation", () => {
  it("accepts Story and Daily Entry sources but never Existing Content", () => {
    expect(validateBrandSourceCapture({ ...shared, sourceType: "Story" }).success).toBe(true);
    expect(validateBrandSourceCapture({ ...shared, sourceType: "Daily Entry" }).success).toBe(true);
    const invalid = validateBrandSourceCapture({ ...shared, sourceType: "Existing Content" });
    expect(invalid.success).toBe(false);
    if (!invalid.success) expect(invalid.fieldErrors.sourceType).toBeTruthy();
  });

  it("requires every Dispatch intake field", () => {
    const invalid = validateBrandSourceCapture({ ...shared, sourceType: "Dispatch" });
    expect(invalid.success).toBe(false);
    if (!invalid.success) {
      expect(invalid.fieldErrors).toMatchObject({
        dispatchWhatHappened: "Required.", dispatchSpecificDetail: "Required.",
        dispatchDecision: "Required.", dispatchOccurredOn: "Required.",
        dispatchNextImplication: "Required.",
      });
    }
  });

  it("rejects a Dispatch that would be born expired", () => {
    const invalid = validateBrandSourceCapture({
      ...shared, sourceType: "Dispatch", dispatchWhatHappened: "A concrete event.",
      dispatchSpecificDetail: "One detail.", dispatchDecision: "A decision.",
      dispatchOccurredOn: "2026-07-01", dispatchNextImplication: "The next update.",
    }, new Date("2026-09-08T00:00:00.000Z"));
    expect(invalid.success).toBe(false);
    if (!invalid.success) expect(invalid.fieldErrors.dispatchOccurredOn).toBe("This Dispatch would be created expired and belongs in the story bank instead.");
  });
});
