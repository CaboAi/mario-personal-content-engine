import { z } from "zod";
import type { BrandSource, ContentMode, SavedPost, ShotPlan } from "./domain";
import { getFullDraftInstructions } from "./format-contracts";
import { parseStructuredJson } from "./openai-response";
import { findCreatorTopicLeaks } from "./topic-quarantine";

const beatFunctions = ["hook", "bind", "turn", "proof", "pivot", "CTA"] as const;
const shotTypes = ["talking head", "B-roll", "screen recording", "cutaway", "walking", "static"] as const;
const framings = ["close", "medium", "wide"] as const;
const textPositions = ["none", "top", "center", "bottom"] as const;
const sentenceTypes = ["question", "imperative", "declarative", "fragment"] as const;

const generatedBeatSchema = z.object({
  beatFunction: z.enum(beatFunctions),
  startSeconds: z.number().min(0).max(45),
  durationSeconds: z.number().positive().max(45),
  wordCount: z.number().int().min(1).max(120),
  sentenceType: z.enum(sentenceTypes),
  directAddress: z.boolean(),
  brief: z.string().min(1).max(400),
  candidateLines: z.array(z.string().min(1).max(500)).max(5),
  draftLine: z.string().min(1).max(500),
  shotType: z.enum(shotTypes),
  framing: z.enum(framings),
  onScreenText: z.string().max(160),
  textPosition: z.enum(textPositions),
}).strict();

const lineReplacementSchema = z.object({
  beatFunction: z.enum(beatFunctions),
  structuralRole: z.string().min(1).max(400),
  marioReplacementLine: z.string().min(1).max(500),
}).strict();

const generatedShotPlanSchema = z.object({
  beats: z.array(generatedBeatSchema).min(1).max(20),
  productionChecklist: z.array(z.string().min(1).max(300)).max(12),
  lineReplacementMap: z.array(lineReplacementSchema).min(1).max(20),
}).strict();

const shotPlanJsonSchema = {
  type: "object",
  additionalProperties: false,
  required: ["beats", "productionChecklist", "lineReplacementMap"],
  properties: {
    beats: {
      type: "array",
      minItems: 1,
      maxItems: 20,
      items: {
        type: "object",
        additionalProperties: false,
        required: ["beatFunction", "startSeconds", "durationSeconds", "wordCount", "sentenceType", "directAddress", "brief", "candidateLines", "draftLine", "shotType", "framing", "onScreenText", "textPosition"],
        properties: {
          beatFunction: { type: "string", enum: beatFunctions },
          startSeconds: { type: "number" },
          durationSeconds: { type: "number" },
          wordCount: { type: "integer" },
          sentenceType: { type: "string", enum: sentenceTypes },
          directAddress: { type: "boolean" },
          brief: { type: "string" },
          candidateLines: { type: "array", maxItems: 5, items: { type: "string" } },
          draftLine: { type: "string" },
          shotType: { type: "string", enum: shotTypes },
          framing: { type: "string", enum: framings },
          onScreenText: { type: "string" },
          textPosition: { type: "string", enum: textPositions },
        },
      },
    },
    productionChecklist: { type: "array", maxItems: 12, items: { type: "string" } },
    lineReplacementMap: {
      type: "array",
      minItems: 1,
      maxItems: 20,
      items: {
        type: "object",
        additionalProperties: false,
        required: ["beatFunction", "structuralRole", "marioReplacementLine"],
        properties: {
          beatFunction: { type: "string", enum: beatFunctions },
          structuralRole: { type: "string" },
          marioReplacementLine: { type: "string" },
        },
      },
    },
  },
};

function measuredDuration(save: SavedPost) {
  return save.analysisDurationSeconds ?? save.durationSeconds ?? 30;
}

function targetRuntime(save: SavedPost) {
  return Math.min(45, Math.max(30, measuredDuration(save)));
}

function cutRhythmSeconds(save: SavedPost) {
  return save.analysisCutCount ? measuredDuration(save) / (save.analysisCutCount + 1) : null;
}

function splitStoryEvidence(storyEvidence: string) {
  const marker = "\n\nExtracted evidence:\n";
  if (!storyEvidence.startsWith("Raw capture:\n") || !storyEvidence.includes(marker)) {
    return { rawCapture: storyEvidence, storyEvidence };
  }
  const [rawCapture, extractedEvidence] = storyEvidence.slice("Raw capture:\n".length).split(marker, 2);
  return { rawCapture: rawCapture.trim(), storyEvidence: extractedEvidence.trim() };
}

function marioSourceInput(source: BrandSource) {
  const evidence = splitStoryEvidence(source.storyEvidence);
  return {
    sourceType: source.sourceType,
    title: source.title,
    rawCapture: evidence.rawCapture,
    coreTruth: source.coreTruth,
    storyEvidence: evidence.storyEvidence,
    pillars: source.pillars,
    dispatchWhatHappened: source.dispatchWhatHappened,
    dispatchSpecificDetail: source.dispatchSpecificDetail,
    dispatchDecision: source.dispatchDecision,
    dispatchOccurredOn: source.dispatchOccurredOn,
    dispatchNextImplication: source.dispatchNextImplication,
  };
}

export function buildShotPlanRequest(save: SavedPost, source: BrandSource, mode: ContentMode) {
  const runtimeSeconds = targetRuntime(save);
  const rhythmSeconds = cutRhythmSeconds(save);
  const input = {
    creatorTranscript: save.analysisTranscript ?? "",
    measuredMechanics: {
      durationSeconds: measuredDuration(save),
      detectedCutCount: save.analysisCutCount ?? 0,
      cutRhythmSeconds: rhythmSeconds,
      targetRuntimeSeconds: runtimeSeconds,
    },
    labeledFrames: (save.analysisFrames ?? []).map((frame) => ({
      timestampSeconds: frame.timestampSeconds,
      kind: frame.kind,
      label: frame.label,
    })),
    marioSource: marioSourceInput(source),
    contentMode: mode,
    contentModeContract: getFullDraftInstructions(mode, "Yap Reel"),
  };
  const content: Array<{ type: "input_text"; text: string } | { type: "input_image"; image_url: string; detail: "high" | "low" }> = [
    { type: "input_text", text: JSON.stringify(input) },
  ];
  for (const frame of save.analysisFrames ?? []) {
    content.push({ type: "input_text", text: `Frame ${frame.kind} at ${frame.timestampSeconds}s.` });
    content.push({ type: "input_image", image_url: frame.dataUrl, detail: frame.kind === "fill" ? "low" : "high" });
  }
  return {
    model: process.env.OPENAI_MODEL || "gpt-5-mini",
    store: false,
    instructions: `Create one complete, editable shot plan for Mario from the supplied creator transcript, measured mechanics, labeled frames, Mario source, and content-mode contract.

The reference supplies structure, pacing, shot grammar, and timing only. Never transfer its topic, wording, examples, metaphors, claims, or identity into Mario's plan.

Write every line from Mario's source material. Prefer Mario's own phrasing from the raw capture where it fits the beat's timing and word count; lightly tighten it for speech where needed. Never fabricate a fact, number, name, client, place, event, or outcome about Mario.

[FILL IN] is a last resort, not a default. Use it only when Mario's source genuinely contains nothing that can fill a beat, and name the specific missing detail: [FILL IN — specific missing detail]. If the source has material that could fill a beat with reasonable interpretation, write the line.

For each beat, state its structural job in brief, list source-backed candidate lines, and write a draft line that fits its timing, word count, sentence type, and direct-address setting. Keep every beat within the target runtime. On-screen text must be Mario-owned wording; return an empty string and textPosition "none" when none is needed.

For every line-replacement-map beat, describe what the creator's line does structurally and what it accomplishes at that moment—enough to make Mario's replacement obviously parallel—without quoting or paraphrasing the creator's wording. The replacement line must match the corresponding drafted Mario line.

Follow the supplied content-mode contract exactly, including its close. Production checklist items may use observable shot details from the frames, but must not import creator identity or topic. Return only the strict schema.`,
    input: [{ role: "user", content }],
    text: { format: { type: "json_schema", name: "shot_plan", strict: true, schema: shotPlanJsonSchema } },
  };
}

function shotPlanText(plan: ShotPlan) {
  return [
    ...plan.beats.flatMap((beat) => [beat.brief, ...beat.candidateLines, beat.draftLine, beat.onScreenText?.text ?? ""]),
    ...plan.productionChecklist,
    ...plan.lineReplacementMap.flatMap((item) => [item.structuralRole, item.marioReplacementLine]),
  ].join("\n");
}

function normalizeSourceText(value: string) {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim().replace(/\s+/g, " ");
}

function sourceText(source: BrandSource) {
  return normalizeSourceText([
    source.title,
    source.coreTruth,
    source.storyEvidence,
    source.dispatchWhatHappened,
    source.dispatchSpecificDetail,
    source.dispatchDecision,
    source.dispatchOccurredOn,
    source.dispatchNextImplication,
  ].filter(Boolean).join("\n"));
}

const nonFactWords = new Set(["about", "after", "again", "also", "because", "before", "being", "could", "from", "have", "into", "just", "more", "that", "their", "then", "there", "these", "they", "this", "those", "through", "what", "when", "where", "which", "while", "with", "would", "your"]);

function isSourceBacked(value: string, source: BrandSource) {
  if (value.startsWith("[FILL IN")) return true;
  const normalized = normalizeSourceText(value);
  const material = sourceText(source);
  if (!normalized || !material) return false;
  if (material.includes(normalized)) return true;

  const sourceTokens = new Set(material.split(" "));
  const meaningfulTokens = normalized.split(" ").filter((token) => token.length >= 4 && !nonFactWords.has(token));
  const numbers = normalized.match(/\b\d+(?:\.\d+)?\b/g) ?? [];
  if (numbers.some((number) => !sourceTokens.has(number))) return false;

  const unsupportedNames = value.match(/\b[A-Z][A-Za-z0-9]+\b/g)?.filter((token, index) => {
    if (index === 0 && token !== token.toUpperCase()) return false;
    return !sourceTokens.has(token.toLowerCase());
  }) ?? [];
  if (unsupportedNames.length) return false;
  if (!meaningfulTokens.length) return false;

  const supportedCount = meaningfulTokens.filter((token) => sourceTokens.has(token)).length;
  return supportedCount / meaningfulTokens.length >= 0.6;
}

export function fillUnsupportedBeat(candidateLines: string[], draftLine: string, beatFunction: string, source?: BrandSource) {
  const supported = source ? candidateLines.filter((line) => isSourceBacked(line, source)) : candidateLines;
  if (supported.length && (!source || isSourceBacked(draftLine, source))) return { candidateLines: supported, draftLine };
  const fill = `[FILL IN — Mario source needs material for the ${beatFunction} beat]`;
  return { candidateLines: [fill], draftLine: fill };
}

export function findSharedFiveWordSequences(output: string, transcript: string) {
  const transcriptWindows = new Set<string>();
  const words = normalizeSourceText(transcript).split(" ").filter(Boolean);
  for (let index = 0; index <= words.length - 5; index += 1) transcriptWindows.add(words.slice(index, index + 5).join(" "));
  const outputWords = normalizeSourceText(output).split(" ").filter(Boolean);
  const matches: string[] = [];
  for (let index = 0; index <= outputWords.length - 5; index += 1) {
    const sequence = outputWords.slice(index, index + 5).join(" ");
    if (transcriptWindows.has(sequence)) matches.push(sequence);
  }
  return [...new Set(matches)];
}

export function assertShotPlanSafe(plan: ShotPlan, save: Pick<SavedPost, "creatorTopicTerms" | "analysisTranscript">) {
  const leaks = findCreatorTopicLeaks(shotPlanText(plan), save.creatorTopicTerms ?? []);
  const ngramLeaks = findSharedFiveWordSequences(shotPlanText(plan), save.analysisTranscript ?? "");
  if (leaks.length || ngramLeaks.length) {
    throw new Error(`Shot plan was stopped because it reused creator material: ${[...leaks, ...ngramLeaks].join(", ")}.`);
  }
}

export async function generateShotPlan(save: SavedPost, source: BrandSource, mode: ContentMode): Promise<ShotPlan> {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) throw new Error("OPENAI_API_KEY is not configured.");
  for (let attempt = 0; attempt < 2; attempt += 1) {
    const request = buildShotPlanRequest(save, source, mode);
    if (attempt) request.instructions += " A previous result crossed the creator-content boundary. Rebuild every field from Mario's source while keeping only the reference's structure, pacing, shot grammar, and timing.";
    const response = await fetch("https://api.openai.com/v1/responses", {
      method: "POST",
      headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
      body: JSON.stringify(request),
    });
    if (!response.ok) throw new Error(`OpenAI shot-plan generation failed (${response.status}).`);
    const generated = generatedShotPlanSchema.parse(parseStructuredJson(await response.json()));
    const runtime = targetRuntime(save);
    if (generated.beats.some((beat) => beat.startSeconds + beat.durationSeconds > runtime + 0.1)) {
      throw new Error("Shot plan exceeds the target runtime.");
    }
    if (generated.lineReplacementMap.length !== generated.beats.length) {
      throw new Error("Shot-plan line replacement map does not match its beat count.");
    }

    const beats = generated.beats.map((beat) => {
      const supported = fillUnsupportedBeat(beat.candidateLines, beat.draftLine, beat.beatFunction, source);
      return {
        ...beat,
        ...supported,
        onScreenText: beat.onScreenText
          ? { text: beat.onScreenText, position: beat.textPosition, timing: `${beat.startSeconds.toFixed(1)}–${(beat.startSeconds + beat.durationSeconds).toFixed(1)}s` }
          : null,
      };
    });
    const lineReplacementMap = generated.lineReplacementMap.map((item, index) => ({
      ...item,
      marioReplacementLine: beats[index].draftLine,
    }));
    const rhythmSeconds = cutRhythmSeconds(save);
    const plan: ShotPlan = {
      totalRuntimeSeconds: runtime,
      pacingNote: rhythmSeconds
        ? `Reference cuts every ${rhythmSeconds.toFixed(1)}s; hold that rhythm.`
        : "No detected cuts; use the reference's continuous-take rhythm.",
      beats,
      productionChecklist: generated.productionChecklist,
      lineReplacementMap,
    };
    try {
      assertShotPlanSafe(plan, save);
      return plan;
    } catch (cause) {
      if (attempt === 1) throw cause;
    }
  }
  throw new Error("Shot plan could not clear the creator-topic boundary.");
}
