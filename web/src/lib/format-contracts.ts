import type { ContentFormat, ContentMode, ProductionStatus } from "./domain";

const reelStatuses: readonly ProductionStatus[] = [
  "Script Ready",
  "Ready to Record",
  "Recorded",
  "Edited",
  "Scheduled",
  "Posted",
];

const povStatuses: readonly ProductionStatus[] = [
  "Concept Ready",
  "Ready to Record",
  "Recorded",
  "Edited",
  "Scheduled",
  "Posted",
];

const carouselStatuses: readonly ProductionStatus[] = [
  "Copy Ready",
  "Designing in Canva",
  "Design Ready",
  "Posted",
];

const writingStatuses: readonly ProductionStatus[] = [
  "Outline Ready",
  "Drafting",
  "Final Copy",
  "Scheduled",
  "Posted",
];

const workflows: Record<ContentFormat, readonly ProductionStatus[]> = {
  "Yap Reel": reelStatuses,
  "Mini Story": reelStatuses,
  "POV / Realization": povStatuses,
  Carousel: carouselStatuses,
  "Written Post": writingStatuses,
  "Long-form": writingStatuses,
};

const legalFormats: Record<ContentMode, readonly ContentFormat[]> = {
  Dispatch: ["Yap Reel", "POV / Realization", "Carousel", "Written Post", "Long-form"],
  Practical: ["Yap Reel", "Carousel", "Written Post", "Long-form"],
  Reflection: ["Yap Reel", "Mini Story", "POV / Realization", "Written Post", "Long-form"],
};

const modeStructures: Record<ContentMode, string> = {
  Dispatch: "Build a Dispatch: hook with the concrete situation or real number, what Mario did, what actually happened, what he is changing, and what happens next. End on a result or decision that implies the next dispatch.",
  Practical: "Build a Practical piece: hook, the keepable artifact stated plainly, how to use it, and what it costs to ignore it. The artifact must be a list, question set, threshold, or rule. End on the rule, stated flat.",
  Reflection: "Build a Reflection: scene, what Mario believed then, what he did, what changed, and a dated claim. End on a claim, never on a feeling or uncertainty.",
};

const formatDelivery: Record<ContentFormat, string> = {
  "Yap Reel": "Use a direct talk-to-camera scaffold with Mario's receipt early. Target 30-45 seconds.",
  "Mini Story": "Use a retrospective, scene-first spoken scaffold. Target 30-45 seconds.",
  "POV / Realization": "Use a concise voiceover or direct-to-camera scaffold with simple B-roll direction. Target 30-45 seconds.",
  Carousel: "Use 2-10 slides with one screenshot-worthy idea per slide and a repeating visual spine.",
  "Written Post": "Use an ordered writing outline with Mario's receipt early; do not turn it into a transcript.",
  "Long-form": "Use a developed written outline with a central argument, story spine, distinct sections, and a counterpoint or complication.",
};

function assertLegalModeFormat(mode: ContentMode, format: ContentFormat) {
  if (!isLegalModeFormat(mode, format)) {
    throw new Error(`${mode} mode cannot use ${format}. Legal formats: ${getLegalFormats(mode).join(", ")}.`);
  }
}

export function getLegalFormats(mode: ContentMode): ContentFormat[] {
  return [...legalFormats[mode]];
}

export function isLegalModeFormat(mode: ContentMode, format: ContentFormat) {
  return legalFormats[mode].includes(format);
}

export function getFormatGenerationInstructions(mode: ContentMode, format: ContentFormat) {
  assertLegalModeFormat(mode, format);
  return `${modeStructures[mode]} ${formatDelivery[format]} Do not write a polished script in the initial package.`;
}

export function supportsFullDraft(format: ContentFormat) {
  return format === "Yap Reel" || format === "Mini Story" || format === "POV / Realization" ||
    format === "Written Post" || format === "Long-form";
}

export function fullDraftKind(format: ContentFormat) {
  return format === "Written Post" || format === "Long-form" ? "written draft" : "script";
}

export function productionStatusesFor(format: ContentFormat) {
  return workflows[format];
}

export function initialProductionStatus(format: ContentFormat): ProductionStatus {
  return workflows[format][0];
}

export function isProductionStatusForFormat(
  format: ContentFormat,
  status: ProductionStatus,
) {
  return workflows[format].includes(status);
}

export function getFullDraftInstructions(mode: ContentMode, format: ContentFormat) {
  assertLegalModeFormat(mode, format);
  const formatInstruction = format === "Yap Reel"
    ? "Write a complete short talk-to-camera script with natural spoken rhythm and no stage directions."
    : format === "Mini Story"
      ? "Write a complete scene-first spoken script; do not open with the claim."
      : format === "POV / Realization"
        ? "Write a brief, complete spoken script for voiceover or direct-to-camera; do not add a second argument, padded explanation, invented story, or stage directions."
        : format === "Written Post"
          ? "Write a complete written post, not a transcript."
          : "Write a complete long-form written piece, not a video transcript or spoken script.";
  return `${modeStructures[mode]} ${formatDelivery[format]} ${formatInstruction}`;
}
