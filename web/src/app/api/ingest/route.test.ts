import { beforeEach, describe, expect, it, vi } from "vitest";

const { secureCompare, supabaseRequest } = vi.hoisted(() => ({
  secureCompare: vi.fn(),
  supabaseRequest: vi.fn(),
}));

vi.mock("@/lib/session", () => ({ secureCompare }));
vi.mock("@/lib/supabase-rest", () => ({
  isLiveMode: () => true,
  supabaseRequest,
}));

import { POST } from "./route";

const payload = {
  instagram_media_id: "media-1",
  author: "creator",
  url: "https://www.instagram.com/reel/example/",
  content_type: "Reel",
  collections: [{ id: "collection-1", label: "Recreate", purpose: "recreate" }],
};

describe("POST /api/ingest", () => {
  beforeEach(() => {
    process.env.INGESTION_SECRET = "test-secret";
    secureCompare.mockResolvedValue(true);
    supabaseRequest.mockReset();
  });

  it("returns the underlying persistence failure in its 500 response", async () => {
    supabaseRequest.mockRejectedValue(new Error("Supabase request failed (400): collection_ids is missing."));

    const response = await POST(new Request("https://example.test/api/ingest", {
      method: "POST",
      headers: { "content-type": "application/json", "x-ingestion-secret": "test-secret" },
      body: JSON.stringify(payload),
    }));

    expect(response.status).toBe(500);
    await expect(response.json()).resolves.toEqual({
      error: "Ingestion failed.",
      detail: "Supabase request failed (400): collection_ids is missing.",
    });
  });
});
