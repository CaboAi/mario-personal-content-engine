import "server-only";

import type { DashboardData } from "./domain";
import { demoData } from "./demo-data";

const supabaseUrl =
  process.env.SUPABASE_URL ?? process.env.NEXT_PUBLIC_SUPABASE_URL;
const serverKey =
  process.env.SUPABASE_SECRET_KEY ?? process.env.SUPABASE_SERVICE_ROLE_KEY;

export function isLiveMode() {
  return Boolean(supabaseUrl && serverKey);
}

export async function supabaseRequest<T>(
  path: string,
  init: RequestInit = {},
): Promise<T> {
  if (!supabaseUrl || !serverKey) {
    throw new Error("Supabase server environment is not configured.");
  }

  const response = await fetch(`${supabaseUrl}/rest/v1/${path}`, {
    ...init,
    headers: {
      apikey: serverKey,
      ...(serverKey.startsWith("sb_secret_")
        ? {}
        : { Authorization: `Bearer ${serverKey}` }),
      "Content-Type": "application/json",
      ...init.headers,
    },
    cache: "no-store",
  });

  if (!response.ok) {
    const detail = await response.text();
    throw new Error(`Supabase request failed (${response.status}): ${detail}`);
  }

  if (response.status === 204) return undefined as T;
  const body = await response.text();
  if (!body.trim()) return undefined as T;
  return JSON.parse(body) as T;
}

export async function getDashboardData(): Promise<DashboardData> {
  if (!isLiveMode()) return demoData;

  const [saves, content, metrics, sources, performanceReviews, publications, instagramMedia, accountTrends] = await Promise.all([
    supabaseRequest<DashboardData["saves"]>(
      "dashboard_saved_posts?select=*&order=savedAt.desc",
    ),
    supabaseRequest<DashboardData["content"]>(
      "dashboard_content_items?select=*&order=createdAt.desc",
    ),
    supabaseRequest<DashboardData["metrics"]>(
      "dashboard_metric_snapshots?select=*&order=capturedAt.desc",
    ),
    supabaseRequest<DashboardData["sources"]>(
      "dashboard_brand_sources?select=*&order=updatedAt.desc",
    ),
    supabaseRequest<DashboardData["performanceReviews"]>(
      "dashboard_performance_reviews?select=*&order=dueAt.desc",
    ),
    supabaseRequest<DashboardData["publications"]>(
      "dashboard_carousel_publications?select=*&order=updatedAt.desc",
    ),
    supabaseRequest<DashboardData["instagramMedia"]>(
      "dashboard_instagram_media?select=*&order=postedAt.desc",
    ),
    supabaseRequest<DashboardData["accountTrends"]>(
      "dashboard_instagram_account_daily?select=*&order=metricDate.asc",
    ),
  ]);

  return {
    saves,
    content,
    metrics,
    sources,
    performanceReviews,
    publications,
    instagramMedia,
    accountTrends,
    analyticsConnected: Boolean(process.env.META_ACCESS_TOKEN && process.env.META_INSTAGRAM_ACCOUNT_ID),
    publishingConnected: Boolean(process.env.META_ACCESS_TOKEN && process.env.META_INSTAGRAM_ACCOUNT_ID),
    liveMode: true,
  };
}
