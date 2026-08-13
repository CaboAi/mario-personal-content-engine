import { NextResponse } from "next/server";
import { rejectCrossOrigin, requireDashboardSession } from "@/lib/api-auth";
import {
  resolveInstagramMatchSuggestion,
  suggestInstagramContentMatch,
  type InstagramMatchCandidate,
} from "@/lib/instagram-match";
import { fetchAccountDailyInsights, fetchMediaInsights, listInstagramMedia } from "@/lib/meta";
import { isLiveMode, supabaseRequest } from "@/lib/supabase-rest";

type ContentRow = {
  id: string;
  title: string;
  format: string;
  caption: string | null;
  selected_hook: string;
  selected_on_screen_hook: string;
  closing_line: string;
  skeleton: string[];
  instagram_media_id: string | null;
  archived_at: string | null;
  status: string;
};

type ExistingMediaRow = {
  instagram_media_id: string;
  content_id: string | null;
  suggested_content_id: string | null;
  match_confidence: number | null;
  match_reason: string | null;
  dismissed_content_id: string | null;
};

export async function POST(request: Request) {
  const sessionError = await requireDashboardSession();
  if (sessionError) return sessionError;
  const originError = rejectCrossOrigin(request);
  if (originError) return originError;
  if (!isLiveMode()) return NextResponse.json({ error: "Supabase is not configured." }, { status: 503 });

  try {
    const [media, contentRows, existingMediaRows] = await Promise.all([
      listInstagramMedia(100),
      supabaseRequest<ContentRow[]>(
        "content_items?select=id,title,format,caption,selected_hook,selected_on_screen_hook,closing_line,skeleton,instagram_media_id,archived_at,status",
      ),
      supabaseRequest<ExistingMediaRow[]>(
        "instagram_media_library?select=instagram_media_id,content_id,suggested_content_id,match_confidence,match_reason,dismissed_content_id",
      ),
    ]);
    const contentByMedia = new Map(contentRows
      .filter((row) => row.instagram_media_id)
      .map((row) => [row.instagram_media_id as string, row.id]));
    const existingByMedia = new Map(existingMediaRows.map((row) => [row.instagram_media_id, row]));
    const reservedContentIds = new Set(contentRows
      .filter((row) => row.instagram_media_id)
      .map((row) => row.id));
    const eligibleContentIds = new Set(contentRows
      .filter((row) => !row.archived_at && row.status === "Posted")
      .map((row) => row.id));
    for (const row of existingMediaRows) {
      if (row.content_id) reservedContentIds.add(row.content_id);
      if (!row.content_id && row.suggested_content_id && eligibleContentIds.has(row.suggested_content_id)) {
        reservedContentIds.add(row.suggested_content_id);
      }
    }
    const matchCandidates: InstagramMatchCandidate[] = contentRows
      .filter((row) => !row.archived_at && row.status === "Posted")
      .map((row) => ({
      id: row.id,
      title: row.title,
      format: row.format,
      caption: row.caption,
      selectedHook: row.selected_hook,
      selectedOnScreenHook: row.selected_on_screen_hook,
      closingLine: row.closing_line,
      skeleton: row.skeleton,
      instagramMediaId: row.instagram_media_id,
      }));
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
        const existing = existingByMedia.get(item.id);
        const confirmedContentId = contentByMedia.get(item.id) ?? existing?.content_id ?? null;
        const suggestion = confirmedContentId ? null : suggestInstagramContentMatch({
          caption: item.caption,
          mediaType: item.media_type,
          mediaProductType: item.media_product_type,
          dismissedContentId: existing?.dismissed_content_id,
        }, matchCandidates.filter((candidate) => !reservedContentIds.has(candidate.id)));
        if (suggestion) reservedContentIds.add(suggestion.contentId);
        const existingSuggestionIsEligible = existing?.suggested_content_id
          ? eligibleContentIds.has(existing.suggested_content_id)
          : false;
        const suggestionState = resolveInstagramMatchSuggestion(confirmedContentId, suggestion, {
          suggestedContentId: existingSuggestionIsEligible ? existing?.suggested_content_id : null,
          matchConfidence: existingSuggestionIsEligible ? existing?.match_confidence : null,
          matchReason: existingSuggestionIsEligible ? existing?.match_reason : null,
        });
        imported.push({
          instagram_media_id: item.id,
          content_id: confirmedContentId,
          suggested_content_id: suggestionState.suggestedContentId,
          match_confidence: suggestionState.matchConfidence,
          match_reason: suggestionState.matchReason,
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
      matchSuggestions: imported.filter((item) => item.suggested_content_id).length,
      accountDays: accountDays.length,
    });
  } catch (cause) {
    const message = cause instanceof Error ? cause.message : "Instagram history import failed.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
