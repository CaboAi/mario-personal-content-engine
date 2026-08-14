import type { ContentPackage } from "./domain";

const GENERIC_SINGLE_WORDS = new Set([
  "action",
  "advice",
  "change",
  "content",
  "creator",
  "identity",
  "lesson",
  "life",
  "post",
  "reel",
  "story",
  "video",
]);

function normalize(value: string) {
  return value
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

export function findCreatorTopicLeaks(text: string, creatorTopicTerms: string[]) {
  const normalizedText = ` ${normalize(text)} `;
  return creatorTopicTerms.filter((term) => {
    const normalizedTerm = normalize(term);
    if (!normalizedTerm) return false;
    const wordCount = normalizedTerm.split(" ").length;
    if (wordCount === 1 && (normalizedTerm.length < 6 || GENERIC_SINGLE_WORDS.has(normalizedTerm))) {
      return false;
    }
    return normalizedText.includes(` ${normalizedTerm} `);
  });
}

export function assertTopicNeutralDelivery(
  delivery: { frameworkDna: string; hookMechanics: string; visualPacing: string },
  creatorTopicTerms: string[],
) {
  const leaks = findCreatorTopicLeaks(
    `${delivery.frameworkDna}\n${delivery.hookMechanics}\n${delivery.visualPacing}`,
    creatorTopicTerms,
  );
  if (leaks.length) {
    throw new Error(`Delivery analysis still contains quarantined creator substance: ${leaks.join(", ")}.`);
  }
}

export function contentPackageText(content: Omit<ContentPackage, "id" | "sourceSaveId" | "sourceTitle" | "status" | "platforms" | "createdAt">) {
  return [
    content.title,
    ...content.spokenHooks,
    ...content.onScreenHooks,
    ...content.skeleton,
    content.closingLine,
    content.cta ?? "",
    content.caption ?? "",
    ...content.carouselSlides.flatMap((slide) => [slide.headline, slide.body]),
  ].join("\n");
}
