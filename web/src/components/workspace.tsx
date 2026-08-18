"use client";

import { useState } from "react";
import {
  BookmarkSimple,
  CalendarBlank,
  ChartLineUp,
  House,
  Palette,
  VideoCamera,
} from "@phosphor-icons/react";
import { EditorialCalendar } from "@/components/editorial-calendar";
import type {
  BrandSourceInventory,
  ContentFormat,
  ContentPackage,
  DashboardData,
  InstagramAccountDaily,
  InstagramMediaItem,
  MetricSnapshot,
  Pairing,
  PerformanceReview,
  ProductionStatus,
  SavedPost,
} from "@/lib/domain";
import { generatedDemoPackage } from "@/lib/demo-data";
import { fullDraftKind, initialProductionStatus, productionStatusesFor, supportsFullDraft } from "@/lib/format-contracts";
import { getExperimentMetricRows } from "@/lib/performance";

type View = "command" | "saves" | "production" | "calendar" | "performance" | "brand";

const views = [
  { id: "command", label: "Command Center", shortLabel: "Home", index: "01", icon: House },
  { id: "saves", label: "Saves Inbox", shortLabel: "Saves", index: "02", icon: BookmarkSimple },
  { id: "production", label: "Production", shortLabel: "Make", index: "03", icon: VideoCamera },
  { id: "calendar", label: "Calendar", shortLabel: "Plan", index: "04", icon: CalendarBlank },
  { id: "performance", label: "Performance", shortLabel: "Results", index: "05", icon: ChartLineUp },
  { id: "brand", label: "Brand System", shortLabel: "Brand", index: "06", icon: Palette },
] satisfies Array<{
  id: View;
  label: string;
  shortLabel: string;
  index: string;
  icon: typeof House;
}>;

const contentFormats: Array<{ id: ContentFormat; label: string; purpose: string }> = [
  { id: "Yap Reel", label: "Yap Reel", purpose: "One direct argument to camera; optional full script later" },
  { id: "Mini Story", label: "Mini Story", purpose: "A lived scene, turn, and realization; optional full script later" },
  { id: "POV / Realization", label: "POV / Realization", purpose: "One sendable realization with simple B-roll; optional short script later" },
  { id: "Carousel", label: "Carousel", purpose: "A complete swipeable visual essay with slide copy" },
  { id: "Written Post", label: "Written Post", purpose: "A nuanced text post; optional full written draft later" },
  { id: "Long-form", label: "Long-form", purpose: "A developed written essay with argument, story, and an optional full draft" },
];

function suggestedFormat(contentType?: SavedPost["contentType"]): ContentFormat {
  if (contentType === "Carousel") return "Carousel";
  if (contentType === "Post") return "Written Post";
  return "Yap Reel";
}

function formatDate(value: string) {
  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  }).format(new Date(value));
}

function editorialToday(timeZone = "America/Chihuahua") {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(new Date());
  const part = (type: Intl.DateTimeFormatPartTypes) => parts.find((entry) => entry.type === type)?.value ?? "";
  return `${part("year")}-${part("month")}-${part("day")}`;
}

export function Workspace({ initialData }: { initialData: DashboardData }) {
  const [view, setView] = useState<View>("command");
  const [saves, setSaves] = useState(initialData.saves);
  const [content, setContent] = useState(initialData.content);
  const [selectedSaveId, setSelectedSaveId] = useState(initialData.saves[0]?.id);
  const [selectedPairingId, setSelectedPairingId] = useState<string | undefined>(
    initialData.saves[0]?.pairings.find((pairing) => pairing.recommended)?.id,
  );
  const [selectedFormat, setSelectedFormat] = useState<ContentFormat>(
    suggestedFormat(initialData.saves[0]?.contentType),
  );
  const [isGenerating, setIsGenerating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [statusUpdates, setStatusUpdates] = useState<
    Record<string, { saving: boolean; error?: string; saved?: boolean }>
  >({});
  const [archiveUpdates, setArchiveUpdates] = useState<
    Record<string, { saving: boolean; error?: string; saved?: boolean }>
  >({});
  const [archiveFeedback, setArchiveFeedback] = useState<
    { message: string; error?: boolean } | null
  >(null);
  const [scriptUpdates, setScriptUpdates] = useState<
    Record<string, { generating: boolean; error?: string }>
  >({});
  const [scheduleUpdates, setScheduleUpdates] = useState<
    Record<string, { saving: boolean; error?: string }>
  >({});

  const selectedSave = saves.find((save) => save.id === selectedSaveId);
  const selectedPairing = selectedSave?.pairings.find(
    (pairing) => pairing.id === selectedPairingId,
  );
  const reviewCount = saves.filter((save) => save.status === "Needs Review").length;
  const readyCount = content.filter(
    (item) => !item.archivedAt && item.status === initialProductionStatus(item.format),
  ).length;
  const inventoryCount = content.filter(
    (item) => !item.archivedAt && item.status !== "Posted",
  ).length;

  async function approveAndGenerate() {
    if (!selectedSave || !selectedPairing) return;
    if (selectedPairing.privacyStatus === "Needs confirmation") {
      setError("Confirm the private story details before generating this direction.");
      return;
    }

    setError(null);
    setIsGenerating(true);

    try {
      let created: ContentPackage;
      if (initialData.liveMode) {
        const response = await fetch("/api/pairings/approve", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ save: selectedSave, pairing: selectedPairing, format: selectedFormat }),
        });
        const result = await response.json();
        if (!response.ok) throw new Error(result.error || "Generation failed.");
        created = result.content;
      } else {
        await new Promise((resolve) => window.setTimeout(resolve, 900));
        created = generatedDemoPackage;
      }

      setContent((items) => [created, ...items.filter((item) => item.id !== created.id)]);
      setSaves((items) =>
        items.map((save) =>
          save.id === selectedSave.id ? { ...save, status: "Used" } : save,
        ),
      );
      setView("production");
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Generation failed.");
    } finally {
      setIsGenerating(false);
    }
  }

  async function updateProductionStatus(id: string, status: ProductionStatus) {
    const previousStatus = content.find((item) => item.id === id)?.status;
    if (!previousStatus || previousStatus === status) return;

    setContent((items) =>
      items.map((item) => (item.id === id ? { ...item, status } : item)),
    );
    setStatusUpdates((updates) => ({
      ...updates,
      [id]: { saving: true },
    }));

    try {
      if (initialData.liveMode) {
        const response = await fetch(`/api/content/${encodeURIComponent(id)}/status`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ status }),
        });
        const result = await response.json().catch(() => ({
          error: response.redirected
            ? "Your dashboard session expired. Sign in again, then retry."
            : "The server returned an unreadable response.",
        }));
        if (!response.ok || !result.content) {
          throw new Error(result.error || "Status update failed.");
        }
        const persistedStatus = result.content?.status as ProductionStatus | undefined;
        if (persistedStatus) {
          setContent((items) =>
            items.map((item) =>
              item.id === id ? { ...item, status: persistedStatus } : item,
            ),
          );
        }
      } else {
        await new Promise((resolve) => window.setTimeout(resolve, 350));
      }

      setStatusUpdates((updates) => ({
        ...updates,
        [id]: { saving: false, saved: true },
      }));
    } catch (cause) {
      setContent((items) =>
        items.map((item) =>
          item.id === id ? { ...item, status: previousStatus } : item,
        ),
      );
      setStatusUpdates((updates) => ({
        ...updates,
        [id]: {
          saving: false,
          error: cause instanceof Error ? cause.message : "Status update failed.",
        },
      }));
    }
  }

  async function updateContentArchive(id: string, archived: boolean) {
    const previous = content.find((item) => item.id === id);
    if (!previous || Boolean(previous.archivedAt) === archived) return;

    const archivedAt = archived ? new Date().toISOString() : null;
    setArchiveFeedback(null);
    setContent((items) =>
      items.map((item) => (item.id === id ? { ...item, archivedAt } : item)),
    );
    setArchiveUpdates((updates) => ({
      ...updates,
      [id]: { saving: true },
    }));

    try {
      if (initialData.liveMode) {
        const response = await fetch(`/api/content/${encodeURIComponent(id)}/archive`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ archived }),
        });
        const result = await response.json().catch(() => ({
          error: response.redirected
            ? "Your dashboard session expired. Sign in again, then retry."
            : "The server returned an unreadable response.",
        }));
        if (!response.ok || !result.content) {
          throw new Error(result.error || "Production update failed.");
        }
        const persisted = result.content as ContentPackage;
        setContent((items) =>
          items.map((item) => (item.id === id ? { ...item, ...persisted } : item)),
        );
      } else {
        await new Promise((resolve) => window.setTimeout(resolve, 250));
      }

      setArchiveUpdates((updates) => ({
        ...updates,
        [id]: { saving: false, saved: true },
      }));
      setArchiveFeedback({
        message: archived
          ? `Removed “${previous.title}” from Production. You can restore it below.`
          : `Restored “${previous.title}” to the active workbench.`,
      });
    } catch (cause) {
      setContent((items) =>
        items.map((item) => (item.id === id ? previous : item)),
      );
      const message = cause instanceof Error ? cause.message : "Production update failed.";
      setArchiveUpdates((updates) => ({
        ...updates,
        [id]: { saving: false, error: message },
      }));
      setArchiveFeedback({ message, error: true });
    }
  }

  async function generateScript(id: string, replace = false) {
    const current = content.find((item) => item.id === id);
    if (!current) return;
    setScriptUpdates((updates) => ({ ...updates, [id]: { generating: true } }));
    try {
      let persisted: ContentPackage;
      if (initialData.liveMode) {
        const response = await fetch(`/api/content/${encodeURIComponent(id)}/script`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ replace }),
        });
        const result = await response.json().catch(() => ({
          error: response.redirected
            ? "Your dashboard session expired. Sign in again, then retry."
            : "The server returned an unreadable response.",
        }));
        if (!response.ok || !result.content) {
          throw new Error(result.error || "Script generation failed.");
        }
        persisted = result.content as ContentPackage;
      } else {
        await new Promise((resolve) => window.setTimeout(resolve, 350));
        persisted = {
          ...current,
          fullScript: `${current.selectedHook}\n\nI kept treating readiness like permission. I thought certainty was supposed to arrive before the move. It did not.\n\nThe decisions that changed my life still felt uncertain when I made them. Confidence showed up after I moved, not before.\n\n${current.closingLine}`,
          scriptRiskLines: [],
        };
      }
      setContent((items) => items.map((item) => item.id === id ? { ...item, ...persisted } : item));
      setScriptUpdates((updates) => ({ ...updates, [id]: { generating: false } }));
    } catch (cause) {
      setScriptUpdates((updates) => ({
        ...updates,
        [id]: {
          generating: false,
          error: cause instanceof Error ? cause.message : "Script generation failed.",
        },
      }));
    }
  }

  async function updatePlannedDate(id: string, plannedFor: string | null) {
    const previous = content.find((item) => item.id === id);
    if (!previous || previous.plannedFor === plannedFor) return;
    setContent((items) => items.map((item) => item.id === id ? { ...item, plannedFor: plannedFor ?? undefined } : item));
    setScheduleUpdates((updates) => ({ ...updates, [id]: { saving: true } }));
    try {
      if (initialData.liveMode) {
        const response = await fetch(`/api/content/${encodeURIComponent(id)}/schedule`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ plannedFor }),
        });
        const result = await response.json();
        if (!response.ok || !result.content) throw new Error(result.error || "Schedule update failed.");
        setContent((items) => items.map((item) => item.id === id ? { ...item, ...result.content } : item));
      } else {
        await new Promise((resolve) => window.setTimeout(resolve, 200));
      }
      setScheduleUpdates((updates) => ({ ...updates, [id]: { saving: false } }));
    } catch (cause) {
      setContent((items) => items.map((item) => item.id === id ? previous : item));
      setScheduleUpdates((updates) => ({ ...updates, [id]: { saving: false, error: cause instanceof Error ? cause.message : "Schedule update failed." } }));
    }
  }

  return (
    <div className="app-shell">
      <aside className="side-rail">
        <div className="brand-lockup">
          <span className="brand-mark">MP</span>
          <div>
            <strong>Mario Polanco</strong>
            <span>Content Engine</span>
          </div>
        </div>

        <nav className="rail-nav" aria-label="Primary navigation">
          {views.map((item) => {
            const Icon = item.icon;
            return (
              <button
                key={item.id}
                aria-current={view === item.id ? "page" : undefined}
                aria-label={item.label}
                className={view === item.id ? "rail-link active" : "rail-link"}
                onClick={() => setView(item.id)}
                type="button"
              >
                <span className="rail-index">{item.index}</span>
                <Icon aria-hidden="true" className="rail-icon" size={20} weight="regular" />
                <span className="rail-label">{item.label}</span>
                <span className="rail-label-mobile">{item.shortLabel}</span>
              </button>
            );
          })}
        </nav>

        <div className="rail-foot">
          <div className={initialData.liveMode ? "mode-dot live" : "mode-dot"} />
          <div>
            <strong>{initialData.liveMode ? "Live workspace" : "Demonstration mode"}</strong>
            <span>{initialData.liveMode ? "Supabase connected" : "Awaiting credentials"}</span>
          </div>
        </div>
      </aside>

      <main className="workspace">
        <header className="workspace-header">
          <div>
            <p className="eyebrow">@mario_polancojr</p>
            <h1>{views.find((item) => item.id === view)?.label}</h1>
          </div>
          <div className="cadence">
            <span>Publishing floor</span>
            <strong>1 strong post / day</strong>
          </div>
        </header>

        {view === "command" && (
          <CommandCenter
            reviewCount={reviewCount}
            readyCount={readyCount}
            inventoryCount={inventoryCount}
            saves={saves}
            content={content}
            onOpenSaves={() => setView("saves")}
            onOpenProduction={() => setView("production")}
            onOpenCalendar={() => setView("calendar")}
          />
        )}

        {view === "saves" && (
          <SavesInbox
            saves={saves}
            selectedSave={selectedSave}
            selectedPairing={selectedPairing}
            selectedPairingId={selectedPairingId}
            onSelectSave={(save) => {
              setSelectedSaveId(save.id);
              setSelectedPairingId(
                save.pairings.find((pairing) => pairing.recommended)?.id ||
                  save.pairings[0]?.id,
              );
              setSelectedFormat(suggestedFormat(save.contentType));
              setError(null);
            }}
            onSelectPairing={(pairing) => {
              setSelectedPairingId(pairing.id);
              setError(null);
            }}
            onApprove={approveAndGenerate}
            selectedFormat={selectedFormat}
            onSelectFormat={setSelectedFormat}
            isGenerating={isGenerating}
            error={error}
          />
        )}

        {view === "production" && (
          <ProductionBoard
            content={content}
            saves={saves}
            onStatusChange={updateProductionStatus}
            statusUpdates={statusUpdates}
            onArchiveChange={updateContentArchive}
            archiveUpdates={archiveUpdates}
            archiveFeedback={archiveFeedback}
            onGenerateScript={generateScript}
            scriptUpdates={scriptUpdates}
          />
        )}

        {view === "calendar" && (
          <EditorialCalendar
            batches={initialData.batches}
            content={content}
            onReschedule={updatePlannedDate}
            onOpenProduction={() => setView("production")}
            scheduleUpdates={scheduleUpdates}
          />
        )}

        {view === "performance" && (
          <PerformanceLab
            connected={initialData.analyticsConnected}
            content={content}
            metrics={initialData.metrics}
            reviews={initialData.performanceReviews}
            media={initialData.instagramMedia}
            accountTrends={initialData.accountTrends}
          />
        )}

        {view === "brand" && <BrandSystem sources={initialData.sources} />}
      </main>
    </div>
  );
}

function CommandCenter({
  reviewCount,
  readyCount,
  inventoryCount,
  saves,
  content,
  onOpenSaves,
  onOpenProduction,
  onOpenCalendar,
}: {
  reviewCount: number;
  readyCount: number;
  inventoryCount: number;
  saves: SavedPost[];
  content: ContentPackage[];
  onOpenSaves: () => void;
  onOpenProduction: () => void;
  onOpenCalendar: () => void;
}) {
  const today = editorialToday();
  const upcoming = content
    .filter((item) => !item.archivedAt && item.status !== "Posted" && item.plannedFor)
    .sort((a, b) => (a.plannedFor ?? "").localeCompare(b.plannedFor ?? ""));
  const todayItem = upcoming.find((item) => item.plannedFor === today) ?? upcoming.find((item) => (item.plannedFor ?? "") > today);
  const priority = todayItem ? todayItem.title : reviewCount > 0 ? "Review the latest saved-post pairing" : "Capture a new Mario story";

  return (
    <section className="command-grid stagger-in">
      <div className="command-lead">
        <p className="section-label">Today’s decision</p>
        <h2>{priority}</h2>
        <p>
          {todayItem ? `Today focus: ${todayItem.format} · ${todayItem.goal} · ${todayItem.selectedHook}` : "The engine can prepare the structure. The decision that matters is which Mario-owned truth deserves the format."}
        </p>
        <div className="command-actions"><button className="primary-action" onClick={todayItem ? onOpenProduction : onOpenSaves} type="button">{todayItem ? "Open Today focus" : "Open review queue"}</button><button className="text-action" onClick={onOpenCalendar} type="button">View editorial calendar</button></div>
      </div>

      <div className="metric-ribbon" aria-label="Workflow summary">
        <Metric value={reviewCount} label="Needs review" />
        <Metric value={readyCount} label="Ready to make" />
        <Metric value={inventoryCount} label="Active inventory" />
      </div>

      <div className="activity-panel">
        <div className="panel-heading">
          <div>
            <p className="section-label">Live pipeline</p>
            <h3>What moved recently</h3>
          </div>
          <button className="text-action" onClick={onOpenProduction} type="button">
            View production
          </button>
        </div>
        <div className="activity-list">
          {saves.slice(0, 3).map((save) => (
            <div className="activity-row" key={save.id}>
              <span className="activity-index">SAVE</span>
              <div>
                <strong>@{save.author}</strong>
                <span>{save.frameworkDna}</span>
              </div>
              <StatusPill status={save.status} />
            </div>
          ))}
          {content.slice(0, 2).map((item) => (
            <div className="activity-row" key={item.id}>
              <span className="activity-index">MAKE</span>
              <div>
                <strong>{item.title}</strong>
                <span>{item.selectedHook}</span>
              </div>
              <StatusPill status={item.status} />
            </div>
          ))}
        </div>
      </div>

      <div className="system-note">
        <span className="signal-line" />
        <p className="section-label">Current hypothesis</p>
        <h3>Specific story plus a clear opinion beats generic self-improvement.</h3>
        <p>Directional only. The Performance Lab will promote it after repeated evidence.</p>
      </div>
    </section>
  );
}

function Metric({ value, label }: { value: number; label: string }) {
  return (
    <div className="metric">
      <strong>{String(value).padStart(2, "0")}</strong>
      <span>{label}</span>
    </div>
  );
}

function SavesInbox({
  saves,
  selectedSave,
  selectedPairing,
  selectedPairingId,
  onSelectSave,
  onSelectPairing,
  onApprove,
  selectedFormat,
  onSelectFormat,
  isGenerating,
  error,
}: {
  saves: SavedPost[];
  selectedSave?: SavedPost;
  selectedPairing?: Pairing;
  selectedPairingId?: string;
  onSelectSave: (save: SavedPost) => void;
  onSelectPairing: (pairing: Pairing) => void;
  onApprove: () => void;
  selectedFormat: ContentFormat;
  onSelectFormat: (format: ContentFormat) => void;
  isGenerating: boolean;
  error: string | null;
}) {
  if (!selectedSave) {
    return <EmptyState title="No saved posts yet" body="The local Instagram bridge will place new saves here." />;
  }

  return (
    <section className="review-layout stagger-in">
      <div className="save-list">
        <div className="list-heading">
          <p className="section-label">Review queue</p>
          <span>{saves.length} total</span>
        </div>
        {saves.map((save) => (
          <button
            key={save.id}
            type="button"
            className={save.id === selectedSave.id ? "save-row selected" : "save-row"}
            onClick={() => onSelectSave(save)}
          >
            <span className="save-type">{save.contentType}</span>
            <strong>@{save.author}</strong>
            <small>{formatDate(save.savedAt)}</small>
            <StatusPill status={save.status} />
          </button>
        ))}
      </div>

      <article className="review-detail">
        <div className="detail-heading">
          <div>
            <p className="eyebrow">Saved reference / {selectedSave.contentType}</p>
            <h2>@{selectedSave.author}</h2>
          </div>
          <a href={selectedSave.url} target="_blank" rel="noreferrer" className="source-link">
            View original
          </a>
        </div>

        {selectedSave.status !== "New" && <div className="dna-grid">
          <DetailBlock label="Framework DNA" text={selectedSave.frameworkDna} />
          <DetailBlock label="Hook mechanics" text={selectedSave.hookMechanics} />
          <DetailBlock label="Visual and pacing" text={selectedSave.visualPacing} />
        </div>}

        {selectedSave.prohibitedTransfer.length > 0 && <div className="boundary-block">
          <p className="section-label">Do not transfer</p>
          <ul>
            {selectedSave.prohibitedTransfer.map((item) => (
              <li key={item}>{item}</li>
            ))}
          </ul>
        </div>}

        {selectedSave.status !== "New" && <div className="pairing-heading">
          <div>
            <p className="section-label">Step 1 · Mario-owned direction</p>
            <h3>Choose one of three different Mario directions</h3>
          </div>
          <span>Choose one verified source</span>
        </div>}

        {selectedSave.status !== "New" && (
          <p className="pairing-explainer">
            The first is the strongest structural match. The second intentionally changes the Mario
            lens. The third is a less obvious but still credible direction. Pillars organize these
            ideas; the verified source determines the actual subject.
          </p>
        )}

        {selectedSave.status !== "New" && (
          <div className="source-model" aria-label="How saved references and Mario sources work">
            <div><span>Saved post contributes</span><strong>Delivery mechanics</strong><p>Hook pattern, sequence, pacing, visual treatment, and CTA placement.</p></div>
            <div><span>Selected Mario source contributes</span><strong>Substance</strong><p>Your story, evidence, opinion, lesson, and lived point of view.</p></div>
          </div>
        )}

        <div className="pairing-stack">
          {selectedSave.pairings.map((pairing, index) => (
            <button
              type="button"
              key={pairing.id}
              className={pairing.id === selectedPairingId ? "pairing selected" : "pairing"}
              onClick={() => onSelectPairing(pairing)}
            >
              <span className="pairing-number">0{index + 1}</span>
              <div>
                <div className="pairing-title-row">
                  <strong>{pairing.title}</strong>
                  <span className="recommended">
                    {pairing.selectionRole || (pairing.recommended ? "Best structural fit" : `Direction ${index + 1}`)}
                  </span>
                </div>
                {pairing.coreTruth && <p className="source-truth"><b>Core truth:</b> {pairing.coreTruth}</p>}
                {pairing.storyEvidence && <p><b>Known evidence:</b> {pairing.storyEvidence}</p>}
                <p><b>Why it fits this save:</b> {pairing.rationale}</p>
                <span className="source-name">Mario source: {pairing.sourceTitle}</span>
              </div>
              <span className={pairing.privacyStatus === "Clear" ? "privacy clear" : "privacy"}>
                {pairing.privacyStatus}
              </span>
            </button>
          ))}
        </div>

        {selectedSave.status === "Blocked" && selectedSave.pairings.length === 0 && (
          <p className="inline-error" role="status">
            No verified Mario source fits this delivery structure yet. Add or verify a source, then re-run analysis.
          </p>
        )}

        {selectedPairing && (
          <div className="format-step">
            <div className="pairing-heading">
              <div><p className="section-label">Step 2 · Output format</p><h3>Choose what the selected source becomes</h3></div>
              <span>The source stays the same</span>
            </div>
            <p className="format-explainer">This choice controls the deliverable. A saved Reel can become a carousel or written post; only compatible mechanics are adapted.</p>
            <div className="format-picker" role="radiogroup" aria-label="Content format">
              {contentFormats.map((format) => (
                <button
                  key={format.id}
                  type="button"
                  role="radio"
                  aria-checked={selectedFormat === format.id}
                  className={selectedFormat === format.id ? "format-option selected" : "format-option"}
                  onClick={() => onSelectFormat(format.id)}
                >
                  <strong>{format.label}</strong><span>{format.purpose}</span>
                </button>
              ))}
            </div>
          </div>
        )}

        {selectedPairing && (
          <div className="approval-dock">
            <div>
              <p className="section-label">Ready to build · {selectedFormat}</p>
              <strong>{selectedPairing.title}</strong>
              <span><b>Technique to transfer:</b> {selectedPairing.direction}</span>
              {selectedPairing.sourceUrl && (
                <a href={selectedPairing.sourceUrl} target="_blank" rel="noreferrer">
                  Open source reference
                </a>
              )}
            </div>
            <button
              type="button"
              className="primary-action generate-action"
              onClick={onApprove}
              disabled={isGenerating}
            >
              {isGenerating ? `Building ${selectedFormat}…` : `Generate ${selectedFormat}`}
            </button>
          </div>
        )}
        {error && <p className="inline-error" role="alert">{error}</p>}
      </article>
    </section>
  );
}

function DetailBlock({ label, text }: { label: string; text: string }) {
  return (
    <div className="detail-block">
      <p className="section-label">{label}</p>
      <p>{text}</p>
    </div>
  );
}

function ProductionBoard({
  content,
  saves,
  onStatusChange,
  statusUpdates,
  onArchiveChange,
  archiveUpdates,
  archiveFeedback,
  onGenerateScript,
  scriptUpdates,
}: {
  content: ContentPackage[];
  saves: SavedPost[];
  onStatusChange: (id: string, status: ProductionStatus) => Promise<void>;
  statusUpdates: Record<string, { saving: boolean; error?: string; saved?: boolean }>;
  onArchiveChange: (id: string, archived: boolean) => Promise<void>;
  archiveUpdates: Record<string, { saving: boolean; error?: string; saved?: boolean }>;
  archiveFeedback: { message: string; error?: boolean } | null;
  onGenerateScript: (id: string, replace?: boolean) => Promise<void>;
  scriptUpdates: Record<string, { generating: boolean; error?: string }>;
}) {
  const [showPosted, setShowPosted] = useState(false);
  const [showFullBatch, setShowFullBatch] = useState(false);
  const [copiedScriptId, setCopiedScriptId] = useState<string | null>(null);
  const activeContent = content.filter((item) => !item.archivedAt && item.status !== "Posted");
  const postedContent = content.filter((item) => !item.archivedAt && item.status === "Posted");
  const removedContent = content.filter((item) => Boolean(item.archivedAt));
  const today = editorialToday();
  const scheduledActive = activeContent
    .filter((item) => item.plannedFor)
    .sort((a, b) => (a.plannedFor ?? "").localeCompare(b.plannedFor ?? ""));
  const nextFocus = scheduledActive.filter((item) => (item.plannedFor ?? "") >= today).slice(0, 3);
  const focusedContent = nextFocus.length > 0 ? nextFocus : activeContent;
  const productionContent = showFullBatch ? activeContent : focusedContent;
  const visibleContent = showPosted ? [...productionContent, ...postedContent] : productionContent;

  if (content.length === 0) {
    return (
      <EmptyState
        title="Production is waiting for an approved pairing"
        body="Review a saved post, choose the Mario-owned source, and generate the first package."
      />
    );
  }

  return (
    <section className="production-layout stagger-in">
      <div className="production-toolbar">
        <div>
          <p className="section-label">Active workbench</p>
          <span>{`${activeContent.length} active ${activeContent.length === 1 ? "package" : "packages"}`}{!showFullBatch && <small>{`${focusedContent.length} in Today focus`}</small>}</span>
        </div>
        <div className="production-toolbar-actions"><button type="button" className="text-action" onClick={() => setShowFullBatch((current) => !current)}>{showFullBatch ? "Show Today focus" : `View full batch (${activeContent.length})`}</button>{postedContent.length > 0 && (<button type="button" className="text-action" onClick={() => setShowPosted((current) => !current)}>{showPosted ? "Hide posted archive" : `Show posted archive (${postedContent.length})`}</button>)}</div>
      </div>
      {archiveFeedback && (
        <p
          className={archiveFeedback.error ? "archive-feedback error" : "archive-feedback"}
          role={archiveFeedback.error ? "alert" : "status"}
          aria-live="polite"
        >
          {archiveFeedback.message}
        </p>
      )}
      <div className="production-list">
        {visibleContent.length === 0 && (
          <div className="production-clear">
            <span className="empty-line" />
            <p className="section-label">Workbench clear</p>
            <h2>{postedContent.length > 0 ? "Everything here has been posted." : "No active production drafts."}</h2>
            <p>{removedContent.length > 0 && postedContent.length === 0 ? "Restore a removed draft below or generate the next package from Saves Inbox." : "Generate the next package from Saves Inbox. Your phone-published posts appear in Performance after the next Instagram sync."}</p>
          </div>
        )}
        {visibleContent.map((item) => {
          const alternativeSpokenHooks = item.spokenHooks.filter(
            (hook) => hook !== item.selectedHook,
          );
          const alternativeOnScreenHooks = item.onScreenHooks.filter(
            (hook) => hook !== item.selectedOnScreenHook,
          );
          const statusUpdate = statusUpdates[item.id];
          const archiveUpdate = archiveUpdates[item.id];
          const scriptUpdate = scriptUpdates[item.id];
          const sourceSave = saves.find((save) => save.id === item.sourceSaveId);
          const sourcePairing = sourceSave?.pairings.find((pairing) => pairing.sourceTitle === item.sourceTitle);
          const isVideo = item.format === "Yap Reel" || item.format === "Mini Story" || item.format === "POV / Realization";
          const isCarousel = item.format === "Carousel";
          const isLongForm = item.format === "Long-form";
          const isWritten = item.format === "Written Post" || isLongForm;
          const openingLabel = isVideo ? "Recommended spoken hook" : "Recommended opening line";
          const openingInstruction = isVideo ? "Say this first" : isCarousel ? "Use this as the first-slide thought" : "Open the written piece with this";
          const visualLabel = isVideo ? "On-screen hook" : isCarousel ? "Carousel cover hook" : "Headline / first-frame hook";
          const visualInstruction = isVideo ? "Show this text during the opening" : isCarousel ? "Use this on the cover or first slide" : "Use this as the title or visual opener";
          const bodyLabel = isVideo ? "Talking prompts—not a script" : isCarousel ? "Carousel argument outline" : isLongForm ? "Long-form development outline—not a finished draft" : "Writing outline—not finished prose";
          const bodyInstruction = isVideo ? "Follow the ideas in order and explain them in your own words" : isLongForm ? "Use these sections to develop the argument; short-Reel production directions do not belong here" : "Develop these ideas in order while keeping Mario’s exact voice";

          return <article className="production-item" key={item.id}>
            <div className="production-item-heading">
              <div className="production-meta">
                <span>{item.format}</span>
                <span>{item.goal}</span>
                <span>{item.testVariable} test</span>
              </div>
              {item.status !== "Posted" && (
                <button
                  type="button"
                  className="remove-production-action"
                  disabled={archiveUpdate?.saving}
                  onClick={() => void onArchiveChange(item.id, true)}
                  aria-describedby={`archive-message-${item.id}`}
                >
                  {archiveUpdate?.saving ? "Removing…" : "Remove from Production"}
                </button>
              )}
            </div>
            <span
              id={`archive-message-${item.id}`}
              className={archiveUpdate?.error ? "archive-item-message error" : "archive-item-message"}
              role={archiveUpdate?.error ? "alert" : "status"}
            >
              {archiveUpdate?.error ?? ""}
            </span>
            <div className="production-provenance" aria-label="Content sources">
              <section>
                <p className="section-label">Mario-owned substance</p>
                <strong>{item.sourceTitle}</strong>
                <span>The story, opinion, and lesson come from this verified Mario source.</span>
                {sourcePairing?.sourceUrl && <a href={sourcePairing.sourceUrl} target="_blank" rel="noreferrer">Open Mario source</a>}
              </section>
              <section>
                <p className="section-label">Delivery influence from Saves Inbox</p>
                {sourceSave ? <>
                  <strong>{sourceSave.author.startsWith("@") ? sourceSave.author : `@${sourceSave.author}`} · {sourceSave.contentType}</strong>
                  <span>This creator influenced structure and presentation only—not the topic or message.</span>
                  <div className="provenance-links"><a href={sourceSave.url} target="_blank" rel="noreferrer">Open saved post</a><span>Saved {formatDate(sourceSave.savedAt)}</span></div>
                  <details>
                    <summary>See exactly what influenced this package</summary>
                    <dl>
                      <div><dt>Framework</dt><dd>{sourceSave.frameworkDna}</dd></div>
                      <div><dt>Hook mechanics</dt><dd>{sourceSave.hookMechanics}</dd></div>
                      <div><dt>Visual pacing</dt><dd>{sourceSave.visualPacing}</dd></div>
                    </dl>
                  </details>
                </> : <><strong>No saved-post link available</strong><span>The Mario source remains traceable above.</span></>}
              </section>
            </div>
            <h2>{item.title}</h2>
            <div className="selected-hooks" aria-label="Selected opening">
              <div className="selected-hook spoken">
                <p className="section-label">{openingLabel}</p>
                <span className="instruction">{openingInstruction}</span>
                <blockquote>{item.selectedHook}</blockquote>
              </div>
              <div className="selected-hook on-screen">
                <p className="section-label">{visualLabel}</p>
                <span className="instruction">{visualInstruction}</span>
                <strong>{item.selectedOnScreenHook}</strong>
              </div>
            </div>
            {supportsFullDraft(item.format) && item.status !== "Posted" && (
              <section className={item.fullScript ? "full-script-panel generated" : "full-script-panel"}>
                <div className="full-script-heading">
                  <div>
                    <p className="section-label">Optional {fullDraftKind(item.format)}</p>
                    <h3>{item.fullScript ? "A word-for-word starting point" : "Stuck on what to say?"}</h3>
                    <p>{item.fullScript ? "Read it, edit it, or use it to get moving. Keep the version that sounds most like you." : `Generate a complete ${fullDraftKind(item.format)} from this exact Mario source, opening, outline, and closing line.`}</p>
                  </div>
                  {!item.fullScript ? (
                    <button type="button" className="primary-action" disabled={scriptUpdate?.generating} onClick={() => void onGenerateScript(item.id)}>
                      {scriptUpdate?.generating ? "Writing…" : `Generate full ${fullDraftKind(item.format)}`}
                    </button>
                  ) : (
                    <div className="script-actions">
                      <button type="button" className="secondary-action" onClick={() => void navigator.clipboard.writeText(item.fullScript || "").then(() => setCopiedScriptId(item.id))}>{copiedScriptId === item.id ? "Copied" : "Copy"}</button>
                      <button type="button" className="text-action" disabled={scriptUpdate?.generating} onClick={() => void onGenerateScript(item.id, true)}>{scriptUpdate?.generating ? "Rewriting…" : "Regenerate"}</button>
                    </div>
                  )}
                </div>
                {scriptUpdate?.error && <p className="inline-error" role="alert">{scriptUpdate.error}</p>}
                {item.fullScript && <div className="full-script-copy">{item.fullScript.split(/\n{2,}/).map((paragraph) => <p key={paragraph}>{paragraph}</p>)}</div>}
                {item.scriptRiskLines && item.scriptRiskLines.length > 0 && (
                  <div className="script-risk-lines"><p className="section-label">Lines to make more natural</p><ul>{item.scriptRiskLines.map((line) => <li key={line}>{line}</li>)}</ul></div>
                )}
              </section>
            )}
            <div className="production-sections">
              <section className="production-section alternatives">
                <div>
                  <p className="section-label">{isVideo ? "Alternative spoken hooks" : "Alternative opening lines"}</p>
                  <span className="instruction">Use one of these instead only when testing the opener</span>
                  {alternativeSpokenHooks.length > 0 ? (
                    <ol>
                      {alternativeSpokenHooks.map((hook) => <li key={hook}>{hook}</li>)}
                    </ol>
                  ) : <p className="empty-option">No alternatives generated.</p>}
                </div>
                <div>
                  <p className="section-label">{isVideo ? "Alternative on-screen hooks" : "Alternative visual hooks"}</p>
                  <span className="instruction">Optional visual opener variants</span>
                  {alternativeOnScreenHooks.length > 0 ? (
                    <ol>
                      {alternativeOnScreenHooks.map((hook) => <li key={hook}>{hook}</li>)}
                    </ol>
                  ) : <p className="empty-option">No alternatives generated.</p>}
                </div>
              </section>
              <section className="production-section talking-prompts">
                <p className="section-label">{bodyLabel}</p>
                <span className="instruction">{bodyInstruction}</span>
                <ol>
                  {item.skeleton.map((beat) => <li key={beat}>{beat}</li>)}
                </ol>
                <p className="riff-note">{isVideo ? "Hit record and riff on this. If it sounds polished, restart." : "Use the sequence as scaffolding; keep the final language specific, direct, and unmistakably Mario."}</p>
              </section>
            </div>
            <div className="hypothesis">
              <p className="section-label">{isVideo ? "Internal test note—do not record" : "Internal test note—not part of the post"}</p>
              <p>{item.hypothesis}</p>
            </div>
            <div className="production-footer">
              <div className="closing-block">
                <span>{isVideo ? "Final spoken line" : isCarousel ? "Final slide line" : "Final written line"}</span>
                <small>{isVideo ? "Say this last, then stop unless an optional CTA appears below." : "End here unless an optional CTA appears below."}</small>
                <strong>{item.closingLine}</strong>
                {item.cta && (
                  <div className="optional-cta">
                    <span>Optional CTA</span>
                    <strong>{item.cta}</strong>
                  </div>
                )}
              </div>
              <div className="status-control">
                <label htmlFor={`status-${item.id}`}>{isCarousel ? "Carousel status" : isWritten ? "Writing status" : "Reel status"}</label>
                <select
                  id={`status-${item.id}`}
                  value={item.status}
                  disabled={statusUpdate?.saving}
                  aria-describedby={`status-message-${item.id}`}
                  onChange={(event) =>
                    void onStatusChange(item.id, event.target.value as ProductionStatus)
                  }
                >
                  {productionStatusesFor(item.format).map((status) => (
                    <option key={status}>{status}</option>
                  ))}
                </select>
                <span
                  id={`status-message-${item.id}`}
                  className={statusUpdate?.error ? "status-message error" : "status-message"}
                  role={statusUpdate?.error ? "alert" : "status"}
                  aria-live="polite"
                >
                  {statusUpdate?.saving
                    ? "Saving…"
                    : statusUpdate?.error
                      ? statusUpdate.error
                      : statusUpdate?.saved
                        ? "Saved"
                        : "Changes persist automatically"}
                </span>
              </div>
            </div>
            {item.format === "Carousel" && (
              <CanvaHandoff item={item} />
            )}
          </article>;
        })}
      </div>
      {removedContent.length > 0 && (
        <details className="removed-drafts">
          <summary>
            <span>Removed drafts</span>
            <strong>{removedContent.length}</strong>
          </summary>
          <div className="removed-draft-list">
            {removedContent.map((item) => {
              const archiveUpdate = archiveUpdates[item.id];
              return (
                <div className="removed-draft" key={item.id}>
                  <div>
                    <span>{item.format} · {item.status}</span>
                    <strong>{item.title}</strong>
                    <small>
                      Removed {item.archivedAt ? formatDate(item.archivedAt) : "from Production"}
                    </small>
                  </div>
                  <button
                    type="button"
                    className="secondary-action restore-production-action"
                    disabled={archiveUpdate?.saving}
                    onClick={() => void onArchiveChange(item.id, false)}
                  >
                    {archiveUpdate?.saving ? "Restoring…" : "Restore"}
                  </button>
                  {archiveUpdate?.error && (
                    <p className="archive-item-message error" role="alert">
                      {archiveUpdate.error}
                    </p>
                  )}
                </div>
              );
            })}
          </div>
        </details>
      )}
    </section>
  );
}

function CanvaHandoff({ item }: { item: ContentPackage }) {
  const [copiedPart, setCopiedPart] = useState<string | null>(null);

  const copyText = async (label: string, text: string) => {
    try {
      await navigator.clipboard.writeText(text);
      setCopiedPart(label);
    } catch {
      setCopiedPart("error");
    }
  };

  const finalSlide = item.carouselSlides.at(-1);
  let representedFinalCopy = finalSlide
    ? `${finalSlide.headline}\n${finalSlide.body}`
    : "";
  const supplements: string[] = [];
  const closingLine = item.closingLine.trim();
  const optionalCta = item.cta?.trim() ?? "";

  if (closingLine && !representedFinalCopy.includes(closingLine)) {
    supplements.push(`FINAL SLIDE LINE\n${closingLine}`);
    representedFinalCopy += `\n${closingLine}`;
  }
  if (optionalCta && !representedFinalCopy.includes(optionalCta)) {
    supplements.push(`OPTIONAL CTA\n${optionalCta}`);
  }

  const allCopy = [
    `CAROUSEL: ${item.title}`,
    ...item.carouselSlides.map((slide, index) =>
      `SLIDE ${index + 1}${index === 0 ? " (COVER)" : ""}\n${slide.headline}\n${slide.body}`,
    ),
    ...supplements,
    item.caption ? `INSTAGRAM CAPTION\n${item.caption}` : null,
  ].filter(Boolean).join("\n\n");

  return (
    <section className="canva-production">
      <div className="distribution-heading">
        <div>
          <p className="section-label">Canva production</p>
          <h3>Copy, design in Canva, then post from your phone</h3>
        </div>
        <span className="handoff-stage">{item.carouselSlides.length} slides</span>
      </div>
      <p>The dashboard supplies the finished slide copy and caption. Canva handles the reusable visual template; Instagram handles publishing.</p>

      <div className="canva-actions">
        <button type="button" className="primary-action" onClick={() => void copyText("all", allCopy)}>
          {copiedPart === "all" ? "Copied for Canva" : "Copy all for Canva"}
        </button>
        {item.caption && (
          <button type="button" className="secondary-action" onClick={() => void copyText("caption", item.caption || "")}>
            {copiedPart === "caption" ? "Caption copied" : "Copy caption"}
          </button>
        )}
      </div>

      <div className="canva-sequence-heading">
        <div>
          <p className="section-label">Exact slide sequence</p>
          <h4>One idea per slide, in posting order</h4>
        </div>
        <span>Copy individually or use the complete handoff above</span>
      </div>
      <ol className="canva-slide-copy" aria-label="Carousel copy for Canva">
        {item.carouselSlides.map((slide, index) => {
          const slideLabel = `slide-${index + 1}`;
          return (
            <li key={`${item.id}-canva-${index}`}>
              <span>{String(index + 1).padStart(2, "0")}</span>
              <div>
                <strong>{slide.headline}</strong>
                <p>{slide.body}</p>
                <small>Draft alt text: {slide.altText}</small>
              </div>
              <button
                type="button"
                className="text-action"
                onClick={() => void copyText(slideLabel, `${slide.headline}\n${slide.body}`)}
              >
                {copiedPart === slideLabel ? "Copied" : `Copy slide ${index + 1}`}
              </button>
            </li>
          );
        })}
      </ol>

      <div className="handoff-checklist">
        <p className="section-label">Finish in Canva</p>
        <ol>
          <li>Open your reusable carousel template.</li>
          <li>Paste the copy and adjust line breaks for mobile readability.</li>
          <li>Keep one visual spine across the slides and one job per slide.</li>
          <li>Review the final visuals, then correct the draft alt text if needed.</li>
          <li>Export the slides in order and post them from your phone.</li>
          <li>Return here and mark the carousel Posted.</li>
        </ol>
      </div>

      <p className={copiedPart === "error" ? "operation-message error" : "copy-status"} role="status" aria-live="polite">
        {copiedPart === "error" ? "Clipboard access failed. Select and copy the slide text above." : copiedPart ? "Ready to paste into Canva." : "Nothing is published or sent to Meta from this section."}
      </p>
    </section>
  );
}

function metricValue(snapshot: MetricSnapshot | undefined, metric: keyof MetricSnapshot) {
  const value = snapshot?.[metric];
  return typeof value === "number" ? value.toLocaleString() : "—";
}

function PerformanceCard({
  item,
  metrics,
  reviews,
}: {
  item: ContentPackage;
  metrics: MetricSnapshot[];
  reviews: PerformanceReview[];
}) {
  const at24 = metrics.find((metric) => metric.contentId === item.id && metric.reviewWindowHours === 24);
  const at168 = metrics.find((metric) => metric.contentId === item.id && metric.reviewWindowHours === 168);
  const itemReviews = reviews.filter((review) => review.contentId === item.id);
  const signal = itemReviews.find((review) => review.status === "Complete")?.signal ?? "Building baseline";
  const rows = getExperimentMetricRows(item.format);
  return (
    <article className="performance-card">
      <div className="performance-card-heading">
        <div><span>{item.goal} goal</span><h3>{item.title}</h3></div>
        <StatusPill status={signal} />
      </div>
      <div className="metric-table">
        <div className="metric-table-head"><span>Metric</span><span>24 hours</span><span>7 days</span><span>Signal</span></div>
        {rows.map(({ label, key }) => (
          <div className="metric-table-row" key={label}>
            <strong>{label}</strong>
            <span data-label="24 hours">{metricValue(at24, key)}</span>
            <span data-label="7 days">{metricValue(at168, key)}</span>
            <span className="metric-signal" data-label="Signal">{signal}</span>
          </div>
        ))}
      </div>
      {itemReviews.map((review) => (
        <p className="review-note" key={review.id}><strong>{review.reviewWindowHours === 24 ? "24-hour" : "7-day"} review:</strong> {review.observation || review.lastError || `${review.status} — due ${formatDate(review.dueAt)}`}</p>
      ))}
    </article>
  );
}

function PerformanceLab({
  connected,
  content,
  metrics,
  reviews,
  media,
  accountTrends,
}: {
  connected: boolean;
  content: ContentPackage[];
  metrics: MetricSnapshot[];
  reviews: PerformanceReview[];
  media: InstagramMediaItem[];
  accountTrends: InstagramAccountDaily[];
}) {
  const [refreshing, setRefreshing] = useState(false);
  const [importing, setImporting] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [mediaItems, setMediaItems] = useState(media);
  const linked = content.filter((item) => item.instagramMediaId);
  const recentTrends = accountTrends.slice(-30);
  const sumTrend = (key: "reach" | "views" | "profileViews" | "followerCount") => {
    const values = recentTrends.map((day) => day[key]).filter((value): value is number => typeof value === "number");
    return values.length ? values.reduce((sum, value) => sum + value, 0) : undefined;
  };
  const totalReach = sumTrend("reach");
  const totalViews = sumTrend("views");
  const profileViews = sumTrend("profileViews");
  const newFollowers = sumTrend("followerCount");
  const topBy = (key: "views" | "shares" | "saves") =>
    [...mediaItems].filter((item) => typeof item[key] === "number").sort((a, b) => (b[key] ?? 0) - (a[key] ?? 0))[0];
  const topViewed = topBy("views");
  const topShared = topBy("shares");
  const topSaved = topBy("saves");

  async function refreshInsights() {
    setRefreshing(true);
    setMessage(null);
    try {
      const response = await fetch("/api/jobs/metrics", { method: "POST" });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || "Insight refresh failed.");
      setMessage(`Checked ${result.due} due window(s); captured ${result.processed}. Reloading…`);
      window.setTimeout(() => window.location.reload(), 700);
    } catch (cause) {
      setMessage(cause instanceof Error ? cause.message : "Insight refresh failed.");
    } finally {
      setRefreshing(false);
    }
  }

  async function importHistory() {
    setImporting(true);
    setMessage(null);
    try {
      const response = await fetch("/api/instagram/import", { method: "POST" });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || "Instagram history import failed.");
      setMessage(`Imported ${result.importedPosts} existing post(s), with insights on ${result.postsWithInsights}; ${result.accountDays} account-trend day(s). Reloading…`);
      window.setTimeout(() => window.location.reload(), 800);
    } catch (cause) {
      setMessage(cause instanceof Error ? cause.message : "Instagram history import failed.");
    } finally {
      setImporting(false);
    }
  }

  return (
    <section className="performance-hub stagger-in">
      <div className="performance-intro">
        <div>
          <p className="section-label">Instagram evidence system</p>
          <h2>{connected ? "Your baseline, experiments, and patterns—in one place" : "Connect Meta to build the evidence layer"}</h2>
          <p>Existing posts establish the historical baseline. Dashboard posts add controlled 24-hour and 7-day experiments. Edits retention diagnostics explain what happened inside each Reel.</p>
        </div>
        <div className="performance-actions">
          <button type="button" className="primary-action" disabled={!connected || importing} onClick={() => void importHistory()}>
            {importing ? "Importing Instagram history…" : mediaItems.length ? "Sync existing posts" : "Import existing posts"}
          </button>
          <button type="button" className="secondary-action" disabled={!connected || refreshing} onClick={() => void refreshInsights()}>
            {refreshing ? "Refreshing experiments…" : "Refresh due experiment windows"}
          </button>
          {message && <p className="operation-message" role="status">{message}</p>}
        </div>
      </div>

      <nav className="performance-nav" aria-label="Performance sections">
        <a href="#account-trends">Account trends</a>
        <a href="#existing-posts">Existing posts library</a>
        <a href="#dashboard-experiments">Dashboard experiments</a>
        <a href="#winners-patterns">Winners and patterns</a>
      </nav>

      <section className="performance-section" id="account-trends">
        <div className="section-heading-wide"><div><p className="section-label">01 · Account trends</p><h2>What the account is doing over time</h2></div><span>Last 30 imported days</span></div>
        <div className="trend-layout">
          <div className="trend-metrics">
            <TrendMetric label="Reach" value={totalReach} />
            <TrendMetric label="Views" value={totalViews} />
            <TrendMetric label="Profile views" value={profileViews} />
            <TrendMetric label="New followers" value={newFollowers} />
          </div>
          <AccountTrendChart trends={recentTrends} />
        </div>
        {!recentTrends.length && <div className="performance-empty">Run “Import existing posts” to request the account-level history Meta makes available. Missing days remain blank, never zero-filled.</div>}
      </section>

      <section className="performance-section" id="existing-posts">
        <div className="section-heading-wide"><div><p className="section-label">02 · Existing posts library</p><h2>Your published baseline</h2><p>Current lifetime totals imported from Instagram. These are useful for ranking your existing work, but they are not retroactive 24-hour or 7-day snapshots.</p></div><span>{mediaItems.length} imported</span></div>
        <div className="media-library">
          {mediaItems.length ? mediaItems.map((item) => (
            <ExistingPost key={item.id} item={item} onUpdate={(updated) => setMediaItems((items) => items.map((candidate) => candidate.id === updated.id ? updated : candidate))} />
          )) : <div className="performance-empty">No existing Instagram posts have been imported yet.</div>}
        </div>
      </section>

      <section className="performance-section" id="dashboard-experiments">
        <div className="section-heading-wide"><div><p className="section-label">03 · Dashboard experiments</p><h2>Comparable review windows</h2><p>Experiments with an established Instagram connection stay here for like-for-like review. Phone-published posts require no ID and appear in the existing-post library after sync.</p></div><span>{linked.length} connected</span></div>
        <div className="performance-summary">
          <Metric value={linked.length} label="Linked posts" />
          <Metric value={reviews.filter((review) => review.status === "Pending").length} label="Windows pending" />
          <Metric value={reviews.filter((review) => review.status === "Complete").length} label="Windows complete" />
        </div>
        <div className="performance-stack">
          {linked.length === 0 ? <div className="performance-empty">No controlled review windows are connected yet. Keep posting from your phone; use “Sync existing posts” to bring each published post and its available metrics into the library above.</div> : linked.map((item) => (
            <PerformanceCard key={item.id} item={item} metrics={metrics} reviews={reviews} />
          ))}
        </div>
      </section>

      <section className="performance-section" id="winners-patterns">
        <div className="section-heading-wide"><div><p className="section-label">04 · Winners and patterns</p><h2>Signals worth repeating—not premature rules</h2><p>A single high performer is an observation. A repeatable pattern requires comparable posts and repeated evidence.</p></div><span>{mediaItems.length + linked.length} evidence items</span></div>
        <div className="pattern-ledger">
          <PatternSignal label="Attention" item={topViewed} metric="views" />
          <PatternSignal label="Distribution" item={topShared} metric="shares" />
          <PatternSignal label="Resonance" item={topSaved} metric="saves" />
          <article className="retention-framework">
            <p className="section-label">Reel diagnostic framework</p>
            <h3>Hook → pacing → rewatch → outro</h3>
            <ol>
              <li><strong>First 3 seconds:</strong> log Edits hook/skip rate; use 60–70% retention as a working target, then replace it with your own baseline.</li>
              <li><strong>Mid-video dips:</strong> identify the exact pause, repetition, transition, or confusing line.</li>
              <li><strong>Spikes:</strong> note text or details that caused a rewatch and deliberately test the mechanic again.</li>
              <li><strong>End drop:</strong> remove announced outros and place the payoff against the final frame.</li>
            </ol>
          </article>
        </div>
      </section>
    </section>
  );
}

function TrendMetric({ label, value }: { label: string; value?: number }) {
  return <div className="trend-metric"><span>{label}</span><strong>{value === undefined ? "—" : value.toLocaleString()}</strong></div>;
}

function AccountTrendChart({ trends }: { trends: InstagramAccountDaily[] }) {
  const values = trends.map((day) => day.reach).filter((value): value is number => typeof value === "number");
  if (values.length < 2) return <div className="trend-chart empty"><span>Daily reach chart appears after Meta returns at least two dated values.</span></div>;
  const max = Math.max(...values, 1);
  const points = values.map((value, index) => `${(index / Math.max(values.length - 1, 1)) * 100},${46 - (value / max) * 42}`).join(" ");
  return <div className="trend-chart"><div><span>Daily reach</span><small>Imported account series</small></div><svg viewBox="0 0 100 48" role="img" aria-label="Daily Instagram reach trend"><polyline points={points} fill="none" stroke="currentColor" strokeWidth="1.6" vectorEffect="non-scaling-stroke" /></svg></div>;
}

function mediaLabel(item: InstagramMediaItem) {
  const caption = item.caption?.trim();
  return caption ? caption.split(/\s+/).slice(0, 12).join(" ") : `${item.mediaProductType || item.mediaType || "Instagram"} post`;
}

function ExistingPost({ item, onUpdate }: { item: InstagramMediaItem; onUpdate: (item: InstagramMediaItem) => void }) {
  return (
    <article className="media-row">
      <div className="media-identity">
        <span>{item.mediaProductType || item.mediaType || "POST"} · {formatDate(item.postedAt)}</span>
        <strong>{mediaLabel(item)}</strong>
        {item.permalink && <a href={item.permalink} target="_blank" rel="noreferrer">Open on Instagram</a>}
      </div>
      <div className="media-metrics">
        <TrendMetric label="Views" value={item.views} /><TrendMetric label="Reach" value={item.reach} />
        <TrendMetric label="Shares" value={item.shares} /><TrendMetric label="Saves" value={item.saves} />
      </div>
      {(item.mediaProductType?.toUpperCase() === "REELS" || item.mediaType?.toUpperCase() === "VIDEO") && <EditsDiagnostics item={item} onUpdate={onUpdate} />}
    </article>
  );
}

function optionalPercent(value: string) {
  if (!value.trim()) return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function EditsDiagnostics({ item, onUpdate }: { item: InstagramMediaItem; onUpdate: (item: InstagramMediaItem) => void }) {
  const [open, setOpen] = useState(Boolean(item.editsUpdatedAt));
  const [hookRate, setHookRate] = useState(item.hookRate?.toString() ?? "");
  const [skipRate, setSkipRate] = useState(item.skipRate?.toString() ?? "");
  const [followerShare, setFollowerShare] = useState(item.followerViewPercentage?.toString() ?? "");
  const [nonFollowerShare, setNonFollowerShare] = useState(item.nonFollowerViewPercentage?.toString() ?? "");
  const [notes, setNotes] = useState(item.retentionNotes ?? "");
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  async function save() {
    setSaving(true); setMessage(null);
    try {
      const response = await fetch(`/api/instagram/media/${encodeURIComponent(item.instagramMediaId)}/diagnostics`, {
        method: "PATCH", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ hookRate: optionalPercent(hookRate), skipRate: optionalPercent(skipRate), followerViewPercentage: optionalPercent(followerShare), nonFollowerViewPercentage: optionalPercent(nonFollowerShare), retentionNotes: notes }),
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || "Edits diagnostics could not be saved.");
      onUpdate(result.media); setMessage("Edits diagnostics saved.");
    } catch (cause) { setMessage(cause instanceof Error ? cause.message : "Edits diagnostics could not be saved."); }
    finally { setSaving(false); }
  }

  return (
    <div className="edits-diagnostics">
      <button type="button" className="text-action" onClick={() => setOpen((value) => !value)}>{open ? "Hide Edits diagnostics" : item.editsUpdatedAt ? "Review Edits diagnostics" : "Add Edits retention diagnostics"}</button>
      {open && <div className="edits-form">
        <p>Meta imports standard totals automatically. Enter Edits-only retention evidence here—never estimate it from views.</p>
        <label><span>Hook rate %</span><input type="number" min="0" max="100" step="0.1" value={hookRate} onChange={(event) => setHookRate(event.target.value)} /></label>
        <label><span>Skip rate %</span><input type="number" min="0" max="100" step="0.1" value={skipRate} onChange={(event) => setSkipRate(event.target.value)} /></label>
        <label><span>Follower views %</span><input type="number" min="0" max="100" step="0.1" value={followerShare} onChange={(event) => setFollowerShare(event.target.value)} /></label>
        <label><span>Non-follower views %</span><input type="number" min="0" max="100" step="0.1" value={nonFollowerShare} onChange={(event) => setNonFollowerShare(event.target.value)} /></label>
        <label className="retention-notes"><span>Retention graph notes</span><textarea rows={4} value={notes} onChange={(event) => setNotes(event.target.value)} placeholder="0–3s shape… exact mid-video dip… rewatch spike… pre-end drop…" /></label>
        <button type="button" className="secondary-action" disabled={saving} onClick={() => void save()}>{saving ? "Saving…" : "Save Edits diagnostics"}</button>
        {message && <small>{message}</small>}
      </div>}
    </div>
  );
}

function PatternSignal({ label, item, metric }: { label: string; item?: InstagramMediaItem; metric: "views" | "shares" | "saves" }) {
  return <article className="pattern-signal"><p className="section-label">{label}</p>{item ? <><strong>{mediaLabel(item)}</strong><span>{(item[metric] ?? 0).toLocaleString()} {metric}</span><small>Current historical leader. Treat as an observation until a comparable post repeats the result.</small></> : <span>No imported evidence yet.</span>}</article>;
}

function BrandSystem({ sources }: { sources: BrandSourceInventory[] }) {
  const pillars = [
    "Reinvention",
    "Identity",
    "Standards",
    "Action",
    "Responsibility",
    "Self-Respect",
    "Perspective",
    "Life Story",
  ];

  function sourceOrigin(source: BrandSourceInventory) {
    const externalId = source.sourceExternalId ?? "";
    const productionMatch = externalId.match(/^content-production:(\d+)/);
    if (productionMatch) return `Content Production · ${productionMatch[1].padStart(2, "0")}`;
    if (externalId.startsWith("story-bank:")) return "Story Bank · Daily Entries";
    return source.sourceType;
  }

  return (
    <section className="brand-layout stagger-in">
      <div className="brand-thesis">
        <p className="section-label">Driving thesis</p>
        <h2>Reinvention is the middle, not the before-and-after.</h2>
        <p>
          Mario documents the period when the old identity no longer fits, the next life is not
          built yet, and action still has to happen without certainty.
        </p>
      </div>
      <div className="pillar-list">
        <p className="section-label">Content pillars</p>
        {pillars.map((pillar, index) => (
          <div key={pillar}><span>0{index + 1}</span><strong>{pillar}</strong></div>
        ))}
      </div>
      <div className="brand-rules">
        <p className="section-label">Ship gate</p>
        <ul>
          <li>Mario appears early through a receipt, observation, or opinion.</li>
          <li>One post carries one primary idea.</li>
          <li>No story, metric, feeling, or biography is invented.</li>
          <li>A saved post supplies delivery only, never substance.</li>
          <li>A generic self-improvement account cannot publish it unchanged.</li>
        </ul>
      </div>
      <div className="source-inventory">
        <div className="panel-heading">
          <div><p className="section-label">Live source inventory</p><h3>Mario-owned material in Supabase</h3></div>
          <span>{sources.length} sources</span>
        </div>
        {sources.length === 0 ? <p>No sources are available.</p> : sources.map((source) => (
          <article key={source.id}>
            <div>
              <span>{sourceOrigin(source)}</span>
              <strong>{source.title}</strong>
              <p>{source.coreTruth}</p>
            </div>
            <div className="source-facts">
              <StatusPill status={source.status} />
              <span className={source.privacyStatus === "Clear" ? "privacy clear" : "privacy"}>{source.privacyStatus}</span>
              <small>{source.usageCount} production use{source.usageCount === 1 ? "" : "s"}</small>
            </div>
          </article>
        ))}
      </div>
    </section>
  );
}

function EmptyState({ title, body }: { title: string; body: string }) {
  return (
    <section className="empty-state stagger-in">
      <span className="empty-line" />
      <p className="section-label">Nothing here yet</p>
      <h2>{title}</h2>
      <p>{body}</p>
    </section>
  );
}

function StatusPill({ status }: { status: string }) {
  return <span className={`status-pill status-${status.toLowerCase().replaceAll(" ", "-")}`}>{status}</span>;
}
