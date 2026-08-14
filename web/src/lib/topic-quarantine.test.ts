import { describe, expect, it } from "vitest";
import { assertTopicNeutralDelivery, findCreatorTopicLeaks } from "./topic-quarantine";

describe("topic quarantine", () => {
  it("detects precise creator-topic phrases", () => {
    expect(findCreatorTopicLeaks("Open by asking why your real estate leads are cold.", ["real estate leads", "content"])).toEqual(["real estate leads"]);
  });

  it("ignores generic single words that can describe delivery", () => {
    expect(findCreatorTopicLeaks("A creator opens the video with a direct question.", ["creator", "video"])).toEqual([]);
  });

  it("rejects delivery DNA that still contains creator substance", () => {
    expect(() => assertTopicNeutralDelivery({ frameworkDna: "Problem, proof, payoff", hookMechanics: "Ask why the real estate leads are cold", visualPacing: "Fast cuts" }, ["real estate leads"]))
      .toThrow(/quarantined creator substance/);
  });
});
