import { describe, expect, it } from "vitest";
import { parseMediaInsights } from "./meta-insights";
import { analyzePerformanceWindow, getExperimentMetricRows } from "./performance";

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

  it.each(["Yap Reel", "Mini Story", "POV / Realization"] as const)(
    "uses video experiment metrics for %s",
    (format) => {
      expect(getExperimentMetricRows(format)).toEqual([
        { label: "Views", key: "views" },
        { label: "Reach", key: "reach" },
        { label: "Average watch time", key: "averageWatchSeconds" },
        { label: "Shares", key: "shares" },
        { label: "Saves", key: "saves" },
        { label: "Follows", key: "follows" },
      ]);
    },
  );

  it.each(["Carousel", "Written Post", "Long-form"] as const)(
    "uses static engagement metrics without watch time for %s",
    (format) => {
      const rows = getExperimentMetricRows(format);
      expect(rows).toEqual([
        { label: "Views", key: "views" },
        { label: "Reach", key: "reach" },
        { label: "Likes", key: "likes" },
        { label: "Comments", key: "comments" },
        { label: "Shares", key: "shares" },
        { label: "Saves", key: "saves" },
        { label: "Follows", key: "follows" },
      ]);
      expect(rows.some((row) => row.key === "averageWatchSeconds")).toBe(false);
    },
  );
});
