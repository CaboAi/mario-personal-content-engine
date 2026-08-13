import "server-only";
import { parseMediaInsights, type InsightDatum } from "./meta-insights";

const DEFAULT_GRAPH_VERSION = "v25.0";
const ALLOWED_GRAPH_HOSTS = new Set([
  "https://graph.instagram.com",
  "https://graph.facebook.com",
]);

type MetaConfig = {
  accessToken: string;
  accountId: string;
  baseUrl: string;
  version: string;
};

export function isMetaConfigured() {
  return Boolean(process.env.META_ACCESS_TOKEN && process.env.META_INSTAGRAM_ACCOUNT_ID);
}

export function getMetaConfig(): MetaConfig {
  const accessToken = process.env.META_ACCESS_TOKEN?.trim();
  const accountId = process.env.META_INSTAGRAM_ACCOUNT_ID?.trim();
  if (!accessToken || !accountId) {
    throw new Error("Meta requires META_ACCESS_TOKEN and META_INSTAGRAM_ACCOUNT_ID.");
  }
  const baseUrl = (process.env.META_GRAPH_BASE_URL || "https://graph.instagram.com").trim().replace(/\/+$/, "");
  if (!ALLOWED_GRAPH_HOSTS.has(baseUrl)) throw new Error("Unsupported Meta Graph host.");
  const version = (process.env.META_GRAPH_API_VERSION || DEFAULT_GRAPH_VERSION).trim();
  if (!/^v\d+\.\d+$/.test(version)) throw new Error("Invalid Meta Graph API version.");
  return { accessToken, accountId, baseUrl, version };
}

export async function metaRequest<T>(path: string, init: RequestInit = {}) {
  const config = getMetaConfig();
  const formBody = init.body instanceof URLSearchParams;
  const response = await fetch(`${config.baseUrl}/${config.version}/${path.replace(/^\//, "")}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${config.accessToken}`,
      "Content-Type": formBody ? "application/x-www-form-urlencoded" : "application/json",
      ...init.headers,
    },
    cache: "no-store",
  });
  const text = await response.text();
  if (!response.ok) {
    let message = `Meta Graph request failed (${response.status}).`;
    try {
      const decoded = JSON.parse(text) as { error?: { message?: string; code?: number } };
      if (decoded.error?.message) message = `Meta Graph request failed: ${decoded.error.message}`;
    } catch {}
    throw new Error(message);
  }
  return (text.trim() ? JSON.parse(text) : undefined) as T;
}

export async function fetchMediaInsights(mediaId: string, productType?: string) {
  const common = ["views", "reach", "likes", "comments", "shares", "saved", "total_interactions", "reposts"];
  const metrics = productType?.toUpperCase() === "REELS"
    ? [...common, "ig_reels_avg_watch_time", "ig_reels_video_view_total_time"]
    : [...common, "follows"];
  const settled = await Promise.allSettled(metrics.map((metric) =>
    metaRequest<{ data?: InsightDatum[] }>(`${encodeURIComponent(mediaId)}/insights?metric=${metric}`),
  ));
  const data = settled.flatMap((result) =>
    result.status === "fulfilled" ? result.value.data ?? [] : [],
  );
  if (!data.length) throw new Error("Meta returned no available insights for this media yet.");
  return parseMediaInsights(data);
}

export async function fetchInstagramMedia(mediaId: string) {
  return metaRequest<{
    id: string;
    media_type?: string;
    media_product_type?: string;
    permalink?: string;
    timestamp?: string;
  }>(`${encodeURIComponent(mediaId)}?fields=id,media_type,media_product_type,permalink,timestamp`);
}

export type InstagramMediaRecord = {
  id: string;
  caption?: string;
  media_type?: string;
  media_product_type?: string;
  permalink?: string;
  thumbnail_url?: string;
  timestamp: string;
};

export async function listInstagramMedia(maxItems = 100) {
  const { accountId } = getMetaConfig();
  const media: InstagramMediaRecord[] = [];
  let after: string | undefined;
  do {
    const query = new URLSearchParams({
      fields: "id,caption,media_type,media_product_type,permalink,thumbnail_url,timestamp",
      limit: String(Math.min(50, maxItems - media.length)),
    });
    if (after) query.set("after", after);
    type MediaPage = {
      data?: InstagramMediaRecord[];
      paging?: { cursors?: { after?: string }; next?: string };
    };
    let page: MediaPage;
    try {
      page = await metaRequest<MediaPage>(`${encodeURIComponent(accountId)}/media?${query}`);
    } catch {
      try {
        // Preserve captions when only thumbnail access is unsupported.
        query.set("fields", "id,caption,media_type,media_product_type,permalink,timestamp");
        page = await metaRequest<MediaPage>(`${encodeURIComponent(accountId)}/media?${query}`);
      } catch {
        // Keep history sync useful when this account/API combination rejects optional
        // descriptive fields. Existing match suggestions survive caption-less re-syncs.
        query.set("fields", "id,media_type,media_product_type,permalink,timestamp");
        page = await metaRequest<MediaPage>(`${encodeURIComponent(accountId)}/media?${query}`);
      }
    }
    media.push(...(page.data ?? []));
    after = page.paging?.next ? page.paging.cursors?.after : undefined;
  } while (after && media.length < maxItems);
  return media.slice(0, maxItems);
}

export type AccountDailyMetrics = {
  metricDate: string;
  reach?: number;
  views?: number;
  profileViews?: number;
  followerCount?: number;
  accountsEngaged?: number;
  totalInteractions?: number;
  likes?: number;
  comments?: number;
  shares?: number;
  saves?: number;
  rawMetrics: Record<string, number>;
};

const accountMetricNames = [
  "reach",
  "views",
  "profile_views",
  "follower_count",
  "accounts_engaged",
  "total_interactions",
  "likes",
  "comments",
  "shares",
  "saves",
] as const;

export async function fetchAccountDailyInsights(days = 90) {
  const { accountId } = getMetaConfig();
  const until = Math.floor(Date.now() / 1_000);
  const since = until - Math.min(Math.max(days, 1), 90) * 86_400;
  const settled = await Promise.allSettled(accountMetricNames.map(async (metric) => {
    const query = new URLSearchParams({ metric, period: "day", since: String(since), until: String(until) });
    const response = await metaRequest<{
      data?: Array<{ name: string; values?: Array<{ value?: number; end_time?: string }> }>;
    }>(`${encodeURIComponent(accountId)}/insights?${query}`);
    return { metric, values: response.data?.[0]?.values ?? [] };
  }));

  const byDate = new Map<string, AccountDailyMetrics>();
  for (const result of settled) {
    if (result.status !== "fulfilled") continue;
    for (const point of result.value.values) {
      if (typeof point.value !== "number" || !Number.isFinite(point.value) || !point.end_time) continue;
      const metricDate = point.end_time.slice(0, 10);
      const row = byDate.get(metricDate) ?? { metricDate, rawMetrics: {} };
      row.rawMetrics[result.value.metric] = point.value;
      if (result.value.metric === "reach") row.reach = point.value;
      if (result.value.metric === "views") row.views = point.value;
      if (result.value.metric === "profile_views") row.profileViews = point.value;
      if (result.value.metric === "follower_count") row.followerCount = point.value;
      if (result.value.metric === "accounts_engaged") row.accountsEngaged = point.value;
      if (result.value.metric === "total_interactions") row.totalInteractions = point.value;
      if (result.value.metric === "likes") row.likes = point.value;
      if (result.value.metric === "comments") row.comments = point.value;
      if (result.value.metric === "shares") row.shares = point.value;
      if (result.value.metric === "saves") row.saves = point.value;
      byDate.set(metricDate, row);
    }
  }
  return Array.from(byDate.values()).sort((a, b) => a.metricDate.localeCompare(b.metricDate));
}

export async function getPublishingLimit() {
  const { accountId } = getMetaConfig();
  return metaRequest<Record<string, unknown>>(
    `${encodeURIComponent(accountId)}/content_publishing_limit?fields=config,quota_usage`,
  );
}

export async function createCarouselChildren(assetUrls: string[], altTexts: string[]) {
  const { accountId } = getMetaConfig();
  const ids: string[] = [];
  for (let index = 0; index < assetUrls.length; index += 1) {
    const created = await metaRequest<{ id: string }>(`${encodeURIComponent(accountId)}/media`, {
      method: "POST",
      body: new URLSearchParams({
        image_url: assetUrls[index],
        is_carousel_item: "true",
        alt_text: altTexts[index],
      }),
    });
    ids.push(created.id);
  }
  return ids;
}

export async function createCarouselContainer(children: string[], caption: string) {
  const { accountId } = getMetaConfig();
  return metaRequest<{ id: string }>(`${encodeURIComponent(accountId)}/media`, {
    method: "POST",
    body: new URLSearchParams({ media_type: "CAROUSEL", children: children.join(","), caption }),
  });
}

export async function getContainerStatus(containerId: string) {
  return metaRequest<{ id?: string; status_code?: "EXPIRED" | "ERROR" | "FINISHED" | "IN_PROGRESS" | "PUBLISHED" }>(
    `${encodeURIComponent(containerId)}?fields=id,status_code`,
  );
}

export async function publishContainer(containerId: string) {
  const { accountId } = getMetaConfig();
  return metaRequest<{ id: string }>(`${encodeURIComponent(accountId)}/media_publish`, {
    method: "POST",
    body: new URLSearchParams({ creation_id: containerId }),
  });
}
