# Architecture

## System boundary

The engine has two operating surfaces:

1. **Repository:** canonical brand knowledge, generation rules, templates, optional sync runtime, and future design/export assets.
2. **Notion:** daily capture, production state, publishing schedule, hooks, performance data, and weekly review.

The repository should not become a second content tracker. Notion should not become the only copy of the brand logic.

## Data flow

```text
Lived experience / raw observation
              |
              v
Daily Entries & Content (Notion)
              |
              v
Goal + hooks + one test variable
              |
              v
Content Production (Notion)
              |
       script / record / edit
              |
              v
Publishing Calendar view
              |
              v
Instagram -> TikTok / Shorts / Threads
              |
              v
Performance Lab view
              |
              v
Winner explanation + next test
              |
              +------> Hook Swipe File
              +------> brand-knowledge/06_LEARNINGS_LEDGER.md
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

## Deferred deliberately

- Twice-daily scheduled saves sync.
- Automated winner scoring.
- Automatic cross-platform publishing.
- Comment mining.
- AI cover-image generation.
- Carousel rendering and export.

Each deferred component is reconsidered only after the manual version reveals a real bottleneck.
