import type { BrandSource, Pairing } from "./domain";
import { isSourceUsable } from "./brand-source-eligibility";

export const SOURCE_SELECTION_ROLES = [
  "Best structural fit",
  "Different Mario lens",
  "Credible wildcard",
] as const;

export type SourceSelectionRole = (typeof SOURCE_SELECTION_ROLES)[number];

export type PairingCandidate = Omit<
  Pairing,
  "id" | "recommended" | "selectionRole" | "fitScore"
> & {
  brandSourceId: string;
  sourceStatus: BrandSource["status"];
  fitScore: number;
  angleCategory:
    | "Lived story"
    | "Aggressive opinion"
    | "Identity reframe"
    | "Behavioral standard"
    | "Perspective shift"
    | "Practical action";
  usageCount: number;
  recommendationCount: number;
};

function normalizedScore(candidate: PairingCandidate) {
  return Math.max(0, Math.min(100, candidate.fitScore));
}

function stableCandidateOrder(a: PairingCandidate, b: PairingCandidate) {
  return (
    normalizedScore(b) - normalizedScore(a) ||
    a.recommendationCount - b.recommendationCount ||
    a.usageCount - b.usageCount ||
    a.sourceTitle.localeCompare(b.sourceTitle)
  );
}

function noveltyScore(candidate: PairingCandidate, selected: PairingCandidate[]) {
  const selectedPillars = new Set(selected.flatMap((item) => item.pillars ?? []));
  const hasNewPillar = (candidate.pillars ?? []).some((pillar) => !selectedPillars.has(pillar));
  const hasNewType = selected.every((item) => item.sourceType !== candidate.sourceType);
  const hasNewAngle = selected.every((item) => item.angleCategory !== candidate.angleCategory);

  return (
    normalizedScore(candidate) +
    (hasNewPillar ? 12 : 0) +
    (hasNewAngle ? 9 : 0) +
    (hasNewType ? 4 : 0) -
    Math.min(candidate.recommendationCount * 2, 10) -
    Math.min(candidate.usageCount, 6)
  );
}

/**
 * Selects up to three genuinely compatible sources without allowing novelty to
 * rescue a weak match. The 60-point floor is applied before diversity scoring.
 */
export function selectDiversePairings(candidates: PairingCandidate[]) {
  const bestBySource = new Map<string, PairingCandidate>();
  for (const candidate of candidates) {
    if (!isSourceUsable({
      ...candidate,
      retired: candidate.retired ?? false,
      status: candidate.sourceStatus,
    })) continue;
    if (normalizedScore(candidate) < 60) continue;
    const existing = bestBySource.get(candidate.brandSourceId);
    if (!existing || stableCandidateOrder(candidate, existing) < 0) {
      bestBySource.set(candidate.brandSourceId, candidate);
    }
  }

  const eligible = [...bestBySource.values()].sort(stableCandidateOrder);
  if (!eligible.length) return [];

  const selected: PairingCandidate[] = [eligible[0]];
  while (selected.length < 3) {
    const remaining = eligible.filter(
      (candidate) => !selected.some((item) => item.brandSourceId === candidate.brandSourceId),
    );
    if (!remaining.length) break;
    remaining.sort(
      (a, b) => noveltyScore(b, selected) - noveltyScore(a, selected) || stableCandidateOrder(a, b),
    );
    selected.push(remaining[0]);
  }

  return selected.map((candidate, index) => ({
    ...candidate,
    fitScore: normalizedScore(candidate),
    selectionRole: SOURCE_SELECTION_ROLES[index] as SourceSelectionRole,
    recommended: index === 0,
  }));
}
