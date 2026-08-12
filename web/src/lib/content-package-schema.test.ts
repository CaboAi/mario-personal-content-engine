import { describe, expect, it } from "vitest";
import { CONTENT_PILLARS, contentPackageSchema } from "./content-package-schema";

const validPackage = {
  title: "Start before you are ready",
  format: "Yap Reel" as const,
  goal: "Reach" as const,
  pillars: ["Action", "Reinvention"] as const,
  spokenHooks: [
    "Waiting is still a choice.",
    "You will not wake up ready.",
    "The comeback starts before confidence.",
  ],
  onScreenHooks: ["START BEFORE YOU'RE READY", "WAITING IS A CHOICE"],
  selectedHook: "Waiting is still a choice.",
  selectedOnScreenHook: "WAITING IS A CHOICE",
  testVariable: "Hook" as const,
  hypothesis:
    "If the opener states the tension immediately, then three-second retention should improve because the right viewer recognizes the problem before scrolling.",
  skeleton: ["Opening tension", "Mario receipt", "What changed", "Earned opinion"],
  closingLine: "Begin before confidence catches up.",
};

describe("generated content package validation", () => {
  it("accepts one or two canonical pillars and consistent hook selections", () => {
    expect(contentPackageSchema.parse(validPackage)).toMatchObject(validPackage);
    expect(CONTENT_PILLARS).toHaveLength(8);
  });

  it("rejects descriptive or unknown pillar text", () => {
    expect(() =>
      contentPackageSchema.parse({
        ...validPackage,
        pillars: ["Starting over by doing the work"],
      }),
    ).toThrow();
  });

  it("rejects more than two pillars", () => {
    expect(() =>
      contentPackageSchema.parse({
        ...validPackage,
        pillars: ["Action", "Reinvention", "Identity"],
      }),
    ).toThrow();
  });

  it("rejects a duplicated primary pillar as the secondary pillar", () => {
    expect(() =>
      contentPackageSchema.parse({
        ...validPackage,
        pillars: ["Action", "Action"],
      }),
    ).toThrow("Pillars must be distinct.");
  });

  it("rejects a selected spoken hook that is not an offered option", () => {
    expect(() =>
      contentPackageSchema.parse({
        ...validPackage,
        selectedHook: "A hook the user was never shown.",
      }),
    ).toThrow("Selected spoken hook must be one of the spoken hook options.");
  });

  it("rejects a selected on-screen hook that is not an offered option", () => {
    expect(() =>
      contentPackageSchema.parse({
        ...validPackage,
        selectedOnScreenHook: "AN UNLISTED OVERLAY",
      }),
    ).toThrow("Selected on-screen hook must be one of the on-screen hook options.");
  });

  it("requires an if/then/because hypothesis", () => {
    expect(() =>
      contentPackageSchema.parse({
        ...validPackage,
        hypothesis: "A blunt hook should perform better.",
      }),
    ).toThrow("Hypothesis must use an if/then/because structure.");
  });
});
