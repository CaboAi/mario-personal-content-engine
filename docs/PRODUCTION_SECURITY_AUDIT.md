# Production Security Audit

**Project:** Mario Personal Content Engine  
**Audit date:** 2026-08-11  
**Scope:** Focused production-readiness review of the Next.js API routes, password session, Supabase REST boundary, database migration/RLS, ingestion authentication, and secret exposure  
**Tech stack:** Next.js 16.3, React 19, TypeScript, Zod 4, Supabase Postgres/PostgREST, OpenAI Responses API, Vercel target  
**Result:** Conditional deployment pass after the `0002_security_hardening.sql` migration is applied and Vercel edge controls are configured

## Executive summary

The application has a good MVP security foundation: database credentials are server-only, all business tables have RLS enabled, browser database roles have no table/view access, the content-promotion function is restricted to `service_role`, the ingestion endpoint requires a separate secret, and dashboard routes fail closed in production when no valid session exists.

This review hardened four concrete issues before deployment:

1. Approval now treats browser-supplied content as untrusted and reloads the authoritative save/pairing from Supabase before sending it to OpenAI or writing content.
2. Login and ingestion secrets now use constant-work digest comparison; login also has a basic per-instance attempt limit.
3. Public JSON endpoints enforce request-size ceilings and schema/length/URL validation.
4. The security-definer database function now uses an empty search path and schema-qualified objects.

No hardcoded production credentials or committed environment files were detected. The production build and lint both pass after these changes.

### Score

**86/100 — Grade B (good posture with deployment-edge hardening still required)**

| Severity | Open | Fixed during audit |
|---|---:|---:|
| Critical | 0 | 0 |
| High | 0 | 1 |
| Medium | 2 | 3 |
| Low | 2 | 1 |

### Scope and coverage

- Reviewed 12 first-party files across API entry points, middleware, session signing, Supabase access, OpenAI access, migrations, environment templates, and Next.js configuration.
- Secret scan reported zero potential credential-bearing source files; only `.env.example` exists under `web/`, and no `.env*` file is tracked by Git.
- Skipped UI rendering, local Instagram scraper internals, Notion integration internals, dynamic penetration testing, and live cloud configuration.
- Dependency versions were inspected, but a live CVE/supply-chain audit was outside this focused assignment.

## Trust boundaries

| Boundary | Controls present | Residual risk |
|---|---|---|
| Browser → dashboard session | HTTP-only, Secure-in-production, SameSite=Lax signed cookie; proxy default-deny | Static shared password, no durable account lockout, no session revocation list |
| Local Instagram bridge → ingestion API | Dedicated bearer secret, constant-work comparison, strict schema, 64 KiB body limit | No replay protection; distributed rate limiting must be configured at Vercel |
| Browser → approval API → OpenAI | Session required, same-origin check, UUID validation, authoritative DB reload | Model/API consumption needs an edge quota/limit to cap cost abuse |
| Next.js server → Supabase | Server-only secret key; no client exposure; HTTPS | Secret key has broad service-role power, so server-route compromise has a large blast radius |
| PostgREST → database | RLS, explicit revokes, restricted RPC, privacy re-check, row lock | Live project must receive migration `0002_security_hardening.sql` |

## Remediated findings

### [VULN-001] Browser-controlled save/pairing data reached generation and persistence

**Original severity:** High (78/100) | **Confidence:** High  
**CWE:** CWE-20, CWE-863 | **OWASP:** A01/A05:2025  
**Location:** `web/src/app/api/pairings/approve/route.ts`

The route originally trusted entire `save` and `pairing` objects supplied by the browser. Although the database function independently checked the pairing's privacy state, a valid authenticated browser could alter the creator-delivery input, Mario-source rationale, or persisted source title.

**Fix applied:** The route accepts only validated UUIDs from the request, reloads `dashboard_saved_posts` with the server credential, finds the pairing in that authoritative row, and uses only the database version for generation and persistence.

### [VULN-002] Ingestion accepted unbounded, weakly validated JSON

**Original severity:** Medium (58/100) | **Confidence:** High  
**CWE:** CWE-20, CWE-400 | **OWASP:** A05:2025  
**Location:** `web/src/app/api/ingest/route.ts`

The endpoint authenticated the bridge but did not limit body size or validate field lengths, content types, timestamps, durations, or URL origin.

**Fix applied:** Added a 64 KiB hard ceiling, strict Zod validation, bounded strings, numeric range checks, timestamp validation, and an HTTPS Instagram hostname allowlist.

### [VULN-003] Password and ingestion-secret comparisons used direct equality

**Original severity:** Low (28/100) | **Confidence:** Medium  
**CWE:** CWE-208 | **OWASP:** A02/A07:2025  
**Locations:** `web/src/app/api/session/route.ts`, `web/src/app/api/ingest/route.ts`

Direct JavaScript string equality can short-circuit. Exploiting this remotely through a serverless network is unlikely, but secret comparisons should avoid input-dependent work.

**Fix applied:** Both values are SHA-256 digested and their fixed-length byte arrays are compared without early exit. Session signatures already used a fixed-length comparison loop.

### [VULN-004] Security-definer function used a mutable search path

**Original severity:** Medium (52/100) | **Confidence:** Medium  
**CWE:** CWE-426 | **OWASP:** A01/A05:2025  
**Location:** `web/supabase/migrations/0001_content_engine.sql:212-277`

`promote_pairing` runs as its owner and originally set `search_path = public`. Supabase normally restricts untrusted schema creation, which lowers exploitability, but security-definer functions should not resolve objects through a mutable schema path.

**Fix applied:** `0002_security_hardening.sql` replaces the function with `search_path = ''` and fully schema-qualified tables, views, and function privileges.

## Open findings

### [VULN-005] Rate limiting is not durable or distributed

**Severity:** Medium (48/100) | **Confidence:** High  
**CWE:** CWE-307, CWE-400 | **OWASP:** A06/A07:2025  
**Locations:** `web/src/app/api/session/route.ts`, `web/src/app/api/pairings/approve/route.ts`, `web/src/app/api/ingest/route.ts`

The login route now limits eight failures per 15 minutes per address in one running instance. Serverless instances can restart or scale horizontally, so this is defense-in-depth, not a durable control. Approval also triggers a paid model call, and ingestion performs writes.

**Required deployment action:** Configure Vercel Firewall/rate-limit rules for `/api/session`, `/api/pairings/approve`, and `/api/ingest`. Apply tighter limits to login and generation than health checks. If edge rate limiting is unavailable, use a durable Supabase/Redis counter.

### [VULN-006] Security event audit trail is incomplete

**Severity:** Medium (42/100) | **Confidence:** High  
**CWE:** CWE-778 | **OWASP:** A09:2025

The database includes `job_runs`, but failed logins, rejected ingestion attempts, content approvals, and generation failures are not recorded in a durable audit stream. Vercel request logs provide partial coverage but are not an application audit trail.

**Required deployment action:** Enable Vercel log retention/alerts now. In the next application iteration, add structured, secret-free events for authentication failures, ingestion outcomes, generation outcomes, and pairing promotions. Never log passwords, cookie values, ingestion secrets, Supabase keys, OpenAI keys, or Instagram session data.

### [VULN-007] Browser security headers are not explicitly configured

**Severity:** Low (31/100) | **Confidence:** High  
**CWE:** CWE-693 | **OWASP:** A05:2025  
**Location:** `web/next.config.ts`

The application does not explicitly set a Content Security Policy, frame-ancestor protection, HSTS, Referrer-Policy, Permissions-Policy, or `X-Content-Type-Options`.

**Required deployment action:** Add headers at Vercel/Next.js. Start with a report-only CSP if necessary, then enforce it after validating Next.js and font behavior. At minimum set HSTS, `frame-ancestors 'none'` (or X-Frame-Options DENY), `nosniff`, strict referrer policy, and a minimal Permissions-Policy.

### [VULN-008] Public health response reveals integration state

**Severity:** Low (22/100) | **Confidence:** High  
**CWE:** CWE-200 | **OWASP:** A05:2025  
**Location:** `web/src/app/api/health/route.ts:4-10`

The unauthenticated health route reports whether live database mode, OpenAI generation, and Meta analytics are configured. It exposes no secret values, but it gives unnecessary reconnaissance information.

**Recommended action:** Return only `{ "ok": true }` publicly. Put detailed readiness behind the dashboard session or a separate protected operational endpoint.

## Positive controls verified

- `web/src/lib/supabase-rest.ts` is marked `server-only`; the Supabase secret is never returned to the client.
- The code supports Supabase's `sb_secret_` key format without incorrectly sending it as a bearer JWT.
- `.env*`, `.vercel`, certificates, build outputs, and dependency directories are ignored.
- No actual credential values were read or printed during this audit.
- All business tables have RLS enabled.
- `anon` and `authenticated` have all business-table and dashboard-view rights revoked.
- The promotion RPC is revoked from `public`, `anon`, and `authenticated`, then granted only to `service_role`.
- The database function locks the pairing, re-checks `privacy_status = 'Clear'`, writes content transactionally, and marks the source save used.
- The dashboard cookie is HTTP-only, Secure in production, path-scoped to `/`, and SameSite=Lax.
- The proxy now uses exact public-path matching rather than prefix matching.
- API errors do not expose OpenAI keys or ingestion secrets.

## Deployment security gate

Before exposing the Vercel URL:

1. Apply `web/supabase/migrations/0002_security_hardening.sql` to the live Supabase project.
2. Store all secrets only in Vercel encrypted environment variables and the local bridge's ignored config; never use `NEXT_PUBLIC_` for secret values.
3. Use independent high-entropy values for `DASHBOARD_PASSWORD`, `DASHBOARD_SESSION_SECRET`, and `INGESTION_SECRET`.
4. Rotate the Instagram session/cookie material previously shared in conversation before the bridge runs against production.
5. Add Vercel edge rate limits and browser security headers.
6. Confirm Preview and Production environments each have the intended variables; avoid supplying production secrets to untrusted preview deployments.
7. Run one authenticated dashboard smoke test, one valid bridge ingestion, one invalid-secret ingestion, and one content promotion after deployment.

## Verification performed

- `npm run lint` — passed
- `npm run build` — passed; all application and API routes compiled
- Non-disclosing secret scan — no potential committed credentials detected
- Static STRIDE review across browser, bridge, OpenAI, PostgREST, and database boundaries

## Methodology

- OWASP Top 10:2025, CWE Top 25:2024, and OWASP API Security Top 10:2023
- STRIDE threat modeling per trust boundary
- Framework-aware false-positive suppression for React/Next.js
- Static review only; this does not replace live DAST, cloud configuration review, or penetration testing

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━  
Built by agricidaniel — Join the AI Marketing Hub community  
🆓 Free → https://www.skool.com/ai-marketing-hub  
⚡ Pro → https://www.skool.com/ai-marketing-hub-pro  
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
