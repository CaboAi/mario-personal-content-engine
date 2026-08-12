import { NextResponse } from "next/server";
import { z } from "zod";
import type { Pairing, SavedPost } from "@/lib/domain";
import { generateContentPackage } from "@/lib/openai";
import { isLiveMode, supabaseRequest } from "@/lib/supabase-rest";

export async function POST(request: Request) {
  if (!isLiveMode()) {
    return NextResponse.json({ error: "Supabase is not configured." }, { status: 503 });
  }
  const origin = request.headers.get("origin");
  if (origin && origin !== new URL(request.url).origin) {
    return NextResponse.json({ error: "Invalid request origin." }, { status: 403 });
  }
  const contentLength = Number(request.headers.get("content-length") || 0);
  if (contentLength > 256 * 1024) {
    return NextResponse.json({ error: "Request is too large." }, { status: 413 });
  }
  const raw = await request.text();
  if (new TextEncoder().encode(raw).byteLength > 256 * 1024) {
    return NextResponse.json({ error: "Request is too large." }, { status: 413 });
  }
  let decoded: unknown;
  try {
    decoded = JSON.parse(raw);
  } catch {
    return NextResponse.json({ error: "Invalid JSON." }, { status: 400 });
  }
  const bodySchema = z.object({
    save: z.object({ id: z.string().uuid() }).passthrough(),
    pairing: z.object({ id: z.string().uuid() }).passthrough(),
    format: z.enum(["Yap Reel", "Mini Story", "POV / Realization", "Carousel", "Written Post", "Long-form"]),
  });
  const parsed = bodySchema.safeParse(decoded);
  if (!parsed.success) {
    return NextResponse.json({ error: "A save and pairing are required." }, { status: 400 });
  }
  const rows = await supabaseRequest<SavedPost[]>(
    `dashboard_saved_posts?id=eq.${encodeURIComponent(parsed.data.save.id)}&select=*`,
  );
  const save = rows[0];
  const pairing = save?.pairings.find((candidate: Pairing) => candidate.id === parsed.data.pairing.id);
  if (!save || !pairing) {
    return NextResponse.json({ error: "Save or pairing not found." }, { status: 404 });
  }
  if (pairing.privacyStatus !== "Clear") {
    return NextResponse.json(
      { error: "This source still requires privacy confirmation." },
      { status: 409 },
    );
  }

  try {
    const generated = await generateContentPackage(save, pairing, parsed.data.format);
    const created = await supabaseRequest<Array<Record<string, unknown>>>(
      "rpc/promote_pairing",
      {
        method: "POST",
        body: JSON.stringify({
          p_pairing_id: pairing.id,
          p_content: {
            ...generated,
            sourceSaveId: save.id,
            sourceTitle: pairing.sourceTitle,
            platforms: ["Instagram"],
          },
        }),
      },
    );
    return NextResponse.json({ content: created[0] });
  } catch (cause) {
    const message = cause instanceof Error ? cause.message : "Generation failed.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
