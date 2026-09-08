import fs from "node:fs/promises";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));

async function loadEnvironment() {
  const raw = await fs.readFile(path.join(root, ".env.local"), "utf8");
  for (const line of raw.split(/\r?\n/)) {
    const match = line.match(/^([A-Z][A-Z0-9_]*)=(.*)$/);
    if (!match || process.env[match[1]]) continue;
    process.env[match[1]] = match[2].replace(/^"|"$/g, "");
  }
}

await loadEnvironment();
const url = process.env.SUPABASE_URL;
const key = process.env.SUPABASE_SECRET_KEY;
if (!url || !key) throw new Error("SUPABASE_URL and SUPABASE_SECRET_KEY are required.");

const sources = JSON.parse(
  await fs.readFile(path.join(root, "data", "brand-sources.json"), "utf8"),
);
for (const source of sources) {
  if (typeof source.retired !== "boolean") {
    throw new Error(`Brand source ${source.source_external_id} must explicitly declare whether it is retired.`);
  }
  const confirmed = source.privacy_status === "Clear" && source.status === "Verified";
  const unconfirmed = source.privacy_status === "Needs confirmation" && source.status !== "Verified";
  if (!confirmed && !unconfirmed) {
    throw new Error(`Unsafe source state for ${source.source_external_id}.`);
  }
}

const headers = { apikey: key, "Content-Type": "application/json" };
if (!key.startsWith("sb_secret_")) headers.Authorization = `Bearer ${key}`;
const endpoint = `${url.replace(/\/$/, "")}/rest/v1`;

let created = 0;
let updated = 0;
for (const source of sources) {
  const externalId = encodeURIComponent(source.source_external_id);
  const existingResponse = await fetch(
    `${endpoint}/brand_sources?source_external_id=eq.${externalId}&select=id`,
    { headers },
  );
  if (!existingResponse.ok) throw new Error(await existingResponse.text());
  const existing = await existingResponse.json();
  const response = await fetch(
    existing.length
      ? `${endpoint}/brand_sources?id=eq.${encodeURIComponent(existing[0].id)}`
      : `${endpoint}/brand_sources`,
    {
      method: existing.length ? "PATCH" : "POST",
      headers: { ...headers, Prefer: "return=minimal" },
      body: JSON.stringify(source),
    },
  );
  if (!response.ok) throw new Error(await response.text());
  if (existing.length) updated += 1;
  else created += 1;
}

console.log(JSON.stringify({ created, updated, total: sources.length }));
