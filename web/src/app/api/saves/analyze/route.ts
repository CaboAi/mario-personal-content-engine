import { NextResponse } from "next/server";
import { z } from "zod";
import type { SavedPost } from "@/lib/domain";
import { analyzeAndPersistSave } from "@/lib/save-analysis-service";
import { isLiveMode, supabaseRequest } from "@/lib/supabase-rest";

const MAX_BODY_BYTES = 64 * 1024;
const requestSchema = z.object({
  saveId: z.string().uuid(),
  inspectionNotes: z.string().trim().max(2_000).optional().default(""),
}).strict();

export async function POST(request: Request) {
  if (!isLiveMode()) return NextResponse.json({ error: "Supabase is not configured." }, { status: 503 });
  const origin = request.headers.get("origin");
  if (origin && origin !== new URL(request.url).origin) {
    return NextResponse.json({ error: "Invalid request origin." }, { status: 403 });
  }
  const contentLength = Number(request.headers.get("content-length") || 0);
  if (contentLength > MAX_BODY_BYTES) return NextResponse.json({ error: "Request is too large." }, { status: 413 });
  const raw = await request.text();
  if (new TextEncoder().encode(raw).byteLength > MAX_BODY_BYTES) {
    return NextResponse.json({ error: "Request is too large." }, { status: 413 });
  }
  let decoded: unknown;
  try { decoded = JSON.parse(raw); } catch { return NextResponse.json({ error: "Invalid JSON." }, { status: 400 }); }
  const parsed = requestSchema.safeParse(decoded);
  if (!parsed.success) {
    return NextResponse.json({ error: "Optional context must be 2,000 characters or fewer." }, { status: 400 });
  }

  const saves = await supabaseRequest<SavedPost[]>(
    `dashboard_saved_posts?id=eq.${encodeURIComponent(parsed.data.saveId)}&select=*`,
  );
  const save = saves[0];
  if (!save) return NextResponse.json({ error: "Save not found." }, { status: 404 });
  if (save.status === "Used") return NextResponse.json({ error: "This save already has a production item." }, { status: 409 });

  const canUseCaptionOnly = save.contentType === "Post" && Boolean(save.caption.trim());
  const hasManualFallback = parsed.data.inspectionNotes.length >= 40;
  if (save.status === "New" && !canUseCaptionOnly && !hasManualFallback) {
    return NextResponse.json(
      { error: "This visual post needs the local automatic media inspection. Run the Instagram sync, or add detailed notes only as a fallback." },
      { status: 409 },
    );
  }

  try {
    const analyzed = await analyzeAndPersistSave(save, {
      optionalContext: parsed.data.inspectionNotes,
      visualObservations: hasManualFallback ? parsed.data.inspectionNotes : undefined,
      method: hasManualFallback ? "Manual inspection" : "Caption and optional context",
    });
    return NextResponse.json({ save: analyzed });
  } catch (cause) {
    const message = cause instanceof Error ? cause.message : "Analysis failed.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
