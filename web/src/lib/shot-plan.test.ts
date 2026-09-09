import { describe, expect, it } from "vitest";
import { assertShotPlanSafe, buildShotPlanScriptRequest, fillUnsupportedBeat, findSharedFiveWordSequences } from "./shot-plan";
import type { BrandSource, ShotPlan, ShotPlanSkeleton } from "./domain";

const source: BrandSource = { id: "source", sourceType: "Story", title: "Source", coreTruth: "A source-backed claim.", storyEvidence: "A concrete source detail.", privacyStatus: "Clear", status: "Verified", pillars: ["Action"], retired: false };
const skeleton: ShotPlanSkeleton = { beats: [{ beatFunction: "hook", startSeconds: 0, durationSeconds: 3, wordCount: 8, sentenceType: "declarative", directAddress: false, shotType: "talking head", framing: "close", onScreenText: false, textPosition: "none" }] };
const plan: ShotPlan = { totalRuntimeSeconds: 30, pacingNote: "Reference cuts every 2.1s.", beats: [{ ...skeleton.beats[0], brief: "Open on Mario's source.", candidateLines: ["A source-backed claim."], draftLine: "A source-backed claim.", onScreenText: null }], productionChecklist: ["[FILL IN — location]"], lineReplacementMap: [{ beatFunction: "hook", marioReplacementLine: "A source-backed claim." }] };

describe("shot plan information barrier", () => {
  it("never includes the creator transcript in the Stage 2 payload", () => {
    const transcript = "creator words must never be present in stage two";
    const request = buildShotPlanScriptRequest(skeleton, source, "Practical", transcript);
    expect(JSON.stringify(request.input)).not.toContain(transcript);
  });

  it("fails creator-topic and five-word transcript leakage", () => {
    expect(() => assertShotPlanSafe({ ...plan, beats: [{ ...plan.beats[0], draftLine: "real estate leads are cold today" }] }, { creatorTopicTerms: ["real estate leads"], analysisTranscript: "" })).toThrow(/reused creator material/);
    expect(findSharedFiveWordSequences("one two three four five six", "one two three four five seven")).toEqual(["one two three four five"]);
  });

  it("uses a visible fill instead of a plausible line when a beat has no source material", () => {
    expect(fillUnsupportedBeat([], "plausible but unsupported", "proof").draftLine).toBe("[FILL IN — Mario source needs material for the proof beat]");
    expect(fillUnsupportedBeat(["a made-up result"], "a made-up result", "proof", source).draftLine).toBe("[FILL IN — Mario source needs material for the proof beat]");
  });
});
