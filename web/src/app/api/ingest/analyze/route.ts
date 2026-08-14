import { NextResponse } from "next/server";
import { z } from "zod";
import type { SavedPost } from "@/lib/domain";
import { analyzeAndPersistSave } from "@/lib/save-analysis-service";
import { secureCompare } from "@/lib/session";
import { isLiveMode, supabaseRequest } from "@/lib/supabase-rest";

const MAX_BODY_BYTES = 4 * 1024 * 1024;
const visualFrameSchema = z.object({
  label: z.string().trim().min(1).max(100),
  data_url: z
    .string()
    .max(625_000)
    .regex(/^data:image\/jpeg;base64,[A-Za-z0-9+/]+={0,2}$/),
}).strict();
const requestSchema = z.object({
  instagram_media_id: z.string().trim().min(1).max(128),
  transcript: z.string().trim().max(40_000).optional().default(""),
  visual_observations: z.string().trim().max(20_000).optional().default(""),
  visual_frames: z.array(visualFrameSchema).max(6).optional().default([]),
  optional_context: z.string().trim().max(2_000).optional().default(""),
  force: z.boolean().optional().default(false),
}).strict().refine(
  (value) => Boolean(value.transcript || value.visual_observations || value.visual_frames.length),
  "Transcript, visual observations, or visual frames are required.",
);

export async function POST(request: Request) {
  const supplied = request.headers.get("x-ingestion-secret");
  const configured = process.env.INGESTION_SECRET;
  if (!configured || !supplied || !(await secureCompare(supplied, configured))) {
    return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  }
  if (!isLiveMode()) {
    return NextResponse.json({ error: "Supabase is not configured." }, { status: 503 });
  }

  const contentLength = Number(request.headers.get("content-length") || 0);
  if (contentLength > MAX_BODY_BYTES) {
    return NextResponse.json({ error: "Request is too large." }, { status: 413 });
  }
  const raw = await request.text();
  if (new TextEncoder().encode(raw).byteLength > MAX_BODY_BYTES) {
    return NextResponse.json({ error: "Request is too large." }, { status: 413 });
  }

  let decoded: unknown;
  try {
    decoded = JSON.parse(raw);
  } catch {
    return NextResponse.json({ error: "Invalid JSON." }, { status: 400 });
  }
  const parsed = requestSchema.safeParse(decoded);
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid automatic-analysis payload." }, { status: 400 });
  }

  const ids = await supabaseRequest<Array<{ id: string }>>(
    `saved_posts?instagram_media_id=eq.${encodeURIComponent(parsed.data.instagram_media_id)}&select=id&limit=1`,
  );
  if (!ids[0]) return NextResponse.json({ error: "Save not found. Ingest it first." }, { status: 404 });

  const saves = await supabaseRequest<SavedPost[]>(
    `dashboard_saved_posts?id=eq.${encodeURIComponent(ids[0].id)}&select=*`,
  );
  const save = saves[0];
  if (!save) return NextResponse.json({ error: "Save not found." }, { status: 404 });
  if (save.status === "Used") {
    return NextResponse.json({ save, skipped: true, reason: "Production item already exists." });
  }
  if (!parsed.data.force && save.analysisMethod === "Automatic media inspection") {
    return NextResponse.json({ save, skipped: true, reason: "Automatic inspection already exists." });
  }

  try {
    const analyzed = await analyzeAndPersistSave(save, {
      transcript: parsed.data.transcript,
      visualObservations: parsed.data.visual_observations,
      visualFrames: parsed.data.visual_frames.map((frame) => ({
        label: frame.label,
        dataUrl: frame.data_url,
      })),
      optionalContext: parsed.data.optional_context,
      method: "Automatic media inspection",
    });
    return NextResponse.json({ save: analyzed, skipped: false });
  } catch (cause) {
    const message = cause instanceof Error ? cause.message : "Automatic analysis failed.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
