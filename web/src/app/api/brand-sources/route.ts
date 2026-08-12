import { NextResponse } from "next/server";
import { isLiveMode, supabaseRequest } from "@/lib/supabase-rest";

type SourceSummary = {
  id: string;
  source_type: string;
  title: string;
  privacy_status: string;
  status: string;
  source_external_id: string | null;
};

export async function GET() {
  if (!isLiveMode()) {
    return NextResponse.json({ error: "Supabase is not configured." }, { status: 503 });
  }
  const sources = await supabaseRequest<SourceSummary[]>(
    "brand_sources?select=id,source_type,title,privacy_status,status,source_external_id&order=created_at.asc",
  );
  const usable = sources.filter(
    (source) => source.status === "Verified" && source.privacy_status === "Clear",
  );
  return NextResponse.json({
    total: sources.length,
    usable: usable.length,
    categories: [...new Set(sources.map((source) => source.source_type))],
    sources,
  });
}
