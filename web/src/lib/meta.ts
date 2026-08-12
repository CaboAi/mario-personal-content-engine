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
  const accessToken = process.env.META_ACCESS_TOKEN;
  const accountId = process.env.META_INSTAGRAM_ACCOUNT_ID;
  if (!accessToken || !accountId) {
    throw new Error("Meta requires META_ACCESS_TOKEN and META_INSTAGRAM_ACCOUNT_ID.");
  }
  const baseUrl = (process.env.META_GRAPH_BASE_URL || "https://graph.instagram.com").replace(/\/$/, "");
  if (!ALLOWED_GRAPH_HOSTS.has(baseUrl)) throw new Error("Unsupported Meta Graph host.");
  const version = process.env.META_GRAPH_API_VERSION || DEFAULT_GRAPH_VERSION;
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
