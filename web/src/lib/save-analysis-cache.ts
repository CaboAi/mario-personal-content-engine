import type { SavedPost } from "./domain";

export function hasCachedAutomaticMediaAnalysis(save: Pick<SavedPost, "analysisMethod" | "analysisFrames" | "collectionPurpose" | "analysisFrameStats">) {
  if (save.analysisMethod !== "Automatic media inspection" || !save.analysisFrames?.length) return false;
  // An older lightweight reference analysis is deliberately refreshed once when a save is moved to Recreate.
  return save.collectionPurpose !== "recreate" || save.analysisFrameStats?.recreate === true;
}
