# Architecture

## System boundary

The engine has three operating surfaces:

1. **Repository:** canonical brand knowledge, generation rules, templates, optional sync runtime, and future design/export assets.
2. **Dashboard + Supabase:** saved-post review, verified source inventory, format-aware content production, and fixed-window performance evidence.
3. **Notion (optional mirror):** migration-period visibility for teams or workflows that still use it.

The repository remains the canonical brand logic. Supabase is the dashboard runtime store. Notion is not a runtime dependency.

## Data flow

```text
Lived experience / raw observation
              |
              v
Verified Mario source inventory (Supabase)
              |
              v
Goal + hooks + one test variable
              |
              v
Content Production (dashboard)
              |
       write / design / record / edit
              |
              v
Manual phone post + Instagram sync
              |
              v
Instagram -> TikTok / Shorts / Threads
              |
              v
24-hour and 7-day Performance Lab windows
              |
              v
Same-window signal + next controlled test
              |
              +------> Future hook decision
              +------> brand-knowledge/06_LEARNINGS_LEDGER.md only after repeated evidence
```

## Preserved from the source engine

- One unified project folder.
- Canonical source-of-truth and story-bank files.
- Skeleton-first generation so Mario speaks naturally rather than reads polished prose.
- Saved-content ingestion with local deduplication.
- Separate credentials and state per Instagram account.
- One-variable testing and batch-level review.
- HTML plus Playwright carousel export as a later production module.

## Adapted for the personal account

- The topic source is personal experience, not buyer pain or saved-post captions.
- The existing Content Production database replaces the old source engine's separate Content Ideas database.
- Publishing Calendar and Performance Lab remain views of Content Production.
- Hook Swipe File stores patterns and Mario adaptations, not wholesale copied ideas.
- The primary content formats are Yap Reel, Mini Story, POV / Realization, Carousel, Written Post, and Long-form.
- Primary themes are Reinvention, Identity, Standards, Action, Responsibility, Self-Respect, Perspective, and Life Story.

## Current guarded automation

- The daily metrics job captures only due 24-hour and 7-day owned-media windows.
- Meta-unavailable values remain blank and retry later because insights can lag.
- Fewer than five comparable same-goal windows produces only “Building baseline.”
- Carousel production hands complete copy to Canva; the dashboard never publishes it.
- Live source inventory comes from Supabase and never requires Notion.

## Deferred deliberately

- Twice-daily scheduled saves sync.
- Automatic cross-platform publishing.
- Comment mining.
- AI cover-image generation.
- Carousel rendering and asset hosting.

Each deferred component is reconsidered only after the manual version reveals a real bottleneck.
