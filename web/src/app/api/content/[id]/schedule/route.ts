import { NextResponse } from "next/server";
import { z } from "zod";
import { rejectCrossOrigin, requireDashboardSession } from "@/lib/api-auth";
import type { ContentPackage } from "@/lib/domain";
import { isLiveMode, supabaseRequest } from "@/lib/supabase-rest";

const bodySchema = z.object({
  plannedFor: z.string().date().nullable(),
}).strict();

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const sessionError = await requireDashboardSession();
  if (sessionError) return sessionError;
  const originError = rejectCrossOrigin(request);
  if (originError) return originError;
  if (!isLiveMode()) {
    return NextResponse.json({ error: "Supabase is not configured." }, { status: 503 });
  }

  const { id } = await params;
  if (!z.string().uuid().safeParse(id).success) {
    return NextResponse.json({ error: "Invalid content ID." }, { status: 400 });
  }

  const parsed = bodySchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: "plannedFor must be an ISO calendar date or null." }, { status: 400 });
  }

  try {
    const existing = await supabaseRequest<Array<{ id: string; status: string; archived_at: string | null }>>(
      `content_items?id=eq.${encodeURIComponent(id)}&select=id,status,archived_at`,
    );
    if (!existing[0]) return NextResponse.json({ error: "Content item not found." }, { status: 404 });
    if (existing[0].archived_at || existing[0].status === "Posted") {
      return NextResponse.json({ error: "Posted or archived content cannot be rescheduled." }, { status: 409 });
    }

    await supabaseRequest("content_items?id=eq." + encodeURIComponent(id), {
      method: "PATCH",
      headers: { Prefer: "return=minimal" },
      body: JSON.stringify({ planned_for: parsed.data.plannedFor, updated_at: new Date().toISOString() }),
    });
    const updated = await supabaseRequest<ContentPackage[]>(
      `dashboard_content_items?id=eq.${encodeURIComponent(id)}&select=*`,
    );
    return NextResponse.json({ content: updated[0] });
  } catch (cause) {
    return NextResponse.json({ error: cause instanceof Error ? cause.message : "Schedule update failed." }, { status: 500 });
  }
}
