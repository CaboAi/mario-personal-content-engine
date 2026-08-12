import { NextResponse } from "next/server";
import { z } from "zod";
import type { CarouselPublication } from "@/lib/domain";
import { rejectCrossOrigin, requireDashboardSession } from "@/lib/api-auth";
import {
  createCarouselChildren, createCarouselContainer, fetchInstagramMedia,
  getContainerStatus, getPublishingLimit, isMetaConfigured, publishContainer,
} from "@/lib/meta";
import { isLiveMode, supabaseRequest } from "@/lib/supabase-rest";

type PublicationRow = {
  id: string; content_id: string; status: CarouselPublication["status"];
  asset_urls: string[]; alt_texts: string[]; caption: string;
  child_container_ids: string[]; carousel_container_id?: string;
  attempt_count: number;
};

async function patchJob(id: string, body: Record<string, unknown>) {
  await supabaseRequest<void>(`carousel_publications?id=eq.${encodeURIComponent(id)}`, {
    method: "PATCH", headers: { Prefer: "return=minimal" },
    body: JSON.stringify({ ...body, updated_at: new Date().toISOString() }),
  });
}

export async function POST(request: Request, { params }: { params: Promise<{ contentId: string }> }) {
  if (!isLiveMode()) return NextResponse.json({ error: "Supabase is not configured." }, { status: 503 });
  if (!isMetaConfigured()) return NextResponse.json({ error: "Meta publishing is not configured." }, { status: 503 });
  const originError = rejectCrossOrigin(request); if (originError) return originError;
  const sessionError = await requireDashboardSession(); if (sessionError) return sessionError;
  const { contentId } = await params;
  if (!z.string().uuid().safeParse(contentId).success) return NextResponse.json({ error: "Invalid content ID." }, { status: 400 });
  if (Number(request.headers.get("content-length") || 0) > 4_096) {
    return NextResponse.json({ error: "Request is too large." }, { status: 413 });
  }
  const decoded = await request.json().catch(() => ({}));
  if (!z.object({ confirmed: z.literal(true) }).safeParse(decoded).success) {
    return NextResponse.json({ error: "Review confirmation is required before publishing." }, { status: 400 });
  }

  const rows = await supabaseRequest<PublicationRow[]>(
    `carousel_publications?content_id=eq.${encodeURIComponent(contentId)}&select=*`,
  );
  const job = rows[0];
  if (!job) return NextResponse.json({ error: "Validate the carousel assets first." }, { status: 409 });
  if (job.status === "Published") return NextResponse.json({ error: "This carousel is already published." }, { status: 409 });

  try {
    await patchJob(job.id, { status: "Processing", attempt_count: job.attempt_count + 1, last_error: null });
    let containerId = job.carousel_container_id;
    if (!containerId) {
      await getPublishingLimit();
      const children = await createCarouselChildren(job.asset_urls, job.alt_texts);
      const parent = await createCarouselContainer(children, job.caption);
      containerId = parent.id;
      await patchJob(job.id, { child_container_ids: children, carousel_container_id: containerId });
    }
    const container = await getContainerStatus(containerId);
    if (container.status_code === "IN_PROGRESS") {
      const current = await supabaseRequest<CarouselPublication[]>(
        `dashboard_carousel_publications?contentId=eq.${encodeURIComponent(contentId)}&select=*`,
      );
      return NextResponse.json({ publication: current[0], message: "Meta is processing the carousel. Check and publish again in about one minute." }, { status: 202 });
    }
    if (container.status_code !== "FINISHED") {
      throw new Error(`Meta container is not publishable (${container.status_code || "unknown"}).`);
    }
    const published = await publishContainer(containerId);
    const media = await fetchInstagramMedia(published.id);
    const finalized = await supabaseRequest<CarouselPublication[]>("rpc/finalize_carousel_publication", {
      method: "POST",
      body: JSON.stringify({
        p_job_id: job.id,
        p_instagram_media_id: published.id,
        p_permalink: media.permalink || "",
        p_media_product_type: media.media_product_type || media.media_type || "CAROUSEL",
        p_published_at: media.timestamp || new Date().toISOString(),
      }),
    });
    return NextResponse.json({ publication: finalized[0] });
  } catch (cause) {
    const message = cause instanceof Error ? cause.message : "Carousel publishing failed.";
    await patchJob(job.id, { status: "Failed", last_error: message }).catch(() => undefined);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
