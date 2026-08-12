type ResponseContent = { type?: string; text?: string };
type ResponseOutput = { content?: ResponseContent[] };

export function extractStructuredText(result: {
  output_text?: unknown;
  output?: ResponseOutput[];
}) {
  if (typeof result.output_text === "string" && result.output_text.trim()) {
    return result.output_text.trim();
  }
  const joined = (result.output ?? [])
    .flatMap((item) => item.content ?? [])
    .filter((part) => part.type === "output_text" && typeof part.text === "string")
    .map((part) => part.text)
    .join("")
    .trim();
  if (!joined) throw new Error("OpenAI returned no structured output.");
  return joined;
}

export function parseStructuredJson(result: {
  output_text?: unknown;
  output?: ResponseOutput[];
}) {
  const text = extractStructuredText(result);
  try {
    return JSON.parse(text) as unknown;
  } catch {
    throw new Error("OpenAI returned invalid structured JSON.");
  }
}
