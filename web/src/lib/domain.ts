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
};

export type DashboardData = {
  saves: SavedPost[];
  content: ContentPackage[];
  metrics: MetricSnapshot[];
  analyticsConnected: boolean;
  liveMode: boolean;
};
