import type { ContentPackage, DashboardData, SavedPost } from "./domain";

export const demoSave: SavedPost = {
  id: "save-higherupwellness-dbeu0nrjb1p",
  author: "higherupwellness",
  shortcode: "Dbeu0NRJB1P",
  url: "https://www.instagram.com/reel/Dbeu0NRJB1P/",
  contentType: "Reel",
  caption: "Listen.",
  durationSeconds: 37,
  savedAt: "2026-08-11T20:16:00.000Z",
  status: "Needs Review",
  frameworkDna:
    "Blunt social observation, competitive reframe, repeated escalation, then a direct closing claim. One continuous argument with no story detour.",
  hookMechanics:
    "An absolute behavioral observation creates tension immediately. The difficulty is then reframed as an advantage because most people stop.",
  visualPacing:
    "Raw close-up selfie monologue, one setting, minimal polish, tiny centered captions, steady escalation, and no visible CTA.",
  prohibitedTransfer: [
    "The creator's quitting and competition topic",
    "The creator's wording or personal claims",
    "Comments as evidence for Mario's beliefs",
  ],
  pairings: [
    {
      id: "pairing-ready",
      title: "Readiness is not permission",
      sourceType: "Existing Content",
      sourceTitle: "You'll Never Be Ready",
      sourceUrl: "https://app.notion.com/p/3b4714e215bf818796f1e378d1453568",
      rationale:
        "Mario already has a public receipt: moving to Mexico, starting over, and leaving what he built while scared.",
      direction:
        "Use the saved Reel's raw opinion ladder to open on readiness, prove it with the Mexico receipt, escalate the cost of waiting, and finish on a behavioral standard.",
      privacyStatus: "Clear",
      recommended: true,
    },
    {
      id: "pairing-hidden",
      title: "Silence does not protect you",
      sourceType: "Daily Entry",
      sourceTitle: "What stays hidden becomes insecurity",
      sourceUrl: "https://app.notion.com/3ac714e215bf819fbaf2e909feb578f3",
      rationale:
        "The direct escalation can move from concealment to compounding fear and finally to honest conversation.",
      direction:
        "Open with the hard interpretation of silence, use Mario's conversation as the receipt, and close on directness as self-respect.",
      privacyStatus: "Needs confirmation",
    },
    {
      id: "pairing-expiration",
      title: "Urgent is not always important",
      sourceType: "Daily Entry",
      sourceTitle: "Some moments have an expiration date",
      sourceUrl: "https://app.notion.com/3ad714e215bf81f59c76eed5b84db7c0",
      rationale:
        "The delivery can turn a quiet personal choice into a firm opinion about confusing productivity with responsibility.",
      direction:
        "Start with the guilt of unfinished work, use the ordinary day as proof, and close on what cannot be recreated.",
      privacyStatus: "Needs confirmation",
    },
  ],
};

export const generatedDemoPackage: ContentPackage = {
  id: "content-readiness-is-a-decision",
  title: "Readiness Is a Decision",
  sourceSaveId: demoSave.id,
  sourceTitle: "You'll Never Be Ready",
  format: "Yap Reel",
  goal: "Trust",
  pillars: ["Reinvention", "Action"],
  status: "Script Ready",
  spokenHooks: [
    "Nobody feels ready to blow up the life they already built.",
    "I moved to Mexico before I felt ready. That's the point.",
    "Waiting to feel ready is how people stay in lives they already know are over.",
    "Readiness is the excuse fear uses when it wants more time.",
  ],
  onScreenHooks: [
    "YOU WON'T FEEL READY",
    "I MOVED ANYWAY",
    "READINESS IS A DECISION",
  ],
  selectedHook:
    "Waiting to feel ready is how people stay in lives they already know are over.",
  selectedOnScreenHook: "YOU WON'T FEEL READY",
  testVariable: "Visual",
  hypothesis:
    "If Mario delivers the argument in an intimate, low-edit close-up, average watch time should improve because the visual feels immediate and personally addressed.",
  skeleton: [
    "Open on the years spent treating readiness like permission.",
    "Receipt: moving to Mexico, leaving what was built, and starting over while still scared.",
    "Name the old belief: certainty was supposed to arrive before action.",
    "Turn: the decisions that matter rarely feel safe first.",
    "Opinion: waiting is still a decision, and it usually protects the life you already said you wanted to leave.",
  ],
  closingLine: "Readiness isn't a feeling. It's a decision.",
  carouselSlides: [],
  platforms: ["Instagram"],
  createdAt: "2026-08-11T21:00:00.000Z",
};

export const demoData: DashboardData = {
  saves: [demoSave],
  content: [],
  metrics: [],
  sources: [],
  performanceReviews: [],
  instagramMedia: [],
  accountTrends: [],
  analyticsConnected: false,
  liveMode: false,
};
