export type SaveStatus =
  | "New"
  | "Needs Review"
  | "Approved"
  | "Used"
  | "Ignored"
  | "Blocked";

export const PRODUCTION_STATUSES = [
  "Concept Ready",
  "Script Ready",
  "Ready to Record",
  "Recorded",
  "Edited",
  "Scheduled",
  "Outline Ready",
  "Drafting",
  "Final Copy",
  "Copy Ready",
  "Designing in Canva",
  "Design Ready",
  "Posted",
] as const;

export type ProductionStatus = (typeof PRODUCTION_STATUSES)[number];

export type ContentFormat =
  | "Yap Reel"
  | "Mini Story"
  | "POV / Realization"
  | "Carousel"
  | "Written Post"
  | "Long-form";

export type ContentMode = "Dispatch" | "Practical" | "Reflection";

export type BrandSourceType = "Story" | "Daily Entry" | "Existing Content" | "Dispatch";

export type Pairing = {
  id: string;
  brandSourceId?: string;
  title: string;
  sourceType: BrandSourceType;
  sourceTitle: string;
  sourceUrl?: string;
  rationale: string;
  direction: string;
  coreTruth?: string;
  storyEvidence?: string;
  pillars?: string[];
  retired?: boolean;
  dispatchOccurredOn?: string;
  dispatchFreshnessDays?: number;
  privacyStatus: "Clear" | "Needs confirmation";
  recommended?: boolean;
  selectionRole?: "Best structural fit" | "Different Mario lens" | "Credible wildcard";
  fitScore?: number;
};

export type SavedPost = {
  id: string;
  author: string;
  shortcode: string;
  url: string;
  contentType: "Reel" | "Carousel" | "Post";
  caption: string;
  durationSeconds?: number;
  collectionIds?: string[];
  collectionLabels?: string[];
  collectionPurpose?: "reference" | "recreate";
  savedAt: string;
  status: SaveStatus;
  frameworkDna: string;
  hookMechanics: string;
  visualPacing: string;
  prohibitedTransfer: string[];
  creatorTopicTerms?: string[];
  analysisMethod?: "Automatic media inspection" | "Caption and optional context" | "Manual inspection";
  analysisEvidenceSummary?: string;
  inspectionNotes?: string;
  analysisTranscript?: string;
  analysisFrames?: VisualFrame[];
  analysisDurationSeconds?: number;
  analysisCutCount?: number;
  analysisFrameStats?: { frameCount?: number; highDetailCount?: number; lowDetailCount?: number; cacheHit?: boolean; recreate?: boolean };
  shotPlan?: ShotPlan;
  shotPlanSourceId?: string;
  shotPlanGeneratedAt?: string;
  pairings: Pairing[];
};

export type VisualFrameKind = "opening" | "post-cut" | "closing" | "fill";
export type VisualFrame = { label: string; dataUrl: string; timestampSeconds: number; kind: VisualFrameKind };
export type ShotBeatFunction = "hook" | "bind" | "turn" | "proof" | "pivot" | "CTA";
export type ShotType = "talking head" | "B-roll" | "screen recording" | "cutaway" | "walking" | "static";
export type ShotFraming = "close" | "medium" | "wide";
export type TextPosition = "none" | "top" | "center" | "bottom";
export type ShotPlan = {
  totalRuntimeSeconds: number;
  pacingNote: string;
  beats: Array<{ beatFunction: ShotBeatFunction; startSeconds: number; durationSeconds: number; wordCount: number; sentenceType: "question" | "imperative" | "declarative" | "fragment"; directAddress: boolean; brief: string; candidateLines: string[]; draftLine: string; shotType: ShotType; framing: ShotFraming; onScreenText: { text: string; position: TextPosition; timing: string } | null }>;
  productionChecklist: string[];
  lineReplacementMap: Array<{ beatFunction: ShotBeatFunction; structuralRole: string; marioReplacementLine: string }>;
};

export type BrandSource = {
  id: string;
  sourceType: Pairing["sourceType"];
  title: string;
  coreTruth: string;
  storyEvidence: string;
  privacyStatus: Pairing["privacyStatus"];
  pillars: string[];
  sourceUrl?: string;
  retired: boolean;
  dispatchWhatHappened?: string;
  dispatchSpecificDetail?: string;
  dispatchDecision?: string;
  dispatchOccurredOn?: string;
  dispatchNextImplication?: string;
  dispatchFreshnessDays?: number;
  status: "Captured" | "Verified" | "Used" | "Retired";
};

export type BrandSourceInventory = BrandSource & {
  sourceExternalId?: string;
  createdAt?: string;
  updatedAt: string;
  usageCount: number;
};

export type CarouselSlide = {
  headline: string;
  body: string;
  altText: string;
};

export type ContentPackage = {
  id: string;
  batchId?: string;
  title: string;
  sourceSaveId?: string;
  sourceTitle: string;
  sourceReference?: string;
  format: ContentFormat;
  mode: ContentMode;
  goal: "Reach" | "Shares" | "Saves" | "Follows" | "Trust";
  pillars: string[];
  status: ProductionStatus;
  spokenHooks: string[];
  onScreenHooks: string[];
  selectedHook: string;
  selectedOnScreenHook: string;
  hookRationale?: string;
  testVariable: "Hook" | "Topic" | "Length" | "Format" | "CTA" | "Visual" | "None";
  hypothesis: string;
  skeleton: string[];
  fullScript?: string;
  scriptRiskLines?: string[];
  closingLine: string;
  cta?: string;
  caption?: string;
  carouselSlides: CarouselSlide[];
  productionNotes?: string;
  privacyNotes?: string;
  publicationClearance?: boolean;
  instagramMediaId?: string;
  instagramPermalink?: string;
  mediaProductType?: string;
  postDate?: string;
  plannedFor?: string;
  archivedAt?: string | null;
  platforms: string[];
  createdAt: string;
};

export type ContentBatch = {
  id: string;
  title: string;
  description: string;
  sourceUrl?: string;
  timezone: string;
  startsOn?: string;
  endsOn?: string;
  createdAt: string;
};

export type MetricSnapshot = {
  contentId: string;
  capturedAt: string;
  reviewWindowHours: number;
  views?: number;
  reach?: number;
  averageWatchSeconds?: number;
  likes?: number;
  comments?: number;
  shares?: number;
  saves?: number;
  follows?: number;
  mediaProductType?: string;
};

export type PerformanceReview = {
  id: string;
  contentId: string;
  reviewWindowHours: 24 | 168;
  dueAt: string;
  status: "Pending" | "Complete" | "Failed";
  primaryMetric?: string;
  primaryValue?: number;
  comparableCount: number;
  signal?: string;
  observation?: string;
  nextTest?: string;
  analyzedAt?: string;
  lastError?: string;
};

export type InstagramMediaItem = {
  id: string;
  instagramMediaId: string;
  contentId?: string;
  caption?: string;
  mediaType?: string;
  mediaProductType?: string;
  permalink?: string;
  thumbnailUrl?: string;
  postedAt: string;
  views?: number;
  reach?: number;
  averageWatchSeconds?: number;
  totalWatchSeconds?: number;
  likes?: number;
  comments?: number;
  shares?: number;
  saves?: number;
  follows?: number;
  totalInteractions?: number;
  reposts?: number;
  hookRate?: number;
  skipRate?: number;
  followerViewPercentage?: number;
  nonFollowerViewPercentage?: number;
  retentionNotes?: string;
  retentionCurve?: Array<{ second: number; retention: number }>;
  lastSyncedAt: string;
  editsUpdatedAt?: string;
  suggestedContentId?: string;
  suggestedContentTitle?: string;
  matchConfidence?: number;
  matchReason?: string;
  dismissedContentId?: string;
};

export type InstagramAccountDaily = {
  metricDate: string;
  reach?: number;
  views?: number;
  profileViews?: number;
  followerCount?: number;
  accountsEngaged?: number;
  totalInteractions?: number;
  likes?: number;
  comments?: number;
  shares?: number;
  saves?: number;
  lastSyncedAt: string;
};

export type DashboardData = {
  saves: SavedPost[];
  content: ContentPackage[];
  batches: ContentBatch[];
  metrics: MetricSnapshot[];
  sources: BrandSourceInventory[];
  performanceReviews: PerformanceReview[];
  instagramMedia: InstagramMediaItem[];
  accountTrends: InstagramAccountDaily[];
  analyticsConnected: boolean;
  liveMode: boolean;
};
