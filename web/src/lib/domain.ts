export type SaveStatus =
  | "New"
  | "Needs Review"
  | "Approved"
  | "Used"
  | "Ignored"
  | "Blocked";

export type ProductionStatus =
  | "Script Ready"
  | "Ready to Record"
  | "Recorded"
  | "Edited"
  | "Scheduled"
  | "Posted";

export type Pairing = {
  id: string;
  title: string;
  sourceType: "Story" | "Daily Entry" | "Existing Content";
  sourceTitle: string;
  sourceUrl?: string;
  rationale: string;
  direction: string;
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
  format: "Yap Reel" | "Mini Story" | "POV / Realization" | "Carousel" | "Written Post" | "Long-form";
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
  closingLine: string;
  cta?: string;
  caption?: string;
  carouselSlides: CarouselSlide[];
  instagramMediaId?: string;
  instagramPermalink?: string;
  mediaProductType?: string;
  postDate?: string;
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

export type CarouselPublication = {
  id: string;
  contentId: string;
  status: "Draft" | "Validated" | "Processing" | "Published" | "Failed";
  assetUrls: string[];
  altTexts: string[];
  caption: string;
  instagramMediaId?: string;
  instagramPermalink?: string;
  attemptCount: number;
  lastError?: string;
  publishedAt?: string;
  updatedAt: string;
};

export type DashboardData = {
  saves: SavedPost[];
  content: ContentPackage[];
  metrics: MetricSnapshot[];
  sources: BrandSourceInventory[];
  performanceReviews: PerformanceReview[];
  publications: CarouselPublication[];
  analyticsConnected: boolean;
  publishingConnected: boolean;
  liveMode: boolean;
};
