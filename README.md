# Mario Personal Content Engine

Instagram-first content operating system for [`@mario_polancojr`](https://www.instagram.com/mario_polancojr/).

The engine turns Mario's lived observations into differentiated personal-brand content, moves each piece through the private dashboard production system, and feeds comparable Instagram evidence into future hooks and formats.

## Core loop

1. Capture a lived observation, opinion, memory, tension, or story.
2. Choose one primary goal: Reach, Shares, Saves, Follows, or Trust.
3. Generate 3-5 spoken hooks and 2-3 on-screen hooks.
4. Choose one variable to test: Hook, Topic, Length, Format, CTA, or Visual.
5. Build one script around one idea.
6. Batch writing, recording, editing, and scheduling.
7. Publish on Instagram first; repurpose selectively.
8. Capture owned-media performance at fixed 24-hour and 7-day windows.
9. Compare same-goal, same-window evidence at the batch level.
10. Promote a durable learning only after repeated controlled evidence.

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

Saved-post analysis is dashboard-native and notes-optional. The local bridge temporarily inspects creator media, transcribes speech with Faster Whisper on Mario's computer, sends only derived evidence to the authenticated dashboard, and deletes the downloaded media. The saved creator supplies delivery mechanics only; verified Mario-owned sources supply every topic, story, claim, opinion, and lesson.

The live deployment checklist is in [`docs/VERCEL_DEPLOYMENT.md`](docs/VERCEL_DEPLOYMENT.md). Vercel must use `web` as the Root Directory; production secrets are configured in Vercel and remain out of the repository.

The dashboard now includes live Supabase source inventory, fixed-window Meta insight capture, manual post linking, and a Canva-first carousel production handoff. Carousels are designed in Canva and posted from the phone; the dashboard does not publish them to Meta. Notion remains an optional mirror and is not required for dashboard operation.

## Non-negotiable rule

Mario's stories and opinions create the topic. Saved content may contribute hook pacing, slide architecture, edit rhythm, or visual treatment only. A save never supplies the substance.
