import { z } from "zod";

const jpegUrl = z.string().trim().url().superRefine((value, context) => {
  const url = new URL(value);
  if (url.protocol !== "https:") {
    context.addIssue({ code: "custom", message: "Carousel assets must use HTTPS." });
  }
  const host = url.hostname.toLowerCase();
  if (host === "localhost" || host.endsWith(".local") || /^(127\.|10\.|192\.168\.|169\.254\.)/.test(host)) {
    context.addIssue({ code: "custom", message: "Carousel assets must be publicly reachable." });
  }
  if (!/\.jpe?g$/i.test(url.pathname)) {
    context.addIssue({ code: "custom", message: "Meta carousel images must be JPEG files." });
  }
});

export const carouselDraftSchema = z.object({
  assetUrls: z.array(jpegUrl).min(2).max(10),
  altTexts: z.array(z.string().trim().min(1).max(1_000)).min(2).max(10),
  caption: z.string().trim().max(2_200),
}).superRefine((draft, context) => {
  if (draft.assetUrls.length !== draft.altTexts.length) {
    context.addIssue({ code: "custom", path: ["altTexts"], message: "Each asset requires matching alt text." });
  }
});
