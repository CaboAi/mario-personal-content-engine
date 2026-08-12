# Vercel deployment runbook

This runbook deploys the private Mario Content Engine dashboard, including guarded Meta analytics and explicit carousel publishing controls.

## Deployment shape

- Vercel project: `mario-personal-content-engine`
- Framework: Next.js
- Repository root: the repository containing this file
- Vercel **Root Directory**: `web`
- Package manager: pnpm
- Supabase project: `gfpfdhvojvfgmdcnreud`
- Production database URL: `https://gfpfdhvojvfgmdcnreud.supabase.co`

The Vercel Root Directory must be `web`. The application, lockfile, `vercel.json`, and API routes all live there. If the Vercel CLI is run from `web`, that directory is already the project root.

## Required production variables

Add these in **Vercel Project → Settings → Environment Variables**. Apply them to **Production**. Mark every value except `SUPABASE_URL` and `OPENAI_MODEL` as **Sensitive**.

| Variable | Required | Purpose |
| --- | --- | --- |
| `SUPABASE_URL` | Yes | `https://gfpfdhvojvfgmdcnreud.supabase.co` |
| `SUPABASE_SECRET_KEY` | Yes | Server-only Supabase secret beginning with `sb_secret_` |
| `DASHBOARD_PASSWORD` | Yes | Mario's private dashboard login password |
| `DASHBOARD_SESSION_SECRET` | Yes | Long random value used to sign login sessions |
| `INGESTION_SECRET` | Yes | Shared secret used only by the local Instagram bridge |
| `OPENAI_API_KEY` | Yes | Server-only OpenAI API key for content generation |
| `OPENAI_MODEL` | Recommended | Current default is `gpt-5-mini` |
| `CRON_SECRET` | Yes | Long random value Vercel sends to the daily performance-window job |
| `META_ACCESS_TOKEN` | To activate Meta | Server-only long-lived token for owned-media insights and publishing |
| `META_INSTAGRAM_ACCOUNT_ID` | To activate Meta | Mario's Instagram professional account ID |
| `META_GRAPH_API_VERSION` | Recommended | Defaults to the current integration version, `v25.0` |
| `META_GRAPH_BASE_URL` | Only if needed | Defaults to `https://graph.instagram.com`; use `https://graph.facebook.com` for Facebook Login tokens |

`NOTION_TOKEN` and `NOTION_CONTENT_DATA_SOURCE_ID` are not required by the deployed dashboard. They belong to the optional migration-period Notion mirror.

The Meta token must include the permissions appropriate to the login path. Instagram Login uses `instagram_business_basic`, `instagram_business_manage_insights`, and `instagram_business_content_publish`. Do not add Meta variables until the professional-account connection is ready; the rest of the dashboard remains operational without them.

Never paste secret values into chat, commit them, prefix them with `NEXT_PUBLIC_`, or place them in `vercel.json`. The Supabase secret and OpenAI key must remain server-only.

For this single-user MVP, keep production credentials out of Preview deployments. A separate preview database and separate secrets can be added later if preview testing becomes necessary. Changes to Vercel environment variables apply only to subsequent deployments, so redeploy after adding or rotating one.

## Dashboard setup

1. In the Vercel team that owns Mario's projects, create or import `mario-personal-content-engine`.
2. Set the Root Directory to `web`.
3. Confirm the detected framework is Next.js.
4. Leave Build and Output settings at the repository defaults. `web/vercel.json` pins the pnpm install and Next.js build commands.
5. Add all required Production variables above.
6. Deploy to Production.

If using the Vercel CLI instead of the dashboard, start inside `web`:

```powershell
vercel link
vercel env ls production
pnpm lint
pnpm build
vercel deploy --prod
```

Do not pass secret values on a command line. Use Vercel's interactive environment-variable form or dashboard so values do not enter command history.

## Local bridge connection

After the production URL is known, update the uncommitted `runtime/config.json`:

```json
{
  "dashboard_ingest_url": "https://YOUR-PRODUCTION-DOMAIN/api/ingest",
  "dashboard_ingestion_secret": "THE-SAME-VALUE-AS-VERCEL-INGESTION_SECRET"
}
```

Keep the existing Instagram and Notion values in that file. Do not commit it. The Instagram session cookies remain on Mario's computer; Vercel receives only normalized saved-post metadata.

## Post-deploy verification

Use read-only checks first.

1. Open `https://YOUR-PRODUCTION-DOMAIN/api/health`.
2. Confirm the response contains:

```json
{
  "ok": true,
  "mode": "live",
  "generation": true,
  "analytics": false,
  "publishing": false
}
```

`analytics: false` and `publishing: false` are expected until Meta is connected.

3. Open the production root URL and confirm it redirects to `/login`.
4. Log in with `DASHBOARD_PASSWORD` and confirm the Saves Inbox loads in **live** mode.
5. Run one local Instagram bridge sync and confirm one saved item appears exactly once in the inbox.
6. Approve a pairing and confirm OpenAI creates one Production item containing Mario-owned material, 3–5 spoken hooks, 2–3 on-screen hooks, one goal, one test variable, and one hypothesis.
7. Check Vercel Functions logs for unexpected 4xx/5xx responses. Never copy request headers or secret values into a support message.
8. After Meta is connected, link one already-published post in Production and confirm that 24-hour and 7-day rows appear in Performance. Do not test the carousel endpoint with Mario's live account unless the exact assets and caption are intentionally ready to publish.

Stop at the first failed boundary:

- `mode: demo`: Supabase URL or secret is absent/wrong, or the deployment predates the env change.
- `generation: false`: `OPENAI_API_KEY` is absent or the deployment predates the env change.
- Login cannot complete: verify both dashboard authentication variables are set.
- Ingest returns `401`: the local and Vercel ingestion secrets differ.
- Ingest returns `5xx`: inspect the function log and Supabase REST response before retrying.
- Metrics returns `503`: both Meta account ID and access token must be configured.
- Carousel publishing remains disabled: Meta is disconnected, assets are not validated, or the human review checkbox is not selected.

## Rollback

If a new deployment fails after a previously healthy production version, use Vercel's Deployments page to restore the last known-good deployment. Database migration rollback is a separate decision; do not undo the Supabase schema merely to roll back application code.

## Official references

- [Vercel monorepo Root Directory](https://vercel.com/docs/monorepos)
- [Vercel environment variables](https://vercel.com/docs/environment-variables)
- [Sensitive environment variables](https://vercel.com/docs/environment-variables/sensitive-environment-variables)
- [Vercel deploy command](https://vercel.com/docs/cli/deploy)
