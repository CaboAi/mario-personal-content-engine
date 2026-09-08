import fs from "node:fs";
import http from "node:http";
import https from "node:https";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { batch, fifteenDayItems } from "../data/fifteen-day-test-batch-notion.mjs";

function assertLegalBatchMix(items) {
  if (items.length < 3) return;
  const counts = { Dispatch: 0, Practical: 0, Reflection: 0 };
  for (const item of items) {
    if (!(item.mode in counts)) throw new Error(`Content item ${item.importKey} is missing a valid content mode.`);
    counts[item.mode] += 1;
  }
  const dispatch = (counts.Dispatch / items.length) * 100;
  const reflection = (counts.Reflection / items.length) * 100;
  const violations = [];
  if (dispatch < 50) violations.push(`Dispatch is ${Math.round(dispatch)}%, needs at least 50%.`);
  if (reflection > 100 / 3) violations.push(`Reflection is ${Math.round(reflection)}%, must be at most 33%.`);
  if (violations.length) throw new Error(`Batch mode mix is illegal: ${violations.join(" ")}`);
}

function loadEnvFile(filePath) {
  if (!fs.existsSync(filePath)) return;
  for (const line of fs.readFileSync(filePath, "utf8").split(/\r?\n/)) {
    const match = line.match(/^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)\s*$/);
    if (!match) continue;
    const [, name, rawValue] = match;
    if (process.env[name] !== undefined) continue;
    const value = rawValue.trim();
    process.env[name] = (value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))
      ? value.slice(1, -1)
      : value.replace(/\s+#.*$/, "").trim();
  }
}

const webDirectory = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
loadEnvFile(path.join(webDirectory, ".env.local"));
loadEnvFile(path.join(webDirectory, ".env"));

const url = process.env.SUPABASE_URL ?? process.env.NEXT_PUBLIC_SUPABASE_URL;
const key = process.env.SUPABASE_SECRET_KEY ?? process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!url || !key) {
  throw new Error("SUPABASE_URL and SUPABASE_SECRET_KEY (or SUPABASE_SERVICE_ROLE_KEY) are required.");
}

async function request(path, init = {}) {
  const target = new URL(`${url}/rest/v1/${path}`);
  const transport = target.protocol === "https:" ? https : http;
  const headers = {
    apikey: key,
    ...(key.startsWith("sb_secret_") ? {} : { Authorization: `Bearer ${key}` }),
    Accept: "application/json",
    "Content-Type": "application/json",
    Connection: "close",
    ...(init.headers ?? {}),
  };

  return new Promise((resolve, reject) => {
    const request = transport.request(target, { method: init.method ?? "GET", headers }, (response) => {
      const chunks = [];
      response.setEncoding("utf8");
      response.on("data", (chunk) => chunks.push(chunk));
      response.on("end", () => {
        const body = chunks.join("");
        if ((response.statusCode ?? 500) < 200 || (response.statusCode ?? 500) >= 300) {
          reject(new Error(`${response.statusCode} ${body}`));
          return;
        }
        resolve(body ? JSON.parse(body) : undefined);
      });
    });
    request.on("error", reject);
    if (init.body) request.write(init.body);
    request.end();
  });
}

function initialStatus(item) {
  if (item.notionStatus) return item.notionStatus;
  const { format } = item;
  if (format === "Carousel") return "Copy Ready";
  if (format === "POV / Realization") return "Concept Ready";
  if (format === "Written Post" || format === "Long-form") return "Outline Ready";
  return "Script Ready";
}

function statusFitsFormat(format, status) {
  const permitted = {
    "Yap Reel": ["Script Ready", "Ready to Record", "Recorded", "Edited", "Scheduled", "Posted"],
    "Mini Story": ["Script Ready", "Ready to Record", "Recorded", "Edited", "Scheduled", "Posted"],
    "POV / Realization": ["Concept Ready", "Ready to Record", "Recorded", "Edited", "Scheduled", "Posted"],
    "Carousel": ["Copy Ready", "Designing in Canva", "Design Ready", "Posted"],
    "Written Post": ["Outline Ready", "Drafting", "Final Copy", "Scheduled", "Posted"],
    "Long-form": ["Outline Ready", "Drafting", "Final Copy", "Scheduled", "Posted"],
  };
  return permitted[format]?.includes(status) ?? false;
}

async function upsertBatch() {
  const found = await request(`content_batches?title=eq.${encodeURIComponent(batch.title)}&starts_on=eq.${batch.startsOn}&select=id`);
  const payload = {
    title: batch.title,
    description: batch.description,
    source_url: batch.sourceUrl,
    timezone: batch.timezone,
    starts_on: batch.startsOn,
    ends_on: batch.endsOn,
    updated_at: new Date().toISOString(),
  };
  if (found[0]) {
    await request(`content_batches?id=eq.${found[0].id}`, { method: "PATCH", headers: { Prefer: "return=minimal" }, body: JSON.stringify(payload) });
    return found[0].id;
  }
  const rows = await request("content_batches", { method: "POST", headers: { Prefer: "return=representation" }, body: JSON.stringify(payload) });
  return rows[0].id;
}

async function upsertSource() {
  const externalId = "background-interview:2026-08-16";
  const found = await request(`brand_sources?source_external_id=eq.${externalId}&select=id`);
  if (found[0]) return found[0].id;
  const rows = await request("brand_sources", {
    method: "POST",
    headers: { Prefer: "return=representation" },
    body: JSON.stringify({
      source_type: "Existing Content",
      title: "Mario Background Interview — clear production material",
      core_truth: "Mario documents reinvention through specific lived receipts, practical clarity, standards, and action.",
      story_evidence: "The imported 15-day batch uses only the referenced, non-sensitive interview material. Individual item source references carry the exact evidence.",
      privacy_status: "Clear",
      pillars: ["Reinvention", "Action", "Life Story"],
      source_external_id: externalId,
      status: "Verified",
      retired: true,
    }),
  });
  return rows[0].id;
}

async function upsertItem(item, batchId, sourceId) {
  const existing = await request(`content_items?import_key=eq.${encodeURIComponent(item.importKey)}&select=id,status,format,post_date`);
  const sharedPayload = {
    batch_id: batchId,
    brand_source_id: sourceId,
    import_key: item.importKey,
    source_title: item.sourceTitle,
    source_reference: item.sourceReference,
    title: item.title,
    format: item.format,
    mode: item.mode,
    goal: item.goal,
    pillars: item.pillars,
    spoken_hooks: item.spokenHooks,
    on_screen_hooks: item.onScreenHooks,
    selected_hook: item.selectedHook,
    selected_on_screen_hook: item.selectedOnScreenHook,
    hook_rationale: item.hookRationale,
    test_variable: item.testVariable,
    hypothesis: item.hypothesis,
    skeleton: item.skeleton,
    full_script: item.fullScript ?? null,
    script_risk_lines: [],
    closing_line: item.closingLine,
    cta: item.cta,
    caption: item.caption,
    carousel_slides: item.carouselSlides,
    production_notes: item.productionNotes,
    privacy_notes: item.privacyNotes,
    publication_clearance: item.publicationClearance,
    platforms: item.platforms,
    updated_at: new Date().toISOString(),
  };
  const lockedEditorialState = item.notionStatus
    ? { status: item.notionStatus, ...(item.postDate ? { post_date: item.postDate } : {}) }
    : existing[0] && !statusFitsFormat(item.format, existing[0].status)
      ? { status: initialStatus(item) }
      : {};
  if (existing[0]) {
    // A re-import refreshes the approved package without undoing editorial work.
    // Scheduling, production status, and archival state belong to the operator.
    await request(`content_items?id=eq.${existing[0].id}`, { method: "PATCH", headers: { Prefer: "return=minimal" }, body: JSON.stringify({ ...sharedPayload, ...lockedEditorialState }) });
  } else {
    await request("content_items", {
      method: "POST",
      headers: { Prefer: "return=minimal" },
      body: JSON.stringify({
        ...sharedPayload,
        planned_for: item.plannedFor,
        status: initialStatus(item),
        archived_at: null,
        ...(item.postDate ? { post_date: item.postDate } : {}),
      }),
    });
  }
}

assertLegalBatchMix(fifteenDayItems);
const batchId = await upsertBatch();
const sourceId = await upsertSource();
for (const item of fifteenDayItems) await upsertItem(item, batchId, sourceId);
console.log(`Imported ${fifteenDayItems.length} packages into ${batch.title}.`);
