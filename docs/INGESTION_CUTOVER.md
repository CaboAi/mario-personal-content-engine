# Instagram saves ingestion cutover

This bridge keeps Instagram authentication on Mario's Windows computer. It reads the configured saved-post collection and can write each normalized save to either or both independent destinations:

1. The deployed private dashboard at `/api/ingest` (the primary destination).
2. The existing Notion staging data source (an optional transition mirror).

Supabase is the dashboard source of truth. Notion is not required for dashboard ingestion. Instagram session cookies must never be added to Vercel, Supabase, source control, screenshots, or chat.

## Automatic saved-post inspection

The local bridge performs the private-media portion of save analysis:

1. Instagram returns a temporary CDN asset URL to the authenticated local bridge.
2. The bridge downloads that asset into an operating-system temporary directory.
3. Faster Whisper transcribes video speech locally. The bridge also records mechanical video evidence such as orientation, duration, activity, and sampled visual transitions.
4. Only the transcript and derived observations are sent to the authenticated dashboard analysis endpoint.
5. Temporary creator media is deleted as soon as inspection finishes. Raw media URLs, files, Instagram cookies, and full transcripts are never stored in Supabase.
6. The dashboard quarantines creator-topic terms, saves a topic-neutral delivery blueprint, and ranks three deliberately different Mario-owned directions.

`whisper_model` defaults to `small.en`. Model files live under `runtime/.models/` and are excluded from Git. The first inspection downloads the selected model once; later runs reuse the local copy.

Automatic media inspection is consent-gated. It remains off unless the private local `runtime/config.json` explicitly contains `"enable_automatic_media_analysis": true`. Enable it only after approving the temporary transcript and derived inspection evidence transfer to the existing dashboard/OpenAI analysis service.

## Before the first live run

1. Confirm the dashboard is deployed and its health check succeeds.
2. Create one random ingestion secret containing at least 32 characters.
3. Store that same value in two places only:
   - Vercel environment variable `INGESTION_SECRET`.
   - Local `runtime/config.json` property `dashboard_ingestion_secret`.
4. Set `dashboard_ingest_url` to the production URL ending in `/api/ingest`, for example:

   ```json
   "dashboard_ingest_url": "https://YOUR-APP.vercel.app/api/ingest"
   ```

5. Leave `notion_token` and `notion_saves_data_source_id` blank or omit both for dashboard-only operation. Set both only when the optional Notion mirror is wanted.
6. Refresh the Instagram session cookies before cutover if they were previously shared or exposed.
7. Confirm `runtime/config.json`, `runtime/state.json`, and `runtime/sync.log` remain excluded by `.gitignore`.

Do not paste any token, cookie, database password, or ingestion secret into a terminal command. Secrets belong in the local configuration file or the deployment environment only.

## How deduplication and recovery work

`runtime/state.json` contains separate success lists:

- `synced_ids`: posts accepted by Notion.
- `dashboard_synced_ids`: posts accepted by the dashboard.

A post is added to a destination's list only after that destination succeeds. Each successful ID is saved atomically immediately, which narrows the duplicate window if Windows restarts mid-run. A dashboard failure does not erase or repeat successful Notion work, and a Notion failure does not block a later dashboard retry.

Dashboard requests retry transient network errors and HTTP 408, 425, 429, and 5xx responses up to three times with short backoff. Authentication and validation failures do not retry. Any unresolved error returns a nonzero exit code, so Task Scheduler can retry the job later. The next scheduled run also retries every ID missing from the corresponding success list.

Do not use `--reset` during normal operation. It intentionally clears both local success lists and can replay the collection. Back up `runtime/state.json` before using it for deliberate disaster recovery.

## First cutover test

Run these from the project directory:

```powershell
& '.\.venv\Scripts\python.exe' '.\runtime\sync.py' --dry-run
```

The dry run reads Instagram but writes to neither destination. Review `runtime/sync.log` and confirm the target collection and pending counts are correct.

Then run one live sync:

```powershell
& '.\.venv\Scripts\python.exe' '.\runtime\sync.py'
```

Expected dashboard-only final output resembles:

```text
Sync complete: 0 Notion new | 1 dashboard new | 0 Notion existing | 1 dashboard existing | 0 errors
```

The exact counts depend on existing local state. Verify the save appears once in the dashboard Saves Inbox. If the Notion mirror is configured, also verify it remains present there. A save should enter the dashboard as `New`; content generation still requires Mario to approve a pairing.

If the live run returns an error:

- HTTP 401: the local ingestion secret does not exactly match Vercel's `INGESTION_SECRET`, or the Instagram session expired. The log identifies which destination failed without printing the secret.
- HTTP 404: `dashboard_ingest_url` is incorrect; it must end in `/api/ingest`.
- HTTP 503: the deployment is missing Supabase configuration or Supabase is temporarily unavailable.
- Notion error: when the optional mirror is enabled, confirm the integration still has access to the staging data source. The dashboard destination will retry independently as needed.

## Windows Task Scheduler: 9 AM and 9 PM

Use one task with two daily triggers.

### General

- Name: `MarioPersonalInstagramSavesSync`
- Description: `Sync @mario_polancojr Instagram saves to the Mario Content Engine dashboard at 9 AM and 9 PM; optionally mirror to Notion.`
- Select `Run only when user is logged on` if Mario wants to see the PowerShell window appear and close.
- Leave `Run with highest privileges` off; the bridge does not need administrator access.

### Triggers

Create two triggers:

1. Daily at `9:00:00 AM`.
2. Daily at `9:00:00 PM`.

Enable both triggers. Use Mario's local Windows time zone.

### Action

Choose `Start a program`.

- Program/script:

  ```text
  powershell.exe
  ```

- Add arguments:

  ```text
  -NoProfile -NonInteractive -ExecutionPolicy Bypass -Command "& 'C:\Users\mario\projects\mario-personal-content-engine\.venv\Scripts\python.exe' 'C:\Users\mario\projects\mario-personal-content-engine\runtime\sync.py'; exit $LASTEXITCODE"
  ```

- Start in:

  ```text
  C:\Users\mario\projects\mario-personal-content-engine
  ```

The task does not need Codex, Claude Code, a browser, or an open terminal. Windows starts PowerShell, runs the local bridge, records the log and state, and closes the window.

### Conditions and settings

- Optional: enable `Wake the computer to run this task`.
- Enable `Allow task to be run on demand`.
- If the task fails, restart every `15 minutes`, up to `3` attempts.
- Stop the task if it runs longer than `1 hour`.
- If the task is already running, select `Do not start a new instance`.
- If a scheduled start is missed, enable `Run task as soon as possible after a scheduled start is missed`.

Save the task, right-click it, and choose `Run` once. Confirm `Last Run Result` is `0x0`, then verify the last line of `runtime/sync.log` and the dashboard Saves Inbox.

## Operational checks

After the first day, confirm both scheduled runs have a `0x0` result. During normal use, inspect the log only when the dashboard's last-ingestion time looks stale or Task Scheduler reports a failure.

Never delete `runtime/state.json` to force a retry. Failed destination writes are already retried because their IDs are not recorded as successful. Preserve the file when moving the project or replacing the computer.
