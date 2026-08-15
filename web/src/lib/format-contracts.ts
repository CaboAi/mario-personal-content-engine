import type { ContentFormat, ProductionStatus } from "./domain";

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

const instructions: Record<ContentFormat, string> = {
  "Yap Reel": "Build a talk-to-camera scaffold for one developed argument: personal tension or opinion first, Mario's receipt early, broader takeaway, and a strong closing line. Do not write a polished script in the initial package.",
  "Mini Story": "Build a scene-first story scaffold: observable moment, felt experience, choice or turn, what changed, and one earned realization. Never open with the lesson. Do not write a polished script in the initial package.",
  "POV / Realization": "Build a deliberately lightweight Reel: one sendable on-screen realization, simple B-roll direction, optional short caption, and no padded script. Keep the scaffold concise.",
  Carousel: "Build a visual essay with 2-10 slides: cover hook, one screenshot-worthy idea per slide, a repeating visual spine, payoff, and a final save/share line that does not weaken the ending.",
  "Written Post": "Build an ordered writing outline for a complete thought: tension first, Mario's receipt early, developed interpretation, and a strong final thought. Do not turn it into a transcript.",
  "Long-form": "Build a developed long-form outline: central question or argument, Mario's story spine, distinct developed sections, a counterpoint or complication, and an honest resolution. Earn the length; do not insert short-Reel production directions.",
};

export function getFormatGenerationInstructions(format: ContentFormat) {
  return instructions[format];
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

export function getFullDraftInstructions(format: ContentFormat) {
  switch (format) {
    case "Yap Reel":
      return "Write a complete short talk-to-camera script with natural spoken rhythm, one developed argument, Mario's receipt early, and no stage directions.";
    case "Mini Story":
      return "Write a complete scene-first spoken script. Preserve the event, felt experience, turn, and realization; do not open with the lesson.";
    case "POV / Realization":
      return "Write a brief, complete spoken script for this lightweight POV Reel. Build only enough around the single realization to make it easy to record as voiceover or direct-to-camera. Keep the sendable line central; do not add a second argument, padded explanation, invented story, or stage directions.";
    case "Written Post":
      return "Write a complete written post, not a transcript. Use a personal receipt, developed interpretation, and a strong final thought.";
    case "Long-form":
      return "Write a complete long-form written piece, not a video transcript or spoken script. Develop the central argument, story spine, distinct sections, complication, and honest resolution in durable prose.";
    default:
      return "This format intentionally does not support a padded full draft.";
  }
}
