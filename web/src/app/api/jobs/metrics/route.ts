import { NextResponse } from "next/server";
import type { ContentPackage, MetricSnapshot, PerformanceReview } from "@/lib/domain";
import { requireCronSecret, requireDashboardSession, rejectCrossOrigin } from "@/lib/api-auth";
import { fetchMediaInsights, isMetaConfigured } from "@/lib/meta";
import { analyzePerformanceWindow } from "@/lib/performance";
import { isLiveMode, supabaseRequest } from "@/lib/supabase-rest";

export const maxDuration = 60;

type PendingReviewRow = {
  id: string;
  content_id: string;
  review_window_hours: 24 | 168;
  due_at: string;
};

async function runMetricsJob() {
  if (!isLiveMode()) return NextResponse.json({ error: "Supabase is not configured." }, { status: 503 });
  if (!isMetaConfigured()) return NextResponse.json({ error: "Meta analytics is not configured." }, { status: 503 });
  const job = await supabaseRequest<Array<{ id: string }>>("job_runs", {
    method: "POST", headers: { Prefer: "return=representation" },
    body: JSON.stringify({ job_type: "instagram-window-analysis", status: "Running" }),
  });
  const jobId = job[0]?.id;
  let processed = 0;
  const errors: string[] = [];
  try {
    const due = await supabaseRequest<PendingReviewRow[]>(
      `performance_reviews?status=eq.Pending&due_at=lte.${encodeURIComponent(new Date().toISOString())}&select=*&order=due_at.asc&limit=10`,
    );
    const [content, metrics] = await Promise.all([
      supabaseRequest<ContentPackage[]>("dashboard_content_items?select=*"),
      supabaseRequest<MetricSnapshot[]>("dashboard_metric_snapshots?select=*"),
    ]);
    for (const review of due) {
      const item = content.find((candidate) => candidate.id === review.content_id);
      if (!item?.instagramMediaId) continue;
      try {
        const insight = await fetchMediaInsights(item.instagramMediaId, item.mediaProductType);
        const comparable = metrics.filter((snapshot) =>
          snapshot.reviewWindowHours === review.review_window_hours
          && snapshot.contentId !== item.id
          && content.find((candidate) => candidate.id === snapshot.contentId)?.goal === item.goal,
        );
        const analysis = analyzePerformanceWindow(item, insight, comparable);
        await supabaseRequest<PerformanceReview[]>("rpc/record_performance_window", {
          method: "POST",
          body: JSON.stringify({
            p_content_id: item.id,
            p_window_hours: review.review_window_hours,
            p_instagram_media_id: item.instagramMediaId,
            p_media_product_type: item.mediaProductType || "",
            p_metrics: insight,
            p_analysis: analysis,
          }),
        });
        processed += 1;
      } catch (cause) {
        const message = cause instanceof Error ? cause.message : "Metric capture failed.";
        errors.push(`${review.id}: ${message}`);
        await supabaseRequest<void>(`performance_reviews?id=eq.${encodeURIComponent(review.id)}`, {
          method: "PATCH", headers: { Prefer: "return=minimal" },
          body: JSON.stringify({ last_error: message, updated_at: new Date().toISOString() }),
        });
      }
    }
    if (jobId) await supabaseRequest<void>(`job_runs?id=eq.${encodeURIComponent(jobId)}`, {
      method: "PATCH", headers: { Prefer: "return=minimal" },
      body: JSON.stringify({ status: errors.length ? "Failed" : "Succeeded", finished_at: new Date().toISOString(), processed_count: processed, error_message: errors[0] || null, details: { errors } }),
    });
    return NextResponse.json({ due: due.length, processed, errors });
  } catch (cause) {
    const message = cause instanceof Error ? cause.message : "Metrics job failed.";
    if (jobId) await supabaseRequest<void>(`job_runs?id=eq.${encodeURIComponent(jobId)}`, {
      method: "PATCH", headers: { Prefer: "return=minimal" },
      body: JSON.stringify({ status: "Failed", finished_at: new Date().toISOString(), processed_count: processed, error_message: message }),
    }).catch(() => undefined);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function GET(request: Request) {
  const authError = requireCronSecret(request); if (authError) return authError;
  return runMetricsJob();
}

export async function POST(request: Request) {
  const originError = rejectCrossOrigin(request); if (originError) return originError;
  const sessionError = await requireDashboardSession(); if (sessionError) return sessionError;
  return runMetricsJob();
}
