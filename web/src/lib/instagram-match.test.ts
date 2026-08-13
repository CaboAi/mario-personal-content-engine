import { describe, expect, it } from "vitest";
import {
  resolveInstagramMatchSuggestion,
  suggestInstagramContentMatch,
  type InstagramMatchCandidate,
} from "./instagram-match";

const candidates: InstagramMatchCandidate[] = [
  {
    id: "11111111-1111-4111-8111-111111111111",
    title: "Start Before You Are Ready",
    format: "Yap Reel",
    caption: "Waiting for the perfect moment is choosing to stay where you are. Start before confidence arrives.",
    selectedHook: "Waiting for the perfect moment is choosing to stay where you are.",
    selectedOnScreenHook: "START BEFORE YOU'RE READY",
    closingLine: "Imperfect action becomes the new baseline.",
    skeleton: ["Name the waiting", "Explain why action matters"],
  },
  {
    id: "22222222-2222-4222-8222-222222222222",
    title: "Relief Is Not Peace",
    format: "Mini Story",
    caption: "I called the quiet feeling peace, but it was relief from avoiding a hard conversation.",
    selectedHook: "I thought I found peace. I had actually found relief.",
    selectedOnScreenHook: "RELIEF ISN'T PEACE",
    closingLine: "Peace can survive the conversation relief avoids.",
    skeleton: ["Describe the quiet", "Name what avoidance protected"],
  },
];

describe("Instagram content match suggestions", () => {
  it("matches an imported caption to an exact selected spoken hook", () => {
    const match = suggestInstagramContentMatch({
      caption: "Waiting for the perfect moment is choosing to stay where you are. That is the whole trap.",
      mediaProductType: "REELS",
    }, candidates);
    expect(match).toMatchObject({ contentId: candidates[0].id, confidence: 0.99 });
    expect(match?.reason).toMatch(/selected spoken hook/);
  });

  it("does not guess without a caption or with only generic overlap", () => {
    expect(suggestInstagramContentMatch({ caption: null }, candidates)).toBeNull();
    expect(suggestInstagramContentMatch({
      caption: "A new post about life and the work we all have to do.",
    }, candidates)).toBeNull();
  });

  it("never suggests a dismissed or already-linked content item", () => {
    expect(suggestInstagramContentMatch({
      caption: candidates[0].selectedHook,
      dismissedContentId: candidates[0].id,
    }, candidates)).toBeNull();
    expect(suggestInstagramContentMatch({ caption: candidates[0].selectedHook }, [
      { ...candidates[0], instagramMediaId: "17890000000000000" },
    ])).toBeNull();
  });

  it("uses the strongest content evidence rather than candidate order", () => {
    const match = suggestInstagramContentMatch({
      caption: "Relief is not peace. Avoiding the hard conversation only made the quiet temporary.",
      mediaType: "VIDEO",
    }, candidates);
    expect(match?.contentId).toBe(candidates[1].id);
  });

  it("preserves an existing suggestion when Meta returns no usable caption", () => {
    expect(resolveInstagramMatchSuggestion(null, null, {
      suggestedContentId: candidates[0].id,
      matchConfidence: 0.8,
      matchReason: "Existing evidence",
    })).toEqual({
      suggestedContentId: candidates[0].id,
      matchConfidence: 0.8,
      matchReason: "Existing evidence",
    });
  });

  it("clears suggestion metadata when a confirmed link exists", () => {
    expect(resolveInstagramMatchSuggestion(candidates[1].id, {
      contentId: candidates[0].id,
      confidence: 0.9,
      reason: "Stale suggestion",
    }, {
      suggestedContentId: candidates[0].id,
      matchConfidence: 0.9,
      matchReason: "Stale suggestion",
    })).toEqual({ suggestedContentId: null, matchConfidence: null, matchReason: null });
  });
});
