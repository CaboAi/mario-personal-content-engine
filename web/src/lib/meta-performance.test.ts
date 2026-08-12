import { describe, expect, it } from "vitest";
import { carouselDraftSchema } from "./carousel";
import { parseMediaInsights } from "./meta-insights";
import { analyzePerformanceWindow } from "./performance";

describe("Meta workflow contracts", () => {
  it("parses lifetime insight values and converts watch milliseconds to seconds", () => {
    expect(parseMediaInsights([
      { name: "views", values: [{ value: 100 }] },
      { name: "saved", values: [{ value: 9 }] },
      { name: "ig_reels_avg_watch_time", values: [{ value: 4500 }] },
    ])).toMatchObject({ views: 100, saves: 9, averageWatchSeconds: 4.5 });
  });

  it("does not declare a winner before five comparable windows", () => {
    const analysis = analyzePerformanceWindow(
      { goal: "Reach", testVariable: "Hook" },
      { reach: 120, raw: {} },
      [],
    );
    expect(analysis.signal).toBe("Building baseline");
    expect(analysis.observation).not.toMatch(/winner/i);
  });

  it("compares same-window baselines without promoting a causal learning", () => {
    const comparable = [80, 90, 100, 110, 120].map((reach, index) => ({
      contentId: String(index), capturedAt: "2026-08-12T00:00:00Z", reviewWindowHours: 24, reach,
    }));
    const analysis = analyzePerformanceWindow(
      { goal: "Reach", testVariable: "Hook" },
      { reach: 140, raw: {} },
      comparable,
    );
    expect(analysis.signal).toBe("Above current baseline");
    expect(analysis.observation).toMatch(/not a winner declaration/i);
  });

  it("requires 2-10 public HTTPS JPEG assets with matching alt text", () => {
    expect(carouselDraftSchema.parse({
      assetUrls: ["https://cdn.example.com/1.jpg", "https://cdn.example.com/2.jpeg"],
      altTexts: ["First slide", "Second slide"],
      caption: "Caption",
    }).assetUrls).toHaveLength(2);
    expect(() => carouselDraftSchema.parse({
      assetUrls: ["http://localhost/1.png", "https://cdn.example.com/2.jpg"],
      altTexts: ["First", "Second"], caption: "",
    })).toThrow();
  });
});
