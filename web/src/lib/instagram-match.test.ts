import { describe, expect, it } from "vitest";
import {
  instagramMediaFamily,
  isInstagramFormatCompatible,
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
      mediaProductType: "REELS",
      dismissedContentId: candidates[0].id,
    }, candidates)).toBeNull();
    expect(suggestInstagramContentMatch({
      caption: candidates[0].selectedHook,
      mediaProductType: "REELS",
    }, [
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

  it.each([
    ["Yap Reel", true],
    ["Mini Story", true],
    ["POV / Realization", true],
    ["Carousel", false],
    ["Written Post", false],
    ["Long-form", false],
  ])("maps Reels/video to %s compatibility=%s", (format, expected) => {
    expect(isInstagramFormatCompatible({ mediaProductType: "REELS", mediaType: "VIDEO" }, format))
      .toBe(expected);
  });

  it.each([
    ["Yap Reel", false],
    ["Mini Story", false],
    ["POV / Realization", false],
    ["Carousel", false],
    ["Written Post", true],
    ["Long-form", true],
  ])("maps a static Instagram IMAGE to %s compatibility=%s", (format, expected) => {
    expect(isInstagramFormatCompatible({ mediaProductType: "FEED", mediaType: "IMAGE" }, format))
      .toBe(expected);
  });

  it.each([
    ["Yap Reel", false],
    ["Mini Story", false],
    ["POV / Realization", false],
    ["Carousel", true],
    ["Written Post", false],
    ["Long-form", false],
  ])("maps a CAROUSEL_ALBUM to %s compatibility=%s", (format, expected) => {
    expect(isInstagramFormatCompatible({ mediaProductType: "FEED", mediaType: "CAROUSEL_ALBUM" }, format))
      .toBe(expected);
  });

  it("lets specific Reels product evidence override a conflicting IMAGE media type", () => {
    const input = { mediaProductType: "REELS", mediaType: "IMAGE" };
    expect(instagramMediaFamily(input)).toBe("video");
    expect(isInstagramFormatCompatible(input, "POV / Realization")).toBe(true);
    expect(isInstagramFormatCompatible(input, "Long-form")).toBe(false);
  });

  it("does not claim compatibility when Meta returns no recognized media family", () => {
    expect(instagramMediaFamily({ mediaProductType: "FEED" })).toBe("unknown");
    expect(isInstagramFormatCompatible({ mediaProductType: "FEED" }, "Written Post")).toBe(false);
  });

  it("rejects a stronger text match when its production format is incompatible", () => {
    const sharedCaption = "Starting over is embarrassing until you realize waiting changes nothing.";
    const match = suggestInstagramContentMatch({
      caption: sharedCaption,
      mediaProductType: "FEED",
      mediaType: "IMAGE",
    }, [
      {
        id: "33333333-3333-4333-8333-333333333333",
        title: "Starting Over",
        format: "POV / Realization",
        caption: sharedCaption,
      },
      {
        id: "44444444-4444-4444-8444-444444444444",
        title: "Starting Over in Writing",
        format: "Written Post",
        selectedHook: "Starting over is embarrassing until waiting changes nothing.",
      },
    ]);
    expect(match?.contentId).toBe("44444444-4444-4444-8444-444444444444");
  });

  it("matches written Long-form only to static IMAGE media", () => {
    const candidate: InstagramMatchCandidate = {
      id: "55555555-5555-4555-8555-555555555555",
      title: "The Long Middle",
      format: "Long-form",
      caption: "Reinvention has a long middle where the old identity no longer fits.",
    };
    expect(suggestInstagramContentMatch({
      caption: candidate.caption,
      mediaType: "IMAGE",
    }, [candidate])?.contentId).toBe(candidate.id);
    expect(suggestInstagramContentMatch({
      caption: candidate.caption,
      mediaProductType: "REELS",
      mediaType: "VIDEO",
    }, [candidate])).toBeNull();
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
