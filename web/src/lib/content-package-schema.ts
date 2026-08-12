import { z } from "zod";

export const CONTENT_PILLARS = [
  "Reinvention",
  "Identity",
  "Standards",
  "Action",
  "Responsibility",
  "Self-Respect",
  "Perspective",
  "Life Story",
] as const;

const nonEmptyString = z.string().trim().min(1);

export const contentPackageSchema = z
  .object({
    title: nonEmptyString,
    format: z.enum([
      "Yap Reel",
      "Mini Story",
      "POV / Realization",
      "Carousel",
      "Written Post",
      "Long-form",
    ]),
    goal: z.enum(["Reach", "Shares", "Saves", "Follows", "Trust"]),
    pillars: z
      .array(z.enum(CONTENT_PILLARS))
      .min(1)
      .max(2)
      .refine((pillars) => new Set(pillars).size === pillars.length, "Pillars must be distinct."),
    spokenHooks: z.array(nonEmptyString).min(3).max(5),
    onScreenHooks: z.array(nonEmptyString).min(2).max(3),
    selectedHook: nonEmptyString,
    selectedOnScreenHook: nonEmptyString,
    testVariable: z.enum(["Hook", "Topic", "Length", "Format", "CTA", "Visual", "None"]),
    hypothesis: nonEmptyString.refine(
      (value) => /\bif\b[\s\S]*\bthen\b[\s\S]*\bbecause\b/i.test(value),
      "Hypothesis must use an if/then/because structure.",
    ),
    skeleton: z.array(nonEmptyString).min(4),
    closingLine: nonEmptyString,
  })
  .superRefine((content, context) => {
    if (!content.spokenHooks.includes(content.selectedHook)) {
      context.addIssue({
        code: "custom",
        path: ["selectedHook"],
        message: "Selected spoken hook must be one of the spoken hook options.",
      });
    }

    if (!content.onScreenHooks.includes(content.selectedOnScreenHook)) {
      context.addIssue({
        code: "custom",
        path: ["selectedOnScreenHook"],
        message: "Selected on-screen hook must be one of the on-screen hook options.",
      });
    }
  });

export type GeneratedContentPackage = z.infer<typeof contentPackageSchema>;
