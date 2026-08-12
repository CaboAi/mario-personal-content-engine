import { describe, expect, it } from "vitest";
import { extractStructuredText, parseStructuredJson } from "./openai-response";

describe("OpenAI structured response parsing", () => {
  it("joins structured output split across response content parts", () => {
    const result = {
      output: [
        { content: [{ type: "output_text", text: '{"pairings":' }] },
        { content: [{ type: "output_text", text: "[]}" }] },
      ],
    };
    expect(extractStructuredText(result)).toBe('{"pairings":[]}');
    expect(parseStructuredJson(result)).toEqual({ pairings: [] });
  });

  it("rejects malformed structured JSON with a stable error", () => {
    expect(() => parseStructuredJson({ output_text: "{" })).toThrow(
      "OpenAI returned invalid structured JSON.",
    );
  });
});
