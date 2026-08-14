import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const analysisSource = readFileSync(new URL("./save-analysis.ts", import.meta.url), "utf8");
const ingestRouteSource = readFileSync(
  new URL("../app/api/ingest/analyze/route.ts", import.meta.url),
  "utf8",
);
const persistenceSource = readFileSync(new URL("./save-analysis-service.ts", import.meta.url), "utf8");
const proxySource = readFileSync(new URL("../proxy.ts", import.meta.url), "utf8");

describe("saved-media privacy contract", () => {
  it("disables Responses application-state storage and uses bounded frame inputs", () => {
    expect(analysisSource).toContain("store: false");
    expect(analysisSource).toContain('type: "input_image"');
    expect(analysisSource).toContain(".slice(0, 6)");
  });

  it("accepts only compact inline JPEG evidence from the authenticated bridge", () => {
    expect(ingestRouteSource).toContain("4 * 1024 * 1024");
    expect(ingestRouteSource).toContain("data:image\\/jpeg;base64");
    expect(ingestRouteSource).toContain("visual_frames: z.array(visualFrameSchema).max(6)");
    expect(proxySource).toContain('pathname.startsWith("/api/ingest/")');
  });

  it("persists the sanitized analysis result instead of raw inspection evidence", () => {
    expect(persistenceSource).toContain("p_analysis: analysis");
    expect(persistenceSource).not.toContain("visualFrames");
    expect(persistenceSource).not.toContain("transcript:");
  });
});
