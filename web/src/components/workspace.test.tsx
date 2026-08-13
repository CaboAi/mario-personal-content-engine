// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { Workspace } from "./workspace";
import { demoData, generatedDemoPackage } from "@/lib/demo-data";

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

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

  it("does not pad lightweight POV or carousel packages with a script", () => {
    render(
      <Workspace initialData={{
        ...demoData,
        content: [{ ...generatedDemoPackage, format: "POV / Realization", status: "Concept Ready" }],
      }} />,
    );
    fireEvent.click(screen.getByRole("button", { name: /Production/ }));

    expect(screen.queryByRole("button", { name: /Generate full/ })).toBeNull();
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
  it("separates delivery mechanics, Mario substance, and output format", () => {
    render(<Workspace initialData={demoData} />);
    fireEvent.click(screen.getByRole("button", { name: /Saves Inbox/ }));

    expect(screen.getByText("Saved post contributes")).toBeTruthy();
    expect(screen.getByText("Selected Mario source contributes")).toBeTruthy();
    expect(screen.getByText("Choose the story or opinion this post is actually about")).toBeTruthy();
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
});
