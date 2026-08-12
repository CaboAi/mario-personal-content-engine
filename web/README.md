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

`Instagram Save → inspect delivery mechanics → choose one Mario source → choose output format → Production → publish/link → 24-hour + 7-day review`

Saved posts contribute delivery DNA only. A verified Mario source supplies the story, opinion, and lesson.
Analysis intentionally requires human-observed notes from the actual post; a Reel or Carousel is never analyzed from its caption alone.
The source and format are separate decisions: the selected source controls what the post is about; the selected format controls whether it becomes a Yap Reel, Mini Story, POV / Realization, Carousel, Written Post, or Long-form package.

Verified Mario-owned source material is copied into Supabase with `pnpm seed:sources`.
The seed is idempotent and the dashboard does not read Notion during analysis or generation.

## Performance and publishing

- The authenticated **Import existing posts** action imports Mario's published Instagram media, available lifetime media insights, and up to 90 days of available account-level series into Supabase. Re-running it is idempotent.
- Production is a phone-first active workbench. Marking an item `Posted` archives it from the default view; posted packages remain recoverable through the collapsed archive. No Instagram Media ID is required. The next Instagram sync brings phone-published posts into the existing-post library.
- Performance is separated into account trends, the existing-post baseline, dashboard experiments, and winners/patterns. Historical lifetime totals are never presented as retroactive 24-hour or 7-day snapshots.
- Edits-only Reel diagnostics—hook rate, skip rate, follower/non-follower split, and retention-curve notes—are entered manually per imported Reel. The dashboard does not infer them from views or average watch time.
- Existing legacy connections can retain comparable 24-hour and 7-day review windows, but the normal Production workflow does not ask Mario for an Instagram Media ID.
- The daily Vercel job captures due owned-media insights once Meta is configured. Missing Meta values remain unavailable and retry later; they are never converted to zero.
- A signal needs at least five comparable same-goal, same-window posts. A signal is a comparison, not a winner declaration or a durable brand learning.
- Carousel publishing requires 2–10 public HTTPS JPEG assets, matching alt text, validation, a human review checkbox, and an explicit publish click. The scheduler never publishes content automatically.
- The Brand System reads its live source inventory directly from Supabase. Notion is not required.
