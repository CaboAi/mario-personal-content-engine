import { z } from "zod";
import { CONTENT_PILLARS } from "./content-package-schema";
import { DISPATCH_FRESHNESS_DAYS, isFreshDispatchSource } from "./brand-source-eligibility";

const nonEmptyString = z.string().optional().transform((value) => value ?? "")
  .pipe(z.string().trim().min(1, "Required."));
const dateString = z.string().optional().transform((value) => value ?? "")
  .pipe(z.string().trim().min(1, "Required.").regex(/^\d{4}-\d{2}-\d{2}$/, "Enter a valid date."));

const sharedSourceFields = {
  title: nonEmptyString,
  coreTruth: nonEmptyString,
  storyEvidence: nonEmptyString,
  pillars: z.array(z.enum(CONTENT_PILLARS)).min(1, "Choose at least one pillar."),
  privacyStatus: z.enum(["Clear", "Needs confirmation"]),
  status: z.enum(["Captured", "Verified", "Used"]),
};

const storySourceSchema = z.object({
  sourceType: z.enum(["Story", "Daily Entry"]),
  ...sharedSourceFields,
});

const dispatchSourceSchema = z.object({
  sourceType: z.literal("Dispatch"),
  ...sharedSourceFields,
  dispatchWhatHappened: nonEmptyString,
  dispatchSpecificDetail: nonEmptyString,
  dispatchDecision: nonEmptyString,
  dispatchOccurredOn: dateString,
  dispatchNextImplication: nonEmptyString,
});

export const brandSourceCaptureSchema = z.discriminatedUnion("sourceType", [
  storySourceSchema,
  dispatchSourceSchema,
]);

export type BrandSourceCapture = z.infer<typeof brandSourceCaptureSchema>;
export type FieldErrors = Record<string, string>;

function fieldErrors(error: z.ZodError): FieldErrors {
  return error.issues.reduce<FieldErrors>((errors, issue) => {
    const field = issue.path[0];
    if (typeof field === "string" && !errors[field]) errors[field] = issue.message;
    return errors;
  }, {});
}

export function validateBrandSourceCapture(input: unknown, now = new Date()):
  | { success: true; data: BrandSourceCapture }
  | { success: false; fieldErrors: FieldErrors } {
  const parsed = brandSourceCaptureSchema.safeParse(input);
  if (!parsed.success) return { success: false, fieldErrors: fieldErrors(parsed.error) };
  if (parsed.data.sourceType === "Dispatch" && !isFreshDispatchSource({
    sourceType: "Dispatch",
    dispatchOccurredOn: parsed.data.dispatchOccurredOn,
    dispatchFreshnessDays: DISPATCH_FRESHNESS_DAYS,
  }, now)) {
    return {
      success: false,
      fieldErrors: {
        dispatchOccurredOn: "This Dispatch would be created expired and belongs in the story bank instead.",
      },
    };
  }
  return { success: true, data: parsed.data };
}
