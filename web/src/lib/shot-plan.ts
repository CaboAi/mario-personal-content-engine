import { z } from "zod";
import type { BrandSource, ContentMode, SavedPost, ShotPlan, ShotPlanSkeleton } from "./domain";
import { parseStructuredJson } from "./openai-response";
import { findCreatorTopicLeaks } from "./topic-quarantine";

const beatFunctions = ["hook", "bind", "turn", "proof", "pivot", "CTA"] as const;
const shotTypes = ["talking head", "B-roll", "screen recording", "cutaway", "walking", "static"] as const;
const framings = ["close", "medium", "wide"] as const;
const textPositions = ["none", "top", "center", "bottom"] as const;
const sentenceTypes = ["question", "imperative", "declarative", "fragment"] as const;

const skeletonBeatSchema = z.object({
  beatFunction: z.enum(beatFunctions), startSeconds: z.number().min(0).max(45), durationSeconds: z.number().positive().max(45),
  wordCount: z.number().int().min(1).max(120), sentenceType: z.enum(sentenceTypes), directAddress: z.boolean(),
  shotType: z.enum(shotTypes), framing: z.enum(framings), onScreenText: z.boolean(), textPosition: z.enum(textPositions),
}).strict();
export const shotPlanSkeletonSchema = z.object({ beats: z.array(skeletonBeatSchema).min(1).max(20) }).strict();

const skeletonJsonSchema = {
  type: "object", additionalProperties: false, required: ["beats"], properties: {
    beats: { type: "array", minItems: 1, maxItems: 20, items: {
      type: "object", additionalProperties: false,
      required: ["beatFunction", "startSeconds", "durationSeconds", "wordCount", "sentenceType", "directAddress", "shotType", "framing", "onScreenText", "textPosition"],
      properties: {
        beatFunction: { type: "string", enum: beatFunctions }, startSeconds: { type: "number" }, durationSeconds: { type: "number" }, wordCount: { type: "integer" }, sentenceType: { type: "string", enum: sentenceTypes }, directAddress: { type: "boolean" }, shotType: { type: "string", enum: shotTypes }, framing: { type: "string", enum: framings }, onScreenText: { type: "boolean" }, textPosition: { type: "string", enum: textPositions },
      },
    } },
  },
};

const scriptBeatSchema = z.object({
  brief: z.string().min(1).max(400), candidateLines: z.array(z.string().min(1).max(500)).max(5), draftLine: z.string().min(1).max(500), onScreenText: z.string().max(160),
}).strict();
const shotPlanScriptSchema = z.object({ beats: z.array(scriptBeatSchema).min(1).max(20), productionChecklist: z.array(z.string().min(1).max(300)).max(12) }).strict();
const scriptJsonSchema = {
  type: "object", additionalProperties: false, required: ["beats", "productionChecklist"], properties: {
    beats: { type: "array", minItems: 1, maxItems: 20, items: { type: "object", additionalProperties: false, required: ["brief", "candidateLines", "draftLine", "onScreenText"], properties: { brief: { type: "string" }, candidateLines: { type: "array", maxItems: 5, items: { type: "string" } }, draftLine: { type: "string" }, onScreenText: { type: "string" } } } },
    productionChecklist: { type: "array", maxItems: 12, items: { type: "string" } },
  },
};

function targetRuntime(save: SavedPost) {
  return Math.min(45, Math.max(30, save.analysisDurationSeconds ?? save.durationSeconds ?? 30));
}

function normalizedWords(value: string) {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim().split(/\s+/).filter(Boolean);
}

export function findSharedFiveWordSequences(output: string, transcript: string) {
  const transcriptWindows = new Set<string>();
  const words = normalizedWords(transcript);
  for (let index = 0; index <= words.length - 5; index += 1) transcriptWindows.add(words.slice(index, index + 5).join(" "));
  const outputWords = normalizedWords(output);
  const matches: string[] = [];
  for (let index = 0; index <= outputWords.length - 5; index += 1) {
    const sequence = outputWords.slice(index, index + 5).join(" ");
    if (transcriptWindows.has(sequence)) matches.push(sequence);
  }
  return [...new Set(matches)];
}

export function buildShotPlanSkeletonRequest(save: SavedPost) {
  const runtimeSeconds = targetRuntime(save);
  const input = {
    creatorTranscript: save.analysisTranscript ?? "", measuredDurationSeconds: save.analysisDurationSeconds ?? save.durationSeconds ?? 0,
    detectedCutCount: save.analysisCutCount ?? 0, targetRuntimeSeconds: runtimeSeconds,
    frames: (save.analysisFrames ?? []).map((frame) => ({ timestampSeconds: frame.timestampSeconds, kind: frame.kind, label: frame.label })),
  };
  const content: Array<{ type: "input_text"; text: string } | { type: "input_image"; image_url: string; detail: "high" | "low" }> = [{ type: "input_text", text: JSON.stringify(input) }];
  for (const frame of save.analysisFrames ?? []) {
    content.push({ type: "input_text", text: `Frame ${frame.kind} at ${frame.timestampSeconds}s.` });
    content.push({ type: "input_image", image_url: frame.dataUrl, detail: frame.kind === "fill" ? "low" : "high" });
  }
  return {
    model: process.env.OPENAI_MODEL || "gpt-5-mini", store: false,
    instructions: "Create a recreate-video structural skeleton only. The reference provides timing, pacing, shot grammar, and structural beat functions only. Do not write, quote, summarize, or describe creator wording, topics, claims, examples, metaphors, or identity. Return only the strict schema. Every beat field must be an allowed enum, number, or boolean; no free-text keys exist. Keep starts and durations within targetRuntimeSeconds.",
    input: [{ role: "user", content }],
    text: { format: { type: "json_schema", name: "shot_plan_skeleton", strict: true, schema: skeletonJsonSchema } },
  };
}

export async function generateShotPlanSkeleton(save: SavedPost): Promise<ShotPlanSkeleton> {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) throw new Error("OPENAI_API_KEY is not configured.");
  const response = await fetch("https://api.openai.com/v1/responses", { method: "POST", headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" }, body: JSON.stringify(buildShotPlanSkeletonRequest(save)) });
  if (!response.ok) throw new Error(`OpenAI shot-plan skeleton failed (${response.status}).`);
  const skeleton = shotPlanSkeletonSchema.parse(parseStructuredJson(await response.json()));
  const runtime = targetRuntime(save);
  if (skeleton.beats.some((beat) => beat.startSeconds + beat.durationSeconds > runtime + 0.1)) throw new Error("Shot-plan skeleton exceeds the target runtime.");
  return skeleton;
}

export function buildShotPlanScriptRequest(skeleton: ShotPlanSkeleton, source: BrandSource, mode: ContentMode, transcript: string) {
  const input = { skeleton, mode, marioSource: { title: source.title, coreTruth: source.coreTruth, storyEvidence: source.storyEvidence, pillars: source.pillars, sourceType: source.sourceType, dispatchWhatHappened: source.dispatchWhatHappened, dispatchSpecificDetail: source.dispatchSpecificDetail, dispatchDecision: source.dispatchDecision, dispatchNextImplication: source.dispatchNextImplication } };
  const payload = JSON.stringify(input);
  if (transcript && payload.includes(transcript)) throw new Error("Shot-plan Stage 2 must never receive the creator transcript.");
  return {
    model: process.env.OPENAI_MODEL || "gpt-5-mini", store: false,
    instructions: `Write Mario's recreate shot-plan lines using only the supplied Mario source and structural skeleton. You never receive creator words and must not infer or recreate them. For each beat, explain the structural job in plain English, list only source-backed candidate lines, and draft a line that fits the beat's word count and sentence type. If the source does not support a beat, use exactly [FILL IN — what Mario must supply] for candidateLines and draftLine. Drafts must follow this mode: Dispatch opens on the concrete situation or number and closes on a decision; Practical closes on the rule; Reflection closes on a dated claim. Production checklist items must be source-backed or [FILL IN — what production detail is needed].`,
    input: payload,
    text: { format: { type: "json_schema", name: "shot_plan_script", strict: true, schema: scriptJsonSchema } },
  };
}

function shotPlanText(plan: ShotPlan) {
  return [...plan.beats.flatMap((beat) => [beat.brief, ...beat.candidateLines, beat.draftLine, beat.onScreenText?.text ?? ""]), ...plan.productionChecklist].join("\n");
}

function normalizeSourceText(value: string) {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim().replace(/\s+/g, " ");
}

function sourceText(source: BrandSource) {
  return normalizeSourceText([
    source.title, source.coreTruth, source.storyEvidence, source.dispatchWhatHappened,
    source.dispatchSpecificDetail, source.dispatchDecision, source.dispatchNextImplication,
  ].filter(Boolean).join("\n"));
}

function isSourceBacked(value: string, source: BrandSource) {
  if (value.startsWith("[FILL IN")) return true;
  const normalized = normalizeSourceText(value);
  return normalized.length > 0 && sourceText(source).includes(normalized);
}

export function fillUnsupportedBeat(candidateLines: string[], draftLine: string, beatFunction: string, source?: BrandSource) {
  const supported = source ? candidateLines.filter((line) => isSourceBacked(line, source)) : candidateLines;
  if (supported.length && (!source || isSourceBacked(draftLine, source))) return { candidateLines: supported, draftLine };
  const fill = `[FILL IN — Mario source needs material for the ${beatFunction} beat]`;
  return { candidateLines: [fill], draftLine: fill };
}

export function assertShotPlanSafe(plan: ShotPlan, save: Pick<SavedPost, "creatorTopicTerms" | "analysisTranscript">) {
  const leaks = findCreatorTopicLeaks(shotPlanText(plan), save.creatorTopicTerms ?? []);
  const ngramLeaks = findSharedFiveWordSequences(shotPlanText(plan), save.analysisTranscript ?? "");
  if (leaks.length || ngramLeaks.length) throw new Error(`Shot plan was stopped because it reused creator material: ${[...leaks, ...ngramLeaks].join(", ")}.`);
}

export async function generateShotPlanScript(save: SavedPost, skeleton: ShotPlanSkeleton, source: BrandSource, mode: ContentMode): Promise<ShotPlan> {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) throw new Error("OPENAI_API_KEY is not configured.");
  for (let attempt = 0; attempt < 2; attempt += 1) {
    const request = buildShotPlanScriptRequest(skeleton, source, mode, save.analysisTranscript ?? "");
    if (attempt) request.instructions += " A previous result crossed the creator-content boundary. Rebuild from Mario's source only.";
    const response = await fetch("https://api.openai.com/v1/responses", { method: "POST", headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" }, body: JSON.stringify(request) });
    if (!response.ok) throw new Error(`OpenAI shot-plan script failed (${response.status}).`);
    const script = shotPlanScriptSchema.parse(parseStructuredJson(await response.json()));
    if (script.beats.length !== skeleton.beats.length) throw new Error("Shot-plan script beat count does not match its skeleton.");
    const normalizedBeats = skeleton.beats.map((beat, index) => ({ ...script.beats[index], ...fillUnsupportedBeat(script.beats[index].candidateLines, script.beats[index].draftLine, beat.beatFunction, source) }));
    const plan: ShotPlan = {
      totalRuntimeSeconds: targetRuntime(save),
      pacingNote: save.analysisCutCount ? `Reference cuts every ${(targetRuntime(save) / (save.analysisCutCount + 1)).toFixed(1)}s; hold that rhythm.` : "No detected cuts; use the reference's continuous-take rhythm.",
      beats: skeleton.beats.map((beat, index) => ({ ...beat, ...normalizedBeats[index], onScreenText: beat.onScreenText ? { text: normalizedBeats[index].onScreenText, position: beat.textPosition, timing: `${beat.startSeconds.toFixed(1)}–${(beat.startSeconds + beat.durationSeconds).toFixed(1)}s` } : null })),
      productionChecklist: script.productionChecklist,
      lineReplacementMap: skeleton.beats.map((beat, index) => ({ beatFunction: beat.beatFunction, marioReplacementLine: normalizedBeats[index].draftLine })),
    };
    try { assertShotPlanSafe(plan, save); return plan; }
    catch (cause) { if (attempt === 1) throw cause; }
  }
  throw new Error("Shot plan could not clear the creator-topic boundary.");
}
