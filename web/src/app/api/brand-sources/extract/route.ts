import { NextResponse } from "next/server";
import { z } from "zod";
import { rejectCrossOrigin, requireDashboardSession } from "@/lib/api-auth";
import {
  assertExtractionGrounded,
  brandSourceExtractionSchema,
  BRAND_SOURCE_EXTRACTION_SYSTEM_PROMPT,
  normalizeExtractedSource,
} from "@/lib/brand-source-extraction";
import { CONTENT_PILLARS } from "@/lib/content-package-schema";
import { parseStructuredJson } from "@/lib/openai-response";

const requestSchema = z.object({
  rawText: z.string().trim().min(1, "Write the raw capture before extracting.").max(12_000),
  occurredOn: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional().or(z.literal("")),
});

export async function POST(request: Request) {
  const sessionError = await requireDashboardSession();
  if (sessionError) return sessionError;
  const originError = rejectCrossOrigin(request);
  if (originError) return originError;
  if (Number(request.headers.get("content-length") || 0) > 32_768) {
    return NextResponse.json({ error: "Request is too large." }, { status: 413 });
  }

  const parsed = requestSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: "Review the highlighted fields.", fieldErrors: {
      rawText: parsed.error.issues[0]?.message ?? "Write the raw capture before extracting.",
    } }, { status: 400 });
  }

  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) return NextResponse.json({ error: "OPENAI_API_KEY is not configured." }, { status: 503 });

  try {
    const response = await fetch("https://api.openai.com/v1/responses", {
      method: "POST",
      headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        model: process.env.OPENAI_MODEL || "gpt-5-mini",
        instructions: BRAND_SOURCE_EXTRACTION_SYSTEM_PROMPT,
        input: JSON.stringify({
          rawText: parsed.data.rawText,
          optionalOccurredOn: parsed.data.occurredOn || "",
          today: new Date().toISOString().slice(0, 10),
          canonicalPillars: CONTENT_PILLARS,
        }),
        text: { format: {
          type: "json_schema",
          name: "brand_source_extraction",
          strict: true,
          schema: z.toJSONSchema(brandSourceExtractionSchema),
        } },
      }),
    });
    if (!response.ok) throw new Error(`OpenAI extraction failed (${response.status}).`);
    const proposal = brandSourceExtractionSchema.parse(parseStructuredJson(await response.json()));
    assertExtractionGrounded(parsed.data.rawText, proposal);
    return NextResponse.json({ proposal: normalizeExtractedSource(proposal) });
  } catch (cause) {
    return NextResponse.json({
      error: cause instanceof Error ? cause.message : "Source extraction failed.",
    }, { status: 422 });
  }
}
