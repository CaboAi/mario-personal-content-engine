# Mario Personal Content Engine

Instagram-first content operating system for [`@mario_polancojr`](https://www.instagram.com/mario_polancojr/).

The engine turns Mario's lived observations into differentiated personal-brand content, moves each piece through the existing Notion production system, and feeds real performance learnings back into future hooks and formats.

## Core loop

1. Capture a lived observation, opinion, memory, tension, or story.
2. Choose one primary goal: Reach, Shares, Saves, Follows, or Trust.
3. Generate 3-5 spoken hooks and 2-3 on-screen hooks.
4. Choose one variable to test: Hook, Topic, Length, Format, CTA, or Visual.
5. Build one script around one idea.
6. Batch writing, recording, editing, and scheduling.
7. Publish on Instagram first; repurpose selectively.
8. Log performance in Notion.
9. Identify winners and outliers at the batch level.
10. Feed one clear learning into the next batch.

## Architecture

- `brand-knowledge/`: canonical positioning, voice, stories, hooks, and learning ledger.
- `skills/`: portable assistant workflow for creating and reviewing content.
- `notion/`: the contract for the existing Content Operating System.
- `runtime/`: scheduled Instagram-saves ingestion at 9 AM and 9 PM.
- `web/`: private Vercel/Supabase dashboard for review, generation, production, and analytics.
- `templates/`: repeatable content and review records.
- `docs/`: architecture and implementation decisions.

## Current status

The private dashboard is live at `https://mario-personal-content-engine.vercel.app`, backed by Supabase, protected by a dashboard password, and connected to server-side OpenAI generation. The repository contains no committed credentials.

The local bridge writes normalized saves to the dashboard without sending Instagram cookies to the cloud; Notion is an optional independent mirror. The canonical `MarioPersonalInstagramSavesSync` Windows task runs at 9 AM and 9 PM and supports the configured collection, including a local-filter fallback when Instagram's direct collection feed returns 404.

The live deployment checklist is in [`docs/VERCEL_DEPLOYMENT.md`](docs/VERCEL_DEPLOYMENT.md). Vercel must use `web` as the Root Directory; production secrets are configured in Vercel and remain out of the repository.

## Non-negotiable rule

Mario's stories and opinions create the topic. Saved content may contribute hook pacing, slide architecture, edit rhythm, or visual treatment only. A save never supplies the substance.
