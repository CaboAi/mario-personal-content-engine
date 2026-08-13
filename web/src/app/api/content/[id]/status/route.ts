import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { z } from "zod";
import { PRODUCTION_STATUSES, type ContentFormat, type ProductionStatus } from "@/lib/domain";
import { isProductionStatusForFormat } from "@/lib/format-contracts";
import { SESSION_COOKIE, verifySessionToken } from "@/lib/session";
import { isLiveMode, supabaseRequest } from "@/lib/supabase-rest";

const productionStatusSchema = z.enum(PRODUCTION_STATUSES);

const bodySchema = z.object({ status: productionStatusSchema }).strict();

export async function PATCH(
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
    return NextResponse.json({ error: "Invalid production status." }, { status: 400 });
  }

  try {
    const existing = await supabaseRequest<Array<{
      id: string;
      format: ContentFormat;
      archived_at: string | null;
    }>>(
      `content_items?id=eq.${encodeURIComponent(id)}&select=id,format,archived_at`,
    );
    const content = existing[0];
    if (!content) {
      return NextResponse.json({ error: "Content item not found." }, { status: 404 });
    }
    if (content.archived_at) {
      return NextResponse.json(
        { error: "Archived content cannot change production status." },
        { status: 409 },
      );
    }
    if (!isProductionStatusForFormat(content.format, parsed.data.status)) {
      return NextResponse.json(
        { error: `${parsed.data.status} is not valid for ${content.format}.` },
        { status: 409 },
      );
    }

    const rows = await supabaseRequest<Array<{ id: string; status: ProductionStatus }>>(
      `content_items?id=eq.${encodeURIComponent(id)}&archived_at=is.null&select=id,status`,
      {
        method: "PATCH",
        headers: { Prefer: "return=representation" },
        body: JSON.stringify({
          status: parsed.data.status,
          updated_at: new Date().toISOString(),
        }),
      },
    );
    if (!rows[0]) {
      return NextResponse.json(
        { error: "Content item was archived before the status update completed." },
        { status: 409 },
      );
    }
    return NextResponse.json({ content: rows[0] });
  } catch (cause) {
    const message = cause instanceof Error ? cause.message : "Status update failed.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
