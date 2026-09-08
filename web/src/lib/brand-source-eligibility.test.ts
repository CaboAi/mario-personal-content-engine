import { describe, expect, it } from "vitest";
import { assertSourceEligibleForMode, isFreshDispatchSource } from "./brand-source-eligibility";
import type { BrandSource } from "./domain";

const dispatch: BrandSource = {
  id: "dispatch", sourceType: "Dispatch", title: "Dispatch", coreTruth: "Current operating update.",
  storyEvidence: "Current operating update.", privacyStatus: "Clear", pillars: ["Action"], retired: false,
  dispatchWhatHappened: "A concrete event happened.", dispatchSpecificDetail: "One specific detail.",
  dispatchDecision: "Mario made a decision.", dispatchOccurredOn: "2026-09-01",
  dispatchNextImplication: "It changes the next update.", dispatchFreshnessDays: 30,
};

describe("source eligibility", () => {
  it("allows a fresh Dispatch source only for Dispatch", () => {
    expect(isFreshDispatchSource(dispatch, new Date("2026-09-07T00:00:00Z"))).toBe(true);
    expect(() => assertSourceEligibleForMode(dispatch, "Dispatch", new Date("2026-09-07T00:00:00Z"))).not.toThrow();
    expect(() => assertSourceEligibleForMode(dispatch, "Reflection", new Date("2026-09-07T00:00:00Z"))).toThrow("Reflection mode cannot use a Dispatch source");
  });

  it("rejects retired and expired sources", () => {
    expect(() => assertSourceEligibleForMode({ ...dispatch, retired: true }, "Dispatch")).toThrow("retired");
    expect(() => assertSourceEligibleForMode({ ...dispatch, dispatchOccurredOn: "2026-07-01" }, "Dispatch", new Date("2026-09-07T00:00:00Z"))).toThrow("expired");
  });
});
