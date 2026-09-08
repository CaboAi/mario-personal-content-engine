import type { ContentMode, ContentPackage } from "./domain";

export const CONTENT_MODE_TARGETS: Record<ContentMode, number> = {
  Dispatch: 60,
  Practical: 25,
  Reflection: 15,
};

export type BatchMix = {
  legal: boolean;
  total: number;
  counts: Record<ContentMode, number>;
  actualPercentages: Record<ContentMode, number>;
  targetPercentages: Record<ContentMode, number>;
};

function contentModeOf(content: Pick<ContentPackage, "mode">): ContentMode {
  return content.mode ?? "Reflection";
}

export function getBatchMix(packages: Iterable<Pick<ContentPackage, "mode">>): BatchMix {
  const counts: Record<ContentMode, number> = { Dispatch: 0, Practical: 0, Reflection: 0 };
  let total = 0;
  for (const content of packages) {
    counts[contentModeOf(content)] += 1;
    total += 1;
  }
  const actualPercentages = (Object.keys(counts) as ContentMode[]).reduce<Record<ContentMode, number>>(
    (percentages, mode) => ({ ...percentages, [mode]: total === 0 ? 0 : (counts[mode] / total) * 100 }),
    { Dispatch: 0, Practical: 0, Reflection: 0 },
  );
  return {
    legal: total < 3 || counts.Reflection <= total / 3,
    total,
    counts,
    actualPercentages,
    targetPercentages: CONTENT_MODE_TARGETS,
  };
}

export function isLegalBatchMix(packages: Iterable<Pick<ContentPackage, "mode">>) {
  return getBatchMix(packages).legal;
}
