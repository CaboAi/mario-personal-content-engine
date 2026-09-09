import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { hasCachedAutomaticMediaAnalysis } from "./save-analysis-cache";
import type { SavedPost } from "./domain";

const save = {
  id: "save", author: "creator", shortcode: "post", url: "https://instagram.com/p/post", contentType: "Reel",
  caption: "", savedAt: "2026-09-08", status: "New", frameworkDna: "delivery", hookMechanics: "hook",
  visualPacing: "pace", prohibitedTransfer: [], pairings: [], analysisMethod: "Automatic media inspection" as const,
  analysisTranscript: "creator transcript must not be sent", analysisFrames: [{ label: "opening", dataUrl: "data:image/jpeg;base64,AA==", timestampSeconds: 0, kind: "opening" as const }],
} satisfies SavedPost;

describe("saved-media analysis cache", () => {
  it("recognizes an existing automatic analysis so ingest can skip it", () => {
    expect(hasCachedAutomaticMediaAnalysis(save)).toBe(true);
    expect(hasCachedAutomaticMediaAnalysis({ ...save, analysisFrames: [] })).toBe(false);
    expect(hasCachedAutomaticMediaAnalysis({ ...save, collectionPurpose: "recreate" })).toBe(false);
    expect(hasCachedAutomaticMediaAnalysis({ ...save, collectionPurpose: "recreate", analysisFrameStats: { recreate: true } })).toBe(true);
  });

  it("refreshes directions without media evidence, transcript, or shot-plan inputs", () => {
    const source = readFileSync(new URL("./save-analysis.ts", import.meta.url), "utf8");
    const refreshBody = source.slice(source.indexOf("buildRefreshSaveDirectionsRequest"));
    expect(refreshBody).not.toContain("analysisTranscript");
    expect(refreshBody).not.toContain("analysisFrames");
    expect(refreshBody).not.toContain("shotPlan");
  });
});
