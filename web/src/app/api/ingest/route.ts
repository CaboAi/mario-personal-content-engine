import { NextResponse } from "next/server";
import { z } from "zod";
import { secureCompare } from "@/lib/session";
import { isLiveMode, supabaseRequest } from "@/lib/supabase-rest";

const MAX_BODY_BYTES = 64 * 1024;
const ingestSchema = z
  .object({
    instagram_media_id: z.string().trim().min(1).max(128),
    shortcode: z.string().trim().max(64).optional().default(""),
    author: z.string().trim().min(1).max(128),
    url: z
      .string()
      .url()
      .max(2_048)
      .refine((value) => {
        const parsed = new URL(value);
        return (
          parsed.protocol === "https:" &&
          (parsed.hostname === "instagram.com" || parsed.hostname.endsWith(".instagram.com"))
        );
      }, "URL must be an HTTPS Instagram URL."),
    content_type: z.enum(["Reel", "Carousel", "Post", "IGTV"]),
    caption: z.string().max(20_000).optional().default(""),
    duration_seconds: z.number().finite().nonnegative().max(86_400).nullable().optional(),
    saved_at: z.string().datetime({ offset: true }).optional(),
    collections: z.array(z.object({
      id: z.string().trim().min(1).max(128),
      label: z.string().trim().min(1).max(128),
      purpose: z.enum(["reference", "recreate"]),
    }).strict()).max(20).optional().default([]),
  })
  .strict();

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
  const parsed = ingestSchema.safeParse(decoded);
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid ingestion payload." }, { status: 400 });
  }
  const body = parsed.data;

  try {
    const existing = await supabaseRequest<Array<{
      collection_ids?: string[]; collection_labels?: string[]; collection_purpose?: "reference" | "recreate";
    }>>(
      `saved_posts?instagram_media_id=eq.${encodeURIComponent(body.instagram_media_id)}&select=collection_ids,collection_labels,collection_purpose&limit=1`,
    );
    const collectionLabels = new Map<string, string>();
    for (const [index, id] of (existing[0]?.collection_ids ?? []).entries()) {
      collectionLabels.set(id, existing[0]?.collection_labels?.[index] ?? id);
    }
    for (const collection of body.collections) collectionLabels.set(collection.id, collection.label);
    const collections = [...collectionLabels].map(([id, label]) => ({ id, label }));
    const collectionPurpose = body.collections.some((collection) => collection.purpose === "recreate")
      || existing[0]?.collection_purpose === "recreate" ? "recreate" : "reference";

    const rows = await supabaseRequest<Array<{ id: string; status: string }>>(
      "saved_posts?on_conflict=instagram_media_id",
      {
        method: "POST",
        headers: { Prefer: "resolution=merge-duplicates,return=representation" },
        body: JSON.stringify({
          instagram_media_id: body.instagram_media_id,
          shortcode: body.shortcode,
          author: body.author,
          url: body.url,
          content_type: body.content_type,
          caption: body.caption,
          duration_seconds: body.duration_seconds ?? null,
          saved_at: body.saved_at || new Date().toISOString(),
          collection_ids: collections.map((collection) => collection.id),
          collection_labels: collections.map((collection) => collection.label),
          collection_purpose: collectionPurpose,
        }),
      },
    );
    return NextResponse.json({ save: rows[0] }, { status: 201 });
  } catch (error) {
    const detail = error instanceof Error ? error.message : "Unknown ingestion failure.";
    return NextResponse.json({ error: "Ingestion failed.", detail }, { status: 500 });
  }
}
