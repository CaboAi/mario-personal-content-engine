// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { Workspace } from "./workspace";
import { demoData, generatedDemoPackage } from "@/lib/demo-data";

afterEach(cleanup);

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

  it("keeps carousel publishing behind asset validation and explicit review", () => {
    render(
      <Workspace
        initialData={{
          ...demoData,
          content: [{
            ...generatedDemoPackage,
            format: "Carousel",
            carouselSlides: [
              { headline: "Start", body: "The opening", altText: "Opening slide" },
              { headline: "Finish", body: "The close", altText: "Closing slide" },
            ],
          }],
        }}
      />,
    );
    fireEvent.click(screen.getByRole("button", { name: /Production/ }));

    expect(screen.getByText("Carousel publisher")).toBeTruthy();
    expect(screen.getByText("Recommended opening line")).toBeTruthy();
    expect(screen.getByText("Carousel cover hook")).toBeTruthy();
    expect(screen.getByText("Carousel argument outline")).toBeTruthy();
    expect(screen.getByText("Final slide line")).toBeTruthy();
    expect(screen.getByText(/Nothing is sent to Meta/)).toBeTruthy();
    expect(
      (screen.getByRole("button", { name: "Connect Meta to publish" }) as HTMLButtonElement).disabled,
    ).toBe(true);
  });
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
