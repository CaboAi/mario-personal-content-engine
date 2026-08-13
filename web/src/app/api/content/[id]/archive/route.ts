import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { z } from "zod";
import type { ContentPackage } from "@/lib/domain";
import { SESSION_COOKIE, verifySessionToken } from "@/lib/session";
import { isLiveMode, supabaseRequest } from "@/lib/supabase-rest";

const bodySchema = z.object({ archived: z.boolean() }).strict();

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  if (!isLiveMode()) {
    return NextResponse.json({ error: "Supabase is not configured." }, { status: 503 });
  }

  const origin = request.headers.get("origin");
  if (origin && origin !== new URL(request.url).origin) {
    return NextResponse.json({ error: "Invalid request origin." }, { status: 403 });
  }

  const sessionCookie = (await cookies()).get(SESSION_COOKIE)?.value;
  const authConfigured = Boolean(
    process.env.DASHBOARD_PASSWORD && process.env.DASHBOARD_SESSION_SECRET,
  );
  if (authConfigured && !(await verifySessionToken(sessionCookie))) {
    return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  }

  const { id } = await params;
  if (!z.string().uuid().safeParse(id).success) {
    return NextResponse.json({ error: "Invalid content ID." }, { status: 400 });
  }

  const contentLength = Number(request.headers.get("content-length") || 0);
  if (contentLength > 4_096) {
    return NextResponse.json({ error: "Request is too large." }, { status: 413 });
  }

  const raw = await request.text();
  if (new TextEncoder().encode(raw).byteLength > 4_096) {
    return NextResponse.json({ error: "Request is too large." }, { status: 413 });
  }

  let decoded: unknown;
  try {
    decoded = JSON.parse(raw);
  } catch {
    return NextResponse.json({ error: "Invalid JSON." }, { status: 400 });
  }
  const parsed = bodySchema.safeParse(decoded);
  if (!parsed.success) {
    return NextResponse.json({ error: "An archived boolean is required." }, { status: 400 });
  }

  try {
    const rows = await supabaseRequest<ContentPackage[]>("rpc/archive_content_item", {
      method: "POST",
      body: JSON.stringify({
        p_content_id: id,
        p_archived: parsed.data.archived,
      }),
    });
    if (!rows[0]) {
      return NextResponse.json({ error: "Content item not found." }, { status: 404 });
    }
    return NextResponse.json({ content: rows[0] });
  } catch (cause) {
    const message = cause instanceof Error ? cause.message : "Archive update failed.";
    const conflict = message.includes("Another production project is already active");
    return NextResponse.json(
      {
        error: conflict
          ? "Another production project is already active. Archive it before restoring this one."
          : message,
      },
      { status: conflict ? 409 : 500 },
    );
  }
}
