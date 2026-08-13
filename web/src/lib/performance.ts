import type { ContentFormat, ContentPackage, MetricSnapshot } from "./domain";
import type { MetaMetrics } from "./meta-insights";

const goalMetric: Record<ContentPackage["goal"], keyof MetaMetrics> = {
  Reach: "reach",
  Shares: "shares",
  Saves: "saves",
  Follows: "follows",
  Trust: "averageWatchSeconds",
};

export type ExperimentMetricKey =
  | "views"
  | "reach"
  | "averageWatchSeconds"
  | "likes"
  | "comments"
  | "shares"
  | "saves"
  | "follows";

export type ExperimentMetricRow = {
  label: string;
  key: ExperimentMetricKey;
};

const videoMetricRows: ExperimentMetricRow[] = [
  { label: "Views", key: "views" },
  { label: "Reach", key: "reach" },
  { label: "Average watch time", key: "averageWatchSeconds" },
  { label: "Shares", key: "shares" },
  { label: "Saves", key: "saves" },
  { label: "Follows", key: "follows" },
];

const staticMetricRows: ExperimentMetricRow[] = [
  { label: "Views", key: "views" },
  { label: "Reach", key: "reach" },
  { label: "Likes", key: "likes" },
  { label: "Comments", key: "comments" },
  { label: "Shares", key: "shares" },
  { label: "Saves", key: "saves" },
  { label: "Follows", key: "follows" },
];

export function getExperimentMetricRows(format: ContentFormat): ExperimentMetricRow[] {
  const rows = format === "Yap Reel" || format === "Mini Story" || format === "POV / Realization"
    ? videoMetricRows
    : staticMetricRows;
  return rows.map((row) => ({ ...row }));
}

export function analyzePerformanceWindow(
  content: Pick<ContentPackage, "goal" | "testVariable">,
  metrics: MetaMetrics,
  comparable: MetricSnapshot[],
) {
  let metric = goalMetric[content.goal];
  if (metrics[metric] === undefined) {
    metric = metrics.reach !== undefined ? "reach" : "views";
  }
  const primaryValue = Number(metrics[metric] ?? 0);
  const comparableValues = comparable
    .map((snapshot) => Number(snapshot[metric as keyof MetricSnapshot]))
    .filter((value) => Number.isFinite(value));
  const sorted = [...comparableValues].sort((left, right) => left - right);
  const median = sorted.length
    ? sorted.length % 2
      ? sorted[Math.floor(sorted.length / 2)]
      : (sorted[sorted.length / 2 - 1] + sorted[sorted.length / 2]) / 2
    : undefined;

  let signal = "Building baseline";
  let observation = `${content.goal} is measured by ${metric}; ${primaryValue} is recorded for this window.`;
  if (sorted.length >= 5 && median !== undefined) {
    signal = primaryValue > median ? "Above current baseline" : primaryValue < median ? "Below current baseline" : "At current baseline";
    observation = `${primaryValue} ${metric} compared with a same-window median of ${median} across ${sorted.length} comparable posts. This is a comparison, not a winner declaration.`;
  }
  return {
    primaryMetric: metric,
    primaryValue,
    comparableCount: sorted.length,
    signal,
    observation,
    nextTest: `Keep the body stable and review the next ${content.testVariable} test at the same window before promoting a learning.`,
  };
}
