import { z } from "zod";

const nonEmptyString = z.string().trim().min(1);

export const fullScriptSchema = z.object({
  script: nonEmptyString.min(80),
  riskLines: z.array(nonEmptyString).max(5),
});

export type GeneratedFullScript = z.infer<typeof fullScriptSchema>;
