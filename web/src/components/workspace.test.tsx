// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { Workspace } from "./workspace";
import { demoData, generatedDemoPackage } from "@/lib/demo-data";
import type { BrandSourceInventory } from "@/lib/domain";

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

function usableSource(id: string, sourceType: "Story" | "Daily Entry" = "Story"): BrandSourceInventory {
  return {
    id, sourceType, title: `${sourceType} source`, coreTruth: "A verified Mario-owned truth.",
    storyEvidence: "Concrete verified evidence.", privacyStatus: "Clear", pillars: ["Action"],
    status: "Verified", retired: false, updatedAt: "2026-09-08T00:00:00Z", usageCount: 0,
  };
}

function openProduction(cta?: string) {
  render(
    <Workspace
      initialData={{
        ...demoData,
        content: [{ ...generatedDemoPackage, cta }],
      }}
    />,
  );
  fireEvent.click(screen.getByRole("button", { name: /Production/ }));
}

describe("Production package instructions", () => {
  it("keeps every primary destination accessible through the compact navigation", () => {
    render(<Workspace initialData={demoData} />);

    expect(screen.getByRole("button", { name: "Command Center" }).getAttribute("aria-current")).toBe("page");
    expect(screen.getAllByRole("navigation")[0].querySelectorAll("button")).toHaveLength(7);
    expect(Array.from(screen.getAllByRole("navigation")[0].querySelectorAll("button")).map((button) => button.getAttribute("aria-label"))).toEqual([
      "Command Center", "Capture", "Saves Inbox", "Production", "Calendar", "Performance", "Brand System",
    ]);

    fireEvent.click(screen.getByRole("button", { name: "Production" }));
    expect(screen.getByRole("button", { name: "Production" }).getAttribute("aria-current")).toBe("page");
  });

  it("shows batch packages in the editorial calendar and permits a date change", async () => {
    const item = { ...generatedDemoPackage, id: "calendar-package", batchId: "batch-1", plannedFor: "2026-08-17" };
    render(<Workspace initialData={{
      ...demoData,
      content: [item],
      batches: [{
        id: "batch-1",
        title: "15-Day Content Test Calendar",
        description: "Test batch",
        timezone: "America/Chihuahua",
        startsOn: "2026-08-17",
        endsOn: "2026-08-31",
        createdAt: "2026-08-16T00:00:00Z",
      }],
    }} />);

    fireEvent.click(screen.getByRole("button", { name: "Calendar" }));
    expect(screen.getByText("Editorial calendar")).toBeTruthy();
    expect(screen.getByText(item.title)).toBeTruthy();
    const date = screen.getByLabelText(`Planned date for ${item.title}`);
    fireEvent.change(date, { target: { value: "2026-08-18" } });
    await waitFor(() => expect((date as HTMLInputElement).value).toBe("2026-08-18"));
  });

  it("keeps automatic save-inspection details out of the review workspace", () => {
    render(<Workspace initialData={{
      ...demoData,
      saves: [{ ...demoData.saves[0], status: "New", pairings: [], analysisMethod: undefined }],
    }} />);
    fireEvent.click(screen.getByRole("button", { name: "Saves Inbox" }));

    expect(screen.queryByText("The system studies the post. Your notes are optional.")).toBeNull();
    expect(screen.queryByText(/what made you save this/i)).toBeNull();
    expect(screen.queryByRole("button", { name: /automatic inspection/i })).toBeNull();
  });

  it("explains why the three Mario directions are different", () => {
    render(<Workspace initialData={{
      ...demoData,
      sources: demoData.saves[0].pairings.map((pairing, index) => usableSource(`current-source-${index}`)),
      saves: [{
        ...demoData.saves[0],
        analysisMethod: "Automatic media inspection",
        analysisEvidenceSummary: "Speech and delivery evidence inspected without storing creator media.",
        pairings: demoData.saves[0].pairings.map((pairing, index) => ({
          ...pairing,
          brandSourceId: `current-source-${index}`,
          sourceType: "Story" as const,
          privacyStatus: "Clear" as const,
          retired: false,
          selectionRole: (["Best structural fit", "Different Mario lens", "Credible wildcard"] as const)[index],
        })),
      }],
    }} />);
    fireEvent.click(screen.getByRole("button", { name: "Saves Inbox" }));

    expect(screen.queryByText("Automatic media inspection")).toBeNull();
    expect(screen.getByText("Step 1 · Mario-owned direction")).toBeTruthy();
    expect(screen.getByText("Step 2 · Content mode")).toBeTruthy();
    expect(screen.getByRole("radio", { name: /Dispatch/ })).toBeTruthy();
    expect(screen.getByText("Best structural fit")).toBeTruthy();
    expect(screen.getByText("Different Mario lens")).toBeTruthy();
    expect(screen.getByText("Credible wildcard")).toBeTruthy();
    expect(screen.getByText(/Pillars organize these ideas/)).toBeTruthy();
  });

  it("distinguishes recorded lines, visual text, prompts, and internal notes", () => {
    openProduction();

    expect(screen.getByText("Recommended spoken hook")).toBeTruthy();
    expect(screen.getByText("Alternative spoken hooks")).toBeTruthy();
    expect(screen.getByText("On-screen hook")).toBeTruthy();
    expect(screen.getByText("Alternative on-screen hooks")).toBeTruthy();
    expect(screen.getByText("Talking prompts—not a script")).toBeTruthy();
    expect(screen.getByText("Internal test note—do not record")).toBeTruthy();
    expect(screen.getByText("Final spoken line")).toBeTruthy();
    expect(screen.queryByText("Optional CTA")).toBeNull();
  });

  it("shows an optional CTA only when the package includes one", () => {
    openProduction("Save this for the day you start negotiating with yourself.");

    expect(screen.getByText("Optional CTA")).toBeTruthy();
    expect(
      screen.getByText("Save this for the day you start negotiating with yourself."),
    ).toBeTruthy();
  });

  it("shows the Mario source and saved creator as two different influences", () => {
    openProduction();

    expect(screen.getByText("Mario-owned substance")).toBeTruthy();
    expect(screen.getByText("You'll Never Be Ready")).toBeTruthy();
    expect(screen.getByText("Delivery influence from Saves Inbox")).toBeTruthy();
    expect(screen.getByText("@higherupwellness · Reel")).toBeTruthy();
    expect(screen.getByRole("link", { name: "Open saved post" }).getAttribute("href"))
      .toBe(demoData.saves[0].url);
    expect(screen.getByText(/structure and presentation only—not the topic or message/)).toBeTruthy();
  });

  it("offers and generates an optional full script when Mario is stuck", async () => {
    openProduction();

    expect(screen.getByText("Stuck on what to say?")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Generate full script" }));

    await waitFor(() => expect(screen.getByText("A word-for-word starting point")).toBeTruthy());
    expect(screen.getByRole("button", { name: "Copy" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "Regenerate" })).toBeTruthy();
  });

  it("offers an optional short script for a POV realization", () => {
    render(
      <Workspace initialData={{
        ...demoData,
        content: [{ ...generatedDemoPackage, format: "POV / Realization", status: "Concept Ready" }],
      }} />,
    );
    fireEvent.click(screen.getByRole("button", { name: /Production/ }));

    expect(screen.getByRole("button", { name: "Generate full script" })).toBeTruthy();
    expect(screen.getByText("Stuck on what to say?")).toBeTruthy();
  });

  it("keeps carousels in the Canva copy workflow without a script option", () => {
    render(
      <Workspace initialData={{
        ...demoData,
        content: [{ ...generatedDemoPackage, format: "Carousel", status: "Copy Ready" }],
      }} />,
    );
    fireEvent.click(screen.getByRole("button", { name: /Production/ }));

    expect(screen.queryByRole("button", { name: /Generate full script/ })).toBeNull();
    expect(screen.getByLabelText("Carousel status")).toBeTruthy();
  });

  it("keeps posted items out of the active workbench and removes Media ID linking", () => {
    render(
      <Workspace initialData={{
        ...demoData,
        content: [{ ...generatedDemoPackage, status: "Posted" }],
      }} />,
    );
    fireEvent.click(screen.getByRole("button", { name: /Production/ }));

    expect(screen.getByText("Everything here has been posted.")).toBeTruthy();
    expect(screen.getByRole("button", { name: "Show posted archive (1)" })).toBeTruthy();
    expect(screen.queryByText("Link the Instagram post")).toBeNull();
    expect(screen.queryByText("Instagram Media ID")).toBeNull();

    fireEvent.click(screen.getByRole("button", { name: "Show posted archive (1)" }));
    expect(screen.getByText(generatedDemoPackage.title)).toBeTruthy();
  });

  it("clears a package from the workbench as soon as it is marked Posted", async () => {
    openProduction();
    fireEvent.change(screen.getByLabelText("Reel status"), { target: { value: "Posted" } });

    await waitFor(() => expect(screen.getByText("Everything here has been posted.")).toBeTruthy());
    expect(screen.queryByText(generatedDemoPackage.title)).toBeNull();
    expect(screen.getByRole("button", { name: "Show posted archive (1)" })).toBeTruthy();
  });

  it("removes a draft from the active workbench and restores it from a collapsed list", async () => {
    openProduction();

    fireEvent.click(screen.getByRole("button", { name: "Remove from Production" }));

    await waitFor(() =>
      expect(screen.getByText(/Removed “Readiness Is a Decision” from Production/)).toBeTruthy(),
    );
    expect(screen.queryByRole("button", { name: "Remove from Production" })).toBeNull();
    expect(screen.getByText("No active production drafts.")).toBeTruthy();
    const removedSection = screen.getByText("Removed drafts").closest("details");
    expect(removedSection?.hasAttribute("open")).toBe(false);
    expect(screen.getByRole("button", { name: "Restore" })).toBeTruthy();

    fireEvent.click(screen.getByRole("button", { name: "Restore" }));

    await waitFor(() =>
      expect(screen.getByText(/Restored “Readiness Is a Decision” to the active workbench/)).toBeTruthy(),
    );
    expect(screen.getByRole("button", { name: "Remove from Production" })).toBeTruthy();
    expect(screen.queryByText("Removed drafts")).toBeNull();
  });

  it("keeps archived and posted packages out of the active count", () => {
    render(
      <Workspace
        initialData={{
          ...demoData,
          content: [
            { ...generatedDemoPackage, id: "active", title: "Active draft" },
            { ...generatedDemoPackage, id: "removed", title: "Removed draft", archivedAt: "2026-08-12T00:00:00Z" },
            { ...generatedDemoPackage, id: "posted", title: "Posted package", status: "Posted" },
          ],
        }}
      />,
    );
    fireEvent.click(screen.getByRole("button", { name: /Production/ }));

    expect(screen.getByText("1 active package")).toBeTruthy();
    expect(screen.getByRole("button", { name: "Remove from Production" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "Show posted archive (1)" })).toBeTruthy();
    expect(screen.getByText("Removed drafts")).toBeTruthy();
  });

  it("persists removal through the archive endpoint", async () => {
    const item = {
      ...generatedDemoPackage,
      id: "98e4ea33-a52a-41f4-b39d-5979f22fc6a2",
    };
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({ content: { ...item, archivedAt: "2026-08-12T12:00:00Z" } }),
        { status: 200, headers: { "Content-Type": "application/json" } },
      ),
    );
    vi.stubGlobal("fetch", fetchMock);
    render(
      <Workspace
        initialData={{ ...demoData, content: [item], liveMode: true }}
      />,
    );
    fireEvent.click(screen.getByRole("button", { name: /Production/ }));
    fireEvent.click(screen.getByRole("button", { name: "Remove from Production" }));

    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));
    expect(fetchMock).toHaveBeenCalledWith(
      `/api/content/${item.id}/archive`,
      expect.objectContaining({
        method: "POST",
        body: JSON.stringify({ archived: true }),
      }),
    );
    await waitFor(() => expect(screen.getByRole("button", { name: "Restore" })).toBeTruthy());
  });

  it("hands carousel copy to Canva without exposing Meta publishing controls", async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, "clipboard", {
      configurable: true,
      value: { writeText },
    });
    render(
      <Workspace
        initialData={{
          ...demoData,
          content: [{
            ...generatedDemoPackage,
            format: "Carousel",
            status: "Copy Ready",
            closingLine: "Choose the imperfect start.",
            cta: "Save this before you wait again.",
            caption: "Build before confidence arrives.",
            carouselSlides: [
              { headline: "Start", body: "The opening", altText: "Opening slide" },
              { headline: "Finish", body: "The close", altText: "Closing slide" },
            ],
          }],
        }}
      />,
    );
    fireEvent.click(screen.getByRole("button", { name: /Production/ }));

    expect(screen.getByText("Canva production")).toBeTruthy();
    expect(screen.getByText("Copy, design in Canva, then post from your phone")).toBeTruthy();
    expect(screen.getByText("Exact slide sequence")).toBeTruthy();
    expect(screen.getByText("Recommended opening line")).toBeTruthy();
    expect(screen.getByText("Carousel cover hook")).toBeTruthy();
    expect(screen.getByText("Carousel argument outline")).toBeTruthy();
    expect(screen.getByText("Final slide line")).toBeTruthy();
    expect(screen.getByText(/Nothing is published or sent to Meta/)).toBeTruthy();
    expect(screen.queryByPlaceholderText("https://…/slide.jpg")).toBeNull();
    expect(screen.queryByRole("button", { name: /publish carousel/i })).toBeNull();
    expect(screen.queryByText("Carousel slide plan")).toBeNull();
    expect(screen.getByRole("button", { name: "Copy slide 1" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "Copy caption" })).toBeTruthy();
    expect(screen.getByText("Finish in Canva")).toBeTruthy();

    fireEvent.click(screen.getByRole("button", { name: "Copy all for Canva" }));
    await waitFor(() => expect(writeText).toHaveBeenCalledTimes(1));
    const copied = writeText.mock.calls[0][0] as string;
    expect(copied).toContain("SLIDE 1 (COVER)\nStart\nThe opening");
    expect(copied).toContain("SLIDE 2\nFinish\nThe close");
    expect(copied).toContain("FINAL SLIDE LINE\nChoose the imperfect start.");
    expect(copied).toContain("OPTIONAL CTA\nSave this before you wait again.");
    expect(copied).toContain("INSTAGRAM CAPTION\nBuild before confidence arrives.");
    expect(screen.getByRole("button", { name: "Copied for Canva" })).toBeTruthy();
  });

  it("does not duplicate a closing line or CTA already present on the final slide", async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, "clipboard", {
      configurable: true,
      value: { writeText },
    });
    const closingLine = "Begin before confidence arrives.";
    const cta = "Save this for the next hard start.";
    render(
      <Workspace
        initialData={{
          ...demoData,
          content: [{
            ...generatedDemoPackage,
            format: "Carousel",
            status: "Copy Ready",
            closingLine,
            cta,
            carouselSlides: [
              { headline: "Start", body: "The opening", altText: "Opening slide" },
              { headline: closingLine, body: cta, altText: "Closing slide" },
            ],
          }],
        }}
      />,
    );
    fireEvent.click(screen.getByRole("button", { name: /Production/ }));
    fireEvent.click(screen.getByRole("button", { name: "Copy all for Canva" }));

    await waitFor(() => expect(writeText).toHaveBeenCalledTimes(1));
    const copied = writeText.mock.calls[0][0] as string;
    expect(copied).not.toContain("FINAL SLIDE LINE");
    expect(copied).not.toContain("OPTIONAL CTA");
    expect(copied.split(closingLine)).toHaveLength(2);
    expect(copied.split(cta)).toHaveLength(2);
  });

  it("uses a design workflow for carousels instead of video recording statuses", () => {
    render(
      <Workspace
        initialData={{
          ...demoData,
          content: [{
            ...generatedDemoPackage,
            format: "Carousel",
            status: "Copy Ready",
            carouselSlides: [
              { headline: "Start", body: "The opening", altText: "Opening slide" },
              { headline: "Finish", body: "The close", altText: "Closing slide" },
            ],
          }],
        }}
      />,
    );
    fireEvent.click(screen.getByRole("button", { name: /Production/ }));

    const status = screen.getByLabelText("Carousel status") as HTMLSelectElement;
    expect(Array.from(status.options).map((option) => option.value)).toEqual([
      "Copy Ready",
      "Designing in Canva",
      "Design Ready",
      "Posted",
    ]);
    expect(screen.queryByRole("option", { name: "Ready to Record" })).toBeNull();
  });

  it("uses an honest concept-first workflow for lightweight POV Reels", () => {
    render(<Workspace initialData={{
      ...demoData,
      content: [{ ...generatedDemoPackage, format: "POV / Realization", status: "Concept Ready" }],
    }} />);
    fireEvent.click(screen.getByRole("button", { name: /Production/ }));

    const status = screen.getByLabelText("Reel status") as HTMLSelectElement;
    expect(Array.from(status.options).map((option) => option.value)).toEqual([
      "Concept Ready", "Ready to Record", "Recorded", "Edited", "Scheduled", "Posted",
    ]);
    expect(screen.queryByRole("option", { name: "Script Ready" })).toBeNull();
  });

  it.each(["Written Post", "Long-form"] as const)(
    "uses writing stages and a written draft for %s",
    (format) => {
      render(<Workspace initialData={{
        ...demoData,
        content: [{ ...generatedDemoPackage, format, status: "Outline Ready" }],
      }} />);
      fireEvent.click(screen.getByRole("button", { name: /Production/ }));

      const status = screen.getByLabelText("Writing status") as HTMLSelectElement;
      expect(Array.from(status.options).map((option) => option.value)).toEqual([
        "Outline Ready", "Drafting", "Final Copy", "Scheduled", "Posted",
      ]);
      expect(screen.getByRole("button", { name: "Generate full written draft" })).toBeTruthy();
      expect(screen.getByText("Internal test note—not part of the post")).toBeTruthy();
      expect(screen.queryByRole("option", { name: "Ready to Record" })).toBeNull();
    },
  );
});

describe("Live brand source inventory", () => {
  it("starts source capture with a raw brain dump and corrected defaults in review", async () => {
    render(<Workspace initialData={demoData} />);
    fireEvent.click(screen.getByRole("button", { name: "Capture" }));

    expect(screen.getByLabelText("Raw source")).toBeTruthy();
    expect(screen.queryByLabelText("What happened")).toBeNull();
    expect(screen.queryByLabelText("Title")).toBeNull();

    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(JSON.stringify({ proposal: {
      sourceType: "Dispatch", classificationReason: "A current decision is present.", title: "A working title",
      coreTruth: "A clear claim.", storyEvidence: "A concrete detail.", pillars: ["Action"],
      dispatchWhatHappened: "The event.", dispatchSpecificDetail: "The detail.",
      dispatchDecision: "The decision.", dispatchOccurredOn: "2026-09-08", dispatchNextImplication: "The next one.", missingFields: [],
      fieldEvidence: { title: "The raw source.", coreTruth: "The raw source.", pillars: "The raw source." },
    }, approximateFields: ["storyEvidence"] }), { status: 200, headers: { "Content-Type": "application/json" } })));
    fireEvent.change(screen.getByLabelText("Raw source"), { target: { value: "The raw source." } });
    fireEvent.click(screen.getByRole("button", { name: "Extract" }));

    await waitFor(() => expect(screen.getByLabelText("Classification")).toBeTruthy());
    expect(screen.getByLabelText("What happened")).toBeTruthy();
    expect(screen.getByLabelText("The number or specific detail")).toBeTruthy();
    expect(screen.getByLabelText("The decision you made or are making")).toBeTruthy();
    expect(screen.getByLabelText("When it happened (date)")).toBeTruthy();
    expect(screen.getByLabelText("What it means for the next one")).toBeTruthy();
    expect((screen.getByLabelText("Privacy status") as HTMLSelectElement).value).toBe("Clear");
    expect((screen.getByLabelText("Status") as HTMLSelectElement).value).toBe("Verified");
    expect(screen.getByText("Excerpt approximate — confirm this is what you meant.")).toBeTruthy();
  });

  it("keeps the raw capture visible when strict factual extraction fails", async () => {
    render(<Workspace initialData={demoData} />);
    fireEvent.click(screen.getByRole("button", { name: "Capture" }));
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(JSON.stringify({
      error: "Extraction was stopped because storyEvidence lacks a supporting excerpt from the raw capture. Claimed excerpt: \"made up result\".",
    }), { status: 422, headers: { "Content-Type": "application/json" } })));

    const rawCapture = screen.getByLabelText("Raw source") as HTMLTextAreaElement;
    fireEvent.change(rawCapture, { target: { value: "The event that needs a clearer detail." } });
    fireEvent.click(screen.getByRole("button", { name: "Extract" }));

    await waitFor(() => expect(screen.getByRole("alert").textContent).toMatch(/Claimed excerpt: "made up result"/));
    expect(rawCapture.value).toBe("The event that needs a clearer detail.");
  });

  it("names the required intake when the recorded inventory has no usable source", () => {
    render(
      <Workspace initialData={{
        ...demoData,
        sources: [{
          id: "retired-source", sourceType: "Existing Content", title: "Archived post",
          coreTruth: "Historical only.", storyEvidence: "Historical only.", privacyStatus: "Clear",
          retired: true, pillars: ["Reinvention"], status: "Retired",
          updatedAt: "2026-09-07T00:00:00Z", usageCount: 0,
        }],
      }} />,
    );
    fireEvent.click(screen.getByRole("button", { name: /Brand System/ }));
    expect(screen.getByText(/No usable Mario-owned sources are available for generation/)).toBeTruthy();
    expect(screen.getByText(/0 usable · 1 recorded/)).toBeTruthy();
  });

  it("shows the current Supabase source status and usage count", () => {
    render(
      <Workspace initialData={{
        ...demoData,
        sources: [{
          id: "source-1",
          sourceType: "Story",
          title: "Rebuilt after the reset",
          coreTruth: "Action returned before certainty did.",
          storyEvidence: "Confirmed Story Bank entry.",
          privacyStatus: "Clear",
          retired: false,
          pillars: ["Reinvention"],
          status: "Verified",
          updatedAt: "2026-08-12T00:00:00Z",
          usageCount: 2,
        }],
      }} />,
    );
    fireEvent.click(screen.getByRole("button", { name: /Brand System/ }));
    expect(screen.getByText("Live source inventory")).toBeTruthy();
    expect(screen.getByText("Rebuilt after the reset")).toBeTruthy();
    expect(screen.getByText("2 production uses")).toBeTruthy();
  });
});

describe("Save source and format decisions", () => {
  it("never offers retired directions", () => {
    render(<Workspace initialData={{
      ...demoData,
      sources: [usableSource("current-source")],
      saves: [{
        ...demoData.saves[0],
        pairings: [
          { ...demoData.saves[0].pairings[0], id: "retired", title: "Retired direction", sourceType: "Story", brandSourceId: "retired-source", privacyStatus: "Clear", retired: true },
          { ...demoData.saves[0].pairings[1], id: "current", title: "Current direction", sourceType: "Story", brandSourceId: "current-source", privacyStatus: "Clear", retired: false },
        ],
      }],
    }} />);
    fireEvent.click(screen.getByRole("button", { name: "Saves Inbox" }));

    expect(screen.queryByText("Retired direction")).toBeNull();
    expect(screen.getAllByText("Current direction")).toHaveLength(2);
  });

  it("shows Capture instead of directions when no usable source remains", () => {
    render(<Workspace initialData={{
      ...demoData,
      sources: [],
      saves: [{
        ...demoData.saves[0],
        pairings: demoData.saves[0].pairings.map((pairing) => ({ ...pairing, retired: true })),
      }],
    }} />);
    fireEvent.click(screen.getByRole("button", { name: "Saves Inbox" }));

    expect(screen.getByText("No usable Mario source")).toBeTruthy();
    expect(screen.queryByRole("button", { name: /Generate/ })).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Capture a source" }));
    expect(screen.getByRole("heading", { name: "Capture" })).toBeTruthy();
  });

  it("offers to refresh directions when sources are usable but the save only has stale pairings", () => {
    render(<Workspace initialData={{
      ...demoData,
      sources: [usableSource("current-source")],
      saves: [{
        ...demoData.saves[0],
        pairings: demoData.saves[0].pairings.map((pairing) => ({ ...pairing, brandSourceId: "retired-source" })),
      }],
    }} />);
    fireEvent.click(screen.getByRole("button", { name: "Saves Inbox" }));

    expect(screen.getByText("1 verified source available")).toBeTruthy();
    expect(screen.getByText("Directions need a refresh")).toBeTruthy();
    expect(screen.getByRole("button", { name: "Refresh directions" })).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Capture a source" })).toBeNull();
  });

  it("disables Dispatch when the selected direction has no fresh Dispatch source", () => {
    render(<Workspace initialData={{
      ...demoData,
      sources: [usableSource("story-source")],
      saves: [{
        ...demoData.saves[0],
        pairings: [{
          ...demoData.saves[0].pairings[1], id: "story-direction", sourceType: "Story",
          brandSourceId: "story-source", privacyStatus: "Clear", retired: false,
        }],
      }],
    }} />);
    fireEvent.click(screen.getByRole("button", { name: "Saves Inbox" }));

    const dispatch = screen.getByRole("radio", { name: /Dispatch/ }) as HTMLButtonElement;
    expect(dispatch.disabled).toBe(true);
    expect(screen.getByText("No fresh Dispatch source captured.")).toBeTruthy();
  });

  it("uses the same usable-source count in Brand System and Step 1", () => {
    const sources = [usableSource("story-source", "Story"), usableSource("daily-source", "Daily Entry")];
    render(<Workspace initialData={{
      ...demoData,
      sources,
      saves: [{
        ...demoData.saves[0],
        pairings: [
          { ...demoData.saves[0].pairings[0], id: "story-pairing", brandSourceId: "story-source", sourceType: "Story", sourceTitle: "Story source", privacyStatus: "Clear" },
          { ...demoData.saves[0].pairings[1], id: "daily-pairing", brandSourceId: "daily-source", sourceType: "Daily Entry", sourceTitle: "Daily Entry source", privacyStatus: "Clear" },
        ],
      }],
    }} />);

    fireEvent.click(screen.getByRole("button", { name: "Brand System" }));
    expect(screen.getByText("2 usable · 2 recorded")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Saves Inbox" }));
    expect(screen.getByText("2 verified sources available")).toBeTruthy();
    expect(screen.getByText(/Mario source: Story source/)).toBeTruthy();
    expect(screen.getByText(/Mario source: Daily Entry source/)).toBeTruthy();
  });

  it("separates delivery mechanics, Mario substance, and output format", () => {
    render(<Workspace initialData={{
      ...demoData,
      sources: demoData.saves[0].pairings.map((pairing, index) => usableSource(`current-${index}`)),
      saves: [{
        ...demoData.saves[0],
        pairings: demoData.saves[0].pairings.map((pairing, index) => ({
          ...pairing, brandSourceId: `current-${index}`, sourceType: "Story" as const,
          privacyStatus: "Clear" as const, retired: false,
        })),
      }],
    }} />);
    fireEvent.click(screen.getByRole("button", { name: /Saves Inbox/ }));

    expect(screen.getByText("Saved post contributes")).toBeTruthy();
    expect(screen.getByText("Selected Mario source contributes")).toBeTruthy();
    expect(screen.getByText("Choose one of three different Mario directions")).toBeTruthy();
    expect(screen.getByRole("radio", { name: /Carousel/ })).toBeTruthy();
    expect(screen.getByRole("radio", { name: /Written Post/ })).toBeTruthy();
    expect(screen.getByRole("radio", { name: /Long-form/ })).toBeTruthy();
  });
});

describe("Performance evidence architecture", () => {
  it("exposes the four distinct analytics layers", () => {
    render(<Workspace initialData={demoData} />);
    fireEvent.click(screen.getByRole("button", { name: /Performance/ }));

    expect(screen.getByText("What the account is doing over time")).toBeTruthy();
    expect(screen.getByText("Your published baseline")).toBeTruthy();
    expect(screen.getByText("Comparable review windows")).toBeTruthy();
    expect(screen.getByText("Signals worth repeating—not premature rules")).toBeTruthy();
  });

  it("labels experiment values for the stacked mobile metric layout", () => {
    const { container } = render(<Workspace initialData={{
      ...demoData,
      content: [{ ...generatedDemoPackage, instagramMediaId: "media-mobile" }],
    }} />);
    fireEvent.click(screen.getByRole("button", { name: "Performance" }));

    expect(container.querySelector('[data-label="24 hours"]')).toBeTruthy();
    expect(container.querySelector('[data-label="7 days"]')).toBeTruthy();
    expect(container.querySelector('[data-label="Signal"]')).toBeTruthy();
  });
});
