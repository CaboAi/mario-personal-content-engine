import type { BrandSource, ContentMode } from "./domain";

export const DISPATCH_FRESHNESS_DAYS = 30;

type SourceEligibilityFields = Pick<
  BrandSource,
  "sourceType" | "retired" | "dispatchWhatHappened" | "dispatchSpecificDetail" |
  "dispatchDecision" | "dispatchOccurredOn" | "dispatchNextImplication" | "dispatchFreshnessDays"
>;

export function isFreshDispatchSource(source: Pick<SourceEligibilityFields, "sourceType" | "dispatchOccurredOn" | "dispatchFreshnessDays">, now = new Date()) {
  if (source.sourceType !== "Dispatch" || !source.dispatchOccurredOn) return false;
  const occurredAt = new Date(`${source.dispatchOccurredOn}T00:00:00.000Z`);
  if (Number.isNaN(occurredAt.getTime())) return false;
  const freshnessDays = source.dispatchFreshnessDays ?? DISPATCH_FRESHNESS_DAYS;
  return occurredAt.getTime() + freshnessDays * 86_400_000 >= now.getTime();
}

export function isSourceAvailableForPairing(source: Pick<SourceEligibilityFields, "sourceType" | "retired" | "dispatchOccurredOn" | "dispatchFreshnessDays">, now = new Date()) {
  return !source.retired && (source.sourceType !== "Dispatch" || isFreshDispatchSource(source, now));
}

export function assertSourceEligibleForMode(source: SourceEligibilityFields, mode: ContentMode, now = new Date()) {
  if (source.retired) {
    throw new Error("This Mario source is retired and cannot be used for generation. Capture a current source instead.");
  }
  if (mode === "Dispatch" && source.sourceType !== "Dispatch") {
    throw new Error("Dispatch mode requires a current Dispatch source.");
  }
  if (source.sourceType === "Dispatch") {
    if (!isFreshDispatchSource(source, now)) {
      throw new Error("This Dispatch source has expired and cannot be used for generation.");
    }
    if (mode === "Reflection") {
      throw new Error("Reflection mode cannot use a Dispatch source.");
    }
    const required = [
      source.dispatchWhatHappened,
      source.dispatchSpecificDetail,
      source.dispatchDecision,
      source.dispatchOccurredOn,
      source.dispatchNextImplication,
    ];
    if (required.some((value) => !value?.trim())) {
      throw new Error("This Dispatch source is missing required intake details.");
    }
  }
}
