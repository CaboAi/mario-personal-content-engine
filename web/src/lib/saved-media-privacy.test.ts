import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const analysisSource = readFileSync(new URL("./save-analysis.ts", import.meta.url), "utf8");
const ingestRouteSource = readFileSync(
  new URL("../app/api/ingest/analyze/route.ts", import.meta.url),
  "utf8",
);
const persistenceSource = readFileSync(new URL("./save-analysis-service.ts", import.meta.url), "utf8");
const proxySource = readFileSync(new URL("../proxy.ts", import.meta.url), "utf8");
const reanalysisMigration = readFileSync(
  new URL("../../supabase/migrations/0015_reanalysis_pairing_cleanup.sql", import.meta.url),
  "utf8",
);

describe("saved-media privacy contract", () => {
  it("disables Responses application-state storage and uses bounded frame inputs", () => {
    expect(analysisSource).toContain("store: false");
    expect(analysisSource).toContain('type: "input_image"');
    expect(analysisSource).toContain(".slice(0, 20)");
    expect(analysisSource).toContain('frame.kind === "fill" && save.collectionPurpose === "recreate" ? "low" : "high"');
  });

  it("accepts only compact inline JPEG evidence from the authenticated bridge", () => {
    expect(ingestRouteSource).toContain("5 * 1024 * 1024");
    expect(ingestRouteSource).toContain("data:image\\/jpeg;base64");
    expect(ingestRouteSource).toContain("visual_frames: z.array(visualFrameSchema).max(20)");
    expect(proxySource).toContain('pathname.startsWith("/api/ingest/")');
  });

  it("persists sanitized frames and transcript, never raw media files or URLs", () => {
    expect(persistenceSource).toContain("p_analysis: analysis");
    expect(persistenceSource).toContain("analysis_frames");
    expect(persistenceSource).toContain("analysis_transcript");
  });

  it("clears stale selected pairings before assigning new reanalysis ranks", () => {
    expect(reanalysisMigration).toMatch(
      /delete from public\.pairings\s+where saved_post_id = p_saved_post_id;/,
    );
    expect(reanalysisMigration).not.toContain("and selected = false");
  });
});
