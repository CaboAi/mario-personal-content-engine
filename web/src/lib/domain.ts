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

export type Pairing = {
  id: string;
  brandSourceId?: string;
  title: string;
  sourceType: "Story" | "Daily Entry" | "Existing Content";
  sourceTitle: string;
  sourceUrl?: string;
  rationale: string;
  direction: string;
  coreTruth?: string;
  storyEvidence?: string;
  pillars?: string[];
  privacyStatus: "Clear" | "Needs confirmation";
  recommended?: boolean;
};

export type SavedPost = {
  id: string;
  author: string;
  shortcode: string;
  url: string;
  contentType: "Reel" | "Carousel" | "Post";
  caption: string;
  durationSeconds?: number;
  savedAt: string;
  status: SaveStatus;
  frameworkDna: string;
  hookMechanics: string;
  visualPacing: string;
  prohibitedTransfer: string[];
  inspectionNotes?: string;
  pairings: Pairing[];
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
};

export type BrandSourceInventory = BrandSource & {
  status: "Captured" | "Verified" | "Used" | "Retired";
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
  title: string;
  sourceSaveId?: string;
  sourceTitle: string;
  format: ContentFormat;
  goal: "Reach" | "Shares" | "Saves" | "Follows" | "Trust";
  pillars: string[];
  status: ProductionStatus;
  spokenHooks: string[];
  onScreenHooks: string[];
  selectedHook: string;
  selectedOnScreenHook: string;
  testVariable: "Hook" | "Topic" | "Length" | "Format" | "CTA" | "Visual" | "None";
  hypothesis: string;
  skeleton: string[];
  fullScript?: string;
  scriptRiskLines?: string[];
  closingLine: string;
  cta?: string;
  caption?: string;
  carouselSlides: CarouselSlide[];
  instagramMediaId?: string;
  instagramPermalink?: string;
  mediaProductType?: string;
  postDate?: string;
  archivedAt?: string | null;
  platforms: string[];
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
  metrics: MetricSnapshot[];
  sources: BrandSourceInventory[];
  performanceReviews: PerformanceReview[];
  instagramMedia: InstagramMediaItem[];
  accountTrends: InstagramAccountDaily[];
  analyticsConnected: boolean;
  liveMode: boolean;
};
