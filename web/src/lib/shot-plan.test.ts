import { afterEach, describe, expect, it, vi } from "vitest";
import { assertShotPlanSafe, buildShotPlanRequest, fillUnsupportedBeat, findSharedFiveWordSequences, generateShotPlan } from "./shot-plan";
import type { BrandSource, SavedPost, ShotPlan } from "./domain";

const source: BrandSource = {
  id: "source",
  sourceType: "Story",
  title: "Becoming CTO at Skool Skale",
  coreTruth: "The work came before the title.",
  storyEvidence: "Raw capture:\nI built the app before I took the CTO role at Skool Skale.\n\nExtracted evidence:\nMario built the app before taking the CTO role.",
  privacyStatus: "Clear",
  status: "Verified",
  pillars: ["Action"],
  retired: false,
};

const save: SavedPost = {
  id: "save",
  author: "creator",
  shortcode: "recreate",
  url: "https://instagram.com/reel/recreate",
  contentType: "Reel",
  caption: "",
  durationSeconds: 34,
  savedAt: "2026-09-09",
  status: "New",
  frameworkDna: "delivery",
  hookMechanics: "hook",
  visualPacing: "fast",
  prohibitedTransfer: [],
  creatorTopicTerms: ["real estate leads"],
  analysisTranscript: "The creator opens with a question and then shows proof.",
  analysisDurationSeconds: 34,
  analysisCutCount: 4,
  analysisFrames: [{ label: "opening at 0.0s", dataUrl: "data:image/jpeg;base64,AA==", timestampSeconds: 0, kind: "opening" }],
  pairings: [],
};

const plan: ShotPlan = {
  totalRuntimeSeconds: 34,
  pacingNote: "Reference cuts every 6.8s; hold that rhythm.",
  beats: [{
    beatFunction: "hook",
    startSeconds: 0,
    durationSeconds: 4,
    wordCount: 10,
    sentenceType: "declarative",
    directAddress: false,
    brief: "Open on Mario's source.",
    candidateLines: ["I built the app before I took the CTO role."],
    draftLine: "I built the app before I took the CTO role.",
    shotType: "talking head",
    framing: "close",
    onScreenText: null,
  }],
  productionChecklist: ["Record a close talking-head shot."],
  lineReplacementMap: [{
    beatFunction: "hook",
    structuralRole: "Opens with a concrete status shift to create immediate stakes.",
    marioReplacementLine: "I built the app before I took the CTO role.",
  }],
};

describe("single-call shot planning", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.unstubAllEnvs();
  });

  it("sends the transcript, measured mechanics, labeled frames, source, and mode contract together", () => {
    const request = buildShotPlanRequest(save, source, "Reflection");
    const serialized = JSON.stringify(request.input);
    expect(serialized).toContain(save.analysisTranscript);
    expect(serialized).toContain("cutRhythmSeconds");
    expect(serialized).toContain("opening at 0.0s");
    expect(serialized).toContain("I built the app before I took the CTO role at Skool Skale.");
    expect(serialized).toContain("dated claim");
  });

  it("produces filled beats when the Mario source has adequate material", async () => {
    vi.stubEnv("OPENAI_API_KEY", "test-key");
    const modelPlan = {
      beats: [{
        beatFunction: "hook",
        startSeconds: 0,
        durationSeconds: 4,
        wordCount: 10,
        sentenceType: "declarative",
        directAddress: false,
        brief: "Open with the status shift from Mario's source.",
        candidateLines: ["I built the app before I took the CTO role."],
        draftLine: "I built the app before I took the CTO role.",
        shotType: "talking head",
        framing: "close",
        onScreenText: "The work came before the title.",
        textPosition: "top",
      }],
      productionChecklist: ["Record a close talking-head shot."],
      lineReplacementMap: [{
        beatFunction: "hook",
        structuralRole: "Opens with a concrete status shift to create immediate stakes.",
        marioReplacementLine: "I built the app before I took the CTO role.",
      }],
    };
    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify({ output_text: JSON.stringify(modelPlan) }), { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);

    const generated = await generateShotPlan(save, source, "Reflection");

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(generated.beats).toHaveLength(1);
    expect(generated.beats[0].draftLine).not.toContain("[FILL IN");
  });

  it("fails creator-topic and five-word transcript leakage", () => {
    expect(() => assertShotPlanSafe({ ...plan, beats: [{ ...plan.beats[0], draftLine: "real estate leads are cold today" }] }, { creatorTopicTerms: ["real estate leads"], analysisTranscript: "" })).toThrow(/reused creator material/);
    expect(findSharedFiveWordSequences("one two three four five six", "one two three four five seven")).toEqual(["one two three four five"]);
  });

  it("uses a visible fill instead of a plausible line when a beat has no source material", () => {
    expect(fillUnsupportedBeat([], "plausible but unsupported", "proof").draftLine).toBe("[FILL IN — Mario source needs material for the proof beat]");
    expect(fillUnsupportedBeat(["A made-up result"], "A made-up result", "proof", source).draftLine).toBe("[FILL IN — Mario source needs material for the proof beat]");
  });
});
