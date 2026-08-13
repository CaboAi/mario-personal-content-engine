export type InstagramMatchCandidate = {
  id: string;
  title: string;
  format?: string | null;
  caption?: string | null;
  selectedHook?: string | null;
  selectedOnScreenHook?: string | null;
  closingLine?: string | null;
  skeleton?: string[] | null;
  instagramMediaId?: string | null;
};

export type InstagramMatchInput = {
  caption?: string | null;
  mediaType?: string | null;
  mediaProductType?: string | null;
  dismissedContentId?: string | null;
};

export type InstagramContentMatch = {
  contentId: string;
  confidence: number;
  reason: string;
};

export function resolveInstagramMatchSuggestion(
  confirmedContentId: string | null,
  computed: InstagramContentMatch | null,
  existing?: {
    suggestedContentId?: string | null;
    matchConfidence?: number | null;
    matchReason?: string | null;
  },
) {
  if (confirmedContentId) {
    return { suggestedContentId: null, matchConfidence: null, matchReason: null };
  }
  if (computed) {
    return {
      suggestedContentId: computed.contentId,
      matchConfidence: computed.confidence,
      matchReason: computed.reason,
    };
  }
  if (!existing?.suggestedContentId) {
    return { suggestedContentId: null, matchConfidence: null, matchReason: null };
  }
  return {
    suggestedContentId: existing.suggestedContentId,
    matchConfidence: existing.matchConfidence ?? null,
    matchReason: existing.matchReason ?? null,
  };
}

const STOP_WORDS = new Set([
  "about", "after", "again", "also", "and", "are", "because", "been", "before", "being",
  "but", "can", "could", "did", "does", "doing", "for", "from", "had", "has", "have",
  "how", "into", "its", "just", "more", "not", "now", "of", "on", "or", "our", "out",
  "so", "some", "than", "that", "the", "their", "them", "then", "there", "these", "they",
  "this", "through", "too", "very", "was", "we", "were", "what", "when", "where", "which",
  "who", "why", "will", "with", "would", "you", "your", "youre",
]);

function normalize(value: string) {
  return value
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/https?:\/\/\S+/g, " ")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

function meaningfulTokens(value: string) {
  return Array.from(new Set(normalize(value).split(/\s+/).filter(
    (token) => token.length >= 3 && !STOP_WORDS.has(token),
  )));
}

function fieldSimilarity(mediaCaption: string, candidateText: string) {
  const mediaNormalized = normalize(mediaCaption);
  const candidateNormalized = normalize(candidateText);
  const mediaTokens = meaningfulTokens(mediaCaption);
  const candidateTokens = meaningfulTokens(candidateText);
  if (!candidateNormalized || !mediaTokens.length || !candidateTokens.length) {
    return { score: 0, shared: 0, exact: false };
  }

  const mediaSet = new Set(mediaTokens);
  const shared = candidateTokens.filter((token) => mediaSet.has(token)).length;
  const exact = candidateTokens.length >= 3 && candidateNormalized.length >= 12 &&
    mediaNormalized.includes(candidateNormalized);
  if (!exact && shared < 2) return { score: 0, shared, exact };

  const containment = shared / Math.min(mediaTokens.length, candidateTokens.length);
  const union = new Set([...mediaTokens, ...candidateTokens]).size;
  const jaccard = union ? shared / union : 0;
  return {
    score: exact ? 1 : 0.72 * containment + 0.28 * jaccard,
    shared,
    exact,
  };
}

function formatFits(input: InstagramMatchInput, format?: string | null) {
  const product = `${input.mediaProductType ?? ""} ${input.mediaType ?? ""}`.toUpperCase();
  if (product.includes("REEL") || product.includes("VIDEO")) {
    return format === "Yap Reel" || format === "Mini Story" || format === "POV / Realization";
  }
  if (product.includes("CAROUSEL")) return format === "Carousel";
  if (product.includes("IMAGE")) return format === "Written Post" || format === "POV / Realization";
  return false;
}

const matchFields = [
  { key: "caption", label: "generated caption", weight: 1 },
  { key: "selectedHook", label: "selected spoken hook", weight: 0.94 },
  { key: "selectedOnScreenHook", label: "selected on-screen hook", weight: 0.9 },
  { key: "closingLine", label: "closing line", weight: 0.82 },
  { key: "title", label: "working title", weight: 0.78 },
] as const;

export function suggestInstagramContentMatch(
  input: InstagramMatchInput,
  candidates: InstagramMatchCandidate[],
): InstagramContentMatch | null {
  const caption = input.caption?.trim();
  if (!caption) return null;

  const ranked = candidates
    .filter((candidate) => !candidate.instagramMediaId)
    .filter((candidate) => candidate.id !== input.dismissedContentId)
    .map((candidate) => {
      const evidenceInputs: Array<{
        score: number;
        shared: number;
        exact: boolean;
        label: string;
        weight: number;
      }> = matchFields.map((field) => ({
        ...fieldSimilarity(caption, candidate[field.key] ?? ""),
        label: field.label,
        weight: field.weight,
      }));
      evidenceInputs.push({
        ...fieldSimilarity(caption, candidate.skeleton?.join(" ") ?? ""),
        label: "recording prompts",
        weight: 0.68,
      });
      const evidence = evidenceInputs.map((item) => ({
        ...item,
        weightedScore: item.score * item.weight,
      }));
      evidence.sort((a, b) => b.weightedScore - a.weightedScore);
      const best = evidence[0];
      const corroboration = evidence.slice(1).some((item) => item.weightedScore >= 0.34) ? 0.05 : 0;
      const formatBonus = formatFits(input, candidate.format) ? 0.03 : 0;
      const confidence = Math.min(0.99, best.weightedScore + corroboration + formatBonus);
      return { candidate, best, confidence };
    })
    .filter((result) => result.confidence >= 0.46)
    .sort((a, b) => b.confidence - a.confidence || a.candidate.id.localeCompare(b.candidate.id));

  const winner = ranked[0];
  if (!winner) return null;
  const confidence = Math.round(winner.confidence * 100) / 100;
  const quality = winner.best.exact ? "contains" : "overlaps";
  return {
    contentId: winner.candidate.id,
    confidence,
    reason: `Instagram caption ${quality} the package's ${winner.best.label} (${winner.best.shared} distinctive terms).`,
  };
}
