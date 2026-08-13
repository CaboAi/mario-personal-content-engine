import type { ContentFormat } from "./domain";

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
  return format === "Yap Reel" || format === "Mini Story" ||
    format === "Written Post" || format === "Long-form";
}

export function fullDraftKind(format: ContentFormat) {
  return format === "Written Post" ? "written draft" : "script";
}

export function getFullDraftInstructions(format: ContentFormat) {
  switch (format) {
    case "Yap Reel":
      return "Write a complete short talk-to-camera script with natural spoken rhythm, one developed argument, Mario's receipt early, and no stage directions.";
    case "Mini Story":
      return "Write a complete scene-first spoken script. Preserve the event, felt experience, turn, and realization; do not open with the lesson.";
    case "Written Post":
      return "Write a complete written post, not a transcript. Use a personal receipt, developed interpretation, and a strong final thought.";
    case "Long-form":
      return "Write a complete, speakable long-form draft with a central argument, story spine, developed sections, complication, and honest resolution.";
    default:
      return "This format intentionally does not support a padded full draft.";
  }
}
