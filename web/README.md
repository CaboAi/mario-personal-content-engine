# Mario Content Engine web application

Private Next.js dashboard for Mario's saved-post review, brand-safe content generation, production workflow, and Instagram analytics.

## Local start

1. Copy `.env.example` to `.env.local`.
2. Add a dashboard password and a long random session secret.
3. Apply every migration in `supabase/migrations/` in numeric order.
4. Add the Supabase URL, server secret key, OpenAI API key, and ingestion secret.
5. Run `npm run dev`.

Without Supabase credentials, the application intentionally opens in demonstration mode with the first analyzed Instagram save. Authentication is skipped only in local development when no dashboard password is configured.

## Deploy to Vercel

Deploy this directory as the Vercel project root. If importing the full repository, set the Vercel **Root Directory** to `web`. Use pnpm and add the required secrets in Vercel rather than committing an `.env` file.

The complete environment-variable checklist, deployment flow, local bridge handoff, health check, and rollback procedure are in [`../docs/VERCEL_DEPLOYMENT.md`](../docs/VERCEL_DEPLOYMENT.md).

## Security boundaries

- Instagram session cookies stay in the local Python bridge.
- The browser never receives the Supabase server secret key or OpenAI API key.
- The local bridge authenticates to `/api/ingest` using `INGESTION_SECRET`.
- Production deployments require the dashboard password and session secret.
- Database tables have RLS enabled and are server-only in the MVP.

## Workflow

`Instagram Save → inspect delivery mechanics → choose one Mario source → choose output format → Production → post from phone → Instagram sync → performance review`

Saved posts contribute delivery DNA only. A verified Mario source supplies the story, opinion, and lesson.
Analysis intentionally requires human-observed notes from the actual post; a Reel or Carousel is never analyzed from its caption alone.
The source and format are separate decisions: the selected source controls what the post is about; the selected format controls whether it becomes a Yap Reel, Mini Story, POV / Realization, Carousel, Written Post, or Long-form package.

Verified Mario-owned source material is copied into Supabase with `pnpm seed:sources`.
The seed is idempotent and the dashboard does not read Notion during analysis or generation. The initial inventory is sourced from `brand-knowledge/05_STORY_BANK.md` (including its Daily Entry receipts) and Mario's existing Content Production database. Only developed material that Mario already authored is marked `Clear` + `Verified`; privacy-sensitive Story Bank entries remain unavailable until Mario confirms them. The Brand System shows each source's origin so the inventory is auditable.

## Performance and publishing

- The authenticated **Import existing posts** action imports Mario's published Instagram media, available lifetime media insights, and up to 90 days of available account-level series into Supabase. Re-running it is idempotent.
- Production is a phone-first, one-project-at-a-time workbench. Marking an item `Posted` archives it from the default view; **Remove from Production** parks an unfinished draft in a recoverable archive. No Instagram Media ID is required. The next Instagram sync brings phone-published posts into the existing-post library and, when the caption provides enough evidence, proposes a dashboard-package match for Mario to confirm.
- Every Production package separately names its **Mario-owned substance** and its **delivery influence from Saves Inbox**, including the saved creator, original post link, and the exact framework, hook, and visual mechanics that were adapted. Saved creators never supply the topic or message.
- Yap Reels, Mini Stories, Written Posts, and Long-form packages offer an optional persisted full script or written draft when the scaffold is not enough. The draft is generated only on request from the same Clear + Verified Mario source. POV / Realization stays intentionally lightweight, and Carousel packages use their complete slide copy instead of padded scripts.
- Performance is separated into account trends, the existing-post baseline, dashboard experiments, and winners/patterns. Historical lifetime totals are never presented as retroactive 24-hour or 7-day snapshots.
- Edits-only Reel diagnostics—hook rate, skip rate, follower/non-follower split, and retention-curve notes—are entered manually per imported Reel. The dashboard does not infer them from views or average watch time.
- Existing legacy connections can retain comparable 24-hour and 7-day review windows, but the normal Production workflow does not ask Mario for an Instagram Media ID.
- The daily Vercel job captures due owned-media insights once Meta is configured. Missing Meta values remain unavailable and retry later; they are never converted to zero.
- A signal needs at least five comparable same-goal, same-window posts. A signal is a comparison, not a winner declaration or a durable brand learning.
- Carousel packages move through `Copy Ready → Designing in Canva → Design Ready → Posted`. The Canva handoff copies the complete slide sequence and caption, keeps draft alt text visible for final review, and provides a short design/export checklist. The normal dashboard workflow does not upload carousel assets or publish them to Meta.
- The Brand System reads its live source inventory directly from Supabase. Notion is not required.
