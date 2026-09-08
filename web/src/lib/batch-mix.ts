import type { ContentMode, ContentPackage } from "./domain";

export const CONTENT_MODE_TARGETS: Record<ContentMode, number> = {
  Dispatch: 60,
  Practical: 25,
  Reflection: 15,
};

export type BatchMix = {
  legal: boolean;
  violations: BatchMixViolation[];
  total: number;
  counts: Record<ContentMode, number>;
  actualPercentages: Record<ContentMode, number>;
  targetPercentages: Record<ContentMode, number>;
};

export type BatchMixViolation = {
  mode: "Dispatch" | "Reflection";
  rule: "minimum" | "maximum";
  actualPercentage: number;
  requiredPercentage: number;
  differencePercentagePoints: number;
  message: string;
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
  const violations: BatchMixViolation[] = [];
  if (total >= 3) {
    if (actualPercentages.Dispatch < 50) {
      violations.push({
        mode: "Dispatch",
        rule: "minimum",
        actualPercentage: actualPercentages.Dispatch,
        requiredPercentage: 50,
        differencePercentagePoints: 50 - actualPercentages.Dispatch,
        message: `Dispatch is ${Math.round(actualPercentages.Dispatch)}%, needs at least 50%.`,
      });
    }
    if (actualPercentages.Reflection > (100 / 3)) {
      violations.push({
        mode: "Reflection",
        rule: "maximum",
        actualPercentage: actualPercentages.Reflection,
        requiredPercentage: 100 / 3,
        differencePercentagePoints: actualPercentages.Reflection - (100 / 3),
        message: `Reflection is ${Math.round(actualPercentages.Reflection)}%, must be at most 33%.`,
      });
    }
  }
  return {
    legal: violations.length === 0,
    violations,
    total,
    counts,
    actualPercentages,
    targetPercentages: CONTENT_MODE_TARGETS,
  };
}

export function isLegalBatchMix(packages: Iterable<Pick<ContentPackage, "mode">>) {
  return getBatchMix(packages).legal;
}
