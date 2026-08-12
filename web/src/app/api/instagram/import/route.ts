import { NextResponse } from "next/server";
import { rejectCrossOrigin, requireDashboardSession } from "@/lib/api-auth";
import { fetchAccountDailyInsights, fetchMediaInsights, listInstagramMedia } from "@/lib/meta";
import { isLiveMode, supabaseRequest } from "@/lib/supabase-rest";

export async function POST(request: Request) {
  const sessionError = await requireDashboardSession();
  if (sessionError) return sessionError;
  const originError = rejectCrossOrigin(request);
  if (originError) return originError;
  if (!isLiveMode()) return NextResponse.json({ error: "Supabase is not configured." }, { status: 503 });

  try {
    const [media, contentRows] = await Promise.all([
      listInstagramMedia(100),
      supabaseRequest<Array<{ id: string; instagram_media_id: string }>>(
        "content_items?select=id,instagram_media_id&instagram_media_id=not.is.null",
      ),
    ]);
    const contentByMedia = new Map(contentRows.map((row) => [row.instagram_media_id, row.id]));
    const imported: Array<Record<string, unknown>> = [];
    let insightFailures = 0;

    for (let index = 0; index < media.length; index += 4) {
      const batch = media.slice(index, index + 4);
      const results = await Promise.all(batch.map(async (item) => {
        try {
          const metrics = await fetchMediaInsights(item.id, item.media_product_type);
          return { item, metrics };
        } catch {
          insightFailures += 1;
          return { item, metrics: undefined };
        }
      }));
      for (const { item, metrics } of results) {
        imported.push({
          instagram_media_id: item.id,
          content_id: contentByMedia.get(item.id) ?? null,
          caption: item.caption ?? null,
          media_type: item.media_type ?? null,
          media_product_type: item.media_product_type ?? null,
          permalink: item.permalink ?? null,
          thumbnail_url: item.thumbnail_url ?? null,
          posted_at: item.timestamp,
          views: metrics?.views ?? null,
          reach: metrics?.reach ?? null,
          average_watch_seconds: metrics?.averageWatchSeconds ?? null,
          total_watch_seconds: metrics?.totalWatchSeconds ?? null,
          likes: metrics?.likes ?? null,
          comments: metrics?.comments ?? null,
          shares: metrics?.shares ?? null,
          saves: metrics?.saves ?? null,
          follows: metrics?.follows ?? null,
          total_interactions: metrics?.totalInteractions ?? null,
          reposts: metrics?.reposts ?? null,
          raw_metrics: metrics?.raw ?? {},
          last_synced_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        });
      }
    }

    if (imported.length) {
      await supabaseRequest("instagram_media_library?on_conflict=instagram_media_id", {
        method: "POST",
        headers: { Prefer: "resolution=merge-duplicates,return=minimal" },
        body: JSON.stringify(imported),
      });
    }

    const accountDays = await fetchAccountDailyInsights(90);
    if (accountDays.length) {
      const now = new Date().toISOString();
      await supabaseRequest("instagram_account_daily?on_conflict=metric_date", {
        method: "POST",
        headers: { Prefer: "resolution=merge-duplicates,return=minimal" },
        body: JSON.stringify(accountDays.map((day) => ({
          metric_date: day.metricDate,
          reach: day.reach ?? null,
          views: day.views ?? null,
          profile_views: day.profileViews ?? null,
          follower_count: day.followerCount ?? null,
          accounts_engaged: day.accountsEngaged ?? null,
          total_interactions: day.totalInteractions ?? null,
          likes: day.likes ?? null,
          comments: day.comments ?? null,
          shares: day.shares ?? null,
          saves: day.saves ?? null,
          raw_metrics: day.rawMetrics,
          last_synced_at: now,
          updated_at: now,
        }))),
      });
    }

    return NextResponse.json({
      importedPosts: imported.length,
      postsWithInsights: imported.length - insightFailures,
      insightFailures,
      accountDays: accountDays.length,
    });
  } catch (cause) {
    const message = cause instanceof Error ? cause.message : "Instagram history import failed.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
