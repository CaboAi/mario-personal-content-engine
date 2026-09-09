import { NextResponse } from "next/server";
import { z } from "zod";
import { rejectCrossOrigin, requireDashboardSession } from "@/lib/api-auth";
import type { SavedPost } from "@/lib/domain";
import { refreshAndPersistSaveDirections } from "@/lib/save-analysis-service";
import { isLiveMode, supabaseRequest } from "@/lib/supabase-rest";

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const sessionError = await requireDashboardSession();
  if (sessionError) return sessionError;
  const originError = rejectCrossOrigin(request);
  if (originError) return originError;
  if (!isLiveMode()) return NextResponse.json({ error: "Supabase is not configured." }, { status: 503 });
  const { id } = await params;
  if (!z.string().uuid().safeParse(id).success) return NextResponse.json({ error: "Invalid save ID." }, { status: 400 });
  const saves = await supabaseRequest<SavedPost[]>(`dashboard_saved_posts?id=eq.${encodeURIComponent(id)}&select=*`);
  if (!saves[0]) return NextResponse.json({ error: "Save not found." }, { status: 404 });
  try { return NextResponse.json({ save: await refreshAndPersistSaveDirections(saves[0]) }); }
  catch (cause) { return NextResponse.json({ error: cause instanceof Error ? cause.message : "Directions could not be refreshed." }, { status: 500 }); }
}
