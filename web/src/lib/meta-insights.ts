export type MetaMetrics = {
  views?: number;
  reach?: number;
  averageWatchSeconds?: number;
  likes?: number;
  comments?: number;
  shares?: number;
  saves?: number;
  follows?: number;
  totalInteractions?: number;
  totalWatchSeconds?: number;
  reposts?: number;
  raw: Record<string, number>;
};

export type InsightDatum = {
  name: string;
  values?: Array<{ value?: number }>;
  total_value?: { value?: number };
};

function insightValue(datum?: InsightDatum) {
  const value = datum?.total_value?.value ?? datum?.values?.[0]?.value;
  return typeof value === "number" && Number.isFinite(value) ? value : undefined;
}

export function parseMediaInsights(data: InsightDatum[]): MetaMetrics {
  const raw = Object.fromEntries(
    data.flatMap((datum) => {
      const value = insightValue(datum);
      return value === undefined ? [] : [[datum.name, value]];
    }),
  );
  return {
    views: raw.views,
    reach: raw.reach,
    averageWatchSeconds: raw.ig_reels_avg_watch_time === undefined
      ? undefined
      : raw.ig_reels_avg_watch_time / 1_000,
    likes: raw.likes,
    comments: raw.comments,
    shares: raw.shares,
    saves: raw.saved,
    follows: raw.follows,
    totalInteractions: raw.total_interactions,
    totalWatchSeconds: raw.ig_reels_video_view_total_time === undefined
      ? undefined
      : raw.ig_reels_video_view_total_time / 1_000,
    reposts: raw.reposts,
    raw,
  };
}
