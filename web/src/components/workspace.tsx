"use client";

import { useState } from "react";
import type {
  ContentPackage,
  DashboardData,
  Pairing,
  ProductionStatus,
  SavedPost,
} from "@/lib/domain";
import { generatedDemoPackage } from "@/lib/demo-data";

type View = "command" | "saves" | "production" | "performance" | "brand";

const views: Array<{ id: View; label: string; index: string }> = [
  { id: "command", label: "Command Center", index: "01" },
  { id: "saves", label: "Saves Inbox", index: "02" },
  { id: "production", label: "Production", index: "03" },
  { id: "performance", label: "Performance", index: "04" },
  { id: "brand", label: "Brand System", index: "05" },
];

const productionStatuses: ProductionStatus[] = [
  "Script Ready",
  "Ready to Record",
  "Recorded",
  "Edited",
  "Scheduled",
  "Posted",
];

function formatDate(value: string) {
  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  }).format(new Date(value));
}

export function Workspace({ initialData }: { initialData: DashboardData }) {
  const [view, setView] = useState<View>("command");
  const [saves, setSaves] = useState(initialData.saves);
  const [content, setContent] = useState(initialData.content);
  const [selectedSaveId, setSelectedSaveId] = useState(initialData.saves[0]?.id);
  const [selectedPairingId, setSelectedPairingId] = useState<string | undefined>(
    initialData.saves[0]?.pairings.find((pairing) => pairing.recommended)?.id,
  );
  const [isGenerating, setIsGenerating] = useState(false);
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [inspectionNotes, setInspectionNotes] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [statusUpdates, setStatusUpdates] = useState<
    Record<string, { saving: boolean; error?: string; saved?: boolean }>
  >({});

  const selectedSave = saves.find((save) => save.id === selectedSaveId);
  const selectedPairing = selectedSave?.pairings.find(
    (pairing) => pairing.id === selectedPairingId,
  );
  const reviewCount = saves.filter((save) => save.status === "Needs Review").length;
  const readyCount = content.filter((item) => item.status === "Script Ready").length;
  const inventoryCount = content.filter((item) => item.status !== "Posted").length;

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
          body: JSON.stringify({ save: selectedSave, pairing: selectedPairing }),
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

  async function analyzeSave() {
    if (!selectedSave) return;
    if (inspectionNotes.trim().length < 40) {
      setError("Add specific notes from watching the actual post before analysis.");
      return;
    }
    setError(null);
    setIsAnalyzing(true);
    try {
      const response = await fetch("/api/saves/analyze", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ saveId: selectedSave.id, inspectionNotes }),
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || "Analysis failed.");
      const analyzed = result.save as SavedPost;
      setSaves((items) => items.map((save) => save.id === analyzed.id ? analyzed : save));
      setSelectedPairingId(analyzed.pairings.find((pairing) => pairing.recommended)?.id || analyzed.pairings[0]?.id);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Analysis failed.");
    } finally {
      setIsAnalyzing(false);
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
          {views.map((item) => (
            <button
              key={item.id}
              className={view === item.id ? "rail-link active" : "rail-link"}
              onClick={() => setView(item.id)}
              type="button"
            >
              <span>{item.index}</span>
              {item.label}
            </button>
          ))}
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
              setError(null);
              setInspectionNotes(save.inspectionNotes || "");
            }}
            onSelectPairing={(pairing) => {
              setSelectedPairingId(pairing.id);
              setError(null);
            }}
            onApprove={approveAndGenerate}
            inspectionNotes={inspectionNotes}
            onInspectionNotesChange={setInspectionNotes}
            onAnalyze={analyzeSave}
            isAnalyzing={isAnalyzing}
            isGenerating={isGenerating}
            error={error}
          />
        )}

        {view === "production" && (
          <ProductionBoard
            content={content}
            onStatusChange={updateProductionStatus}
            statusUpdates={statusUpdates}
          />
        )}

        {view === "performance" && (
          <PerformanceLab connected={initialData.analyticsConnected} />
        )}

        {view === "brand" && <BrandSystem />}
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
}: {
  reviewCount: number;
  readyCount: number;
  inventoryCount: number;
  saves: SavedPost[];
  content: ContentPackage[];
  onOpenSaves: () => void;
  onOpenProduction: () => void;
}) {
  const priority = reviewCount > 0 ? "Review the latest saved-post pairing" : "Capture a new Mario story";

  return (
    <section className="command-grid stagger-in">
      <div className="command-lead">
        <p className="section-label">Today’s decision</p>
        <h2>{priority}</h2>
        <p>
          The engine can prepare the structure. The decision that matters is which
          Mario-owned truth deserves the format.
        </p>
        <button className="primary-action" onClick={onOpenSaves} type="button">
          Open review queue
        </button>
      </div>

      <div className="metric-ribbon" aria-label="Workflow summary">
        <Metric value={reviewCount} label="Needs review" />
        <Metric value={readyCount} label="Scripts ready" />
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
  inspectionNotes,
  onInspectionNotesChange,
  onAnalyze,
  isAnalyzing,
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
  inspectionNotes: string;
  onInspectionNotesChange: (value: string) => void;
  onAnalyze: () => void;
  isAnalyzing: boolean;
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

        {(selectedSave.status === "New" || selectedSave.status === "Blocked") && (
          <div className="analysis-panel">
            <div>
              <p className="section-label">Actual-post inspection</p>
              <h3>Describe only what you can observe</h3>
              <p>
                Watch the post, then note the first frame, spoken hook, sequence, cuts,
                captions, framing, pacing, and CTA. The creator’s topic stays off-limits.
              </p>
            </div>
            <label>
              <span>Inspection notes</span>
              <textarea
                value={inspectionNotes}
                onChange={(event) => onInspectionNotesChange(event.target.value)}
                placeholder="First frame… Hook… Beat sequence… Visual pacing… CTA placement…"
                rows={7}
              />
            </label>
            <button
              type="button"
              className="primary-action"
              onClick={onAnalyze}
              disabled={isAnalyzing || inspectionNotes.trim().length < 40}
            >
              {isAnalyzing ? "Analyzing delivery DNA…" : "Analyze save"}
            </button>
          </div>
        )}

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
            <p className="section-label">Mario-owned pairings</p>
            <h3>Choose the substance</h3>
          </div>
          <span>One source only</span>
        </div>}

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
                  {pairing.recommended && <span className="recommended">Recommended</span>}
                </div>
                <p>{pairing.rationale}</p>
                <span className="source-name">Source: {pairing.sourceTitle}</span>
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
          <div className="approval-dock">
            <div>
              <p className="section-label">Selected direction</p>
              <strong>{selectedPairing.title}</strong>
              <span>{selectedPairing.direction}</span>
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
              {isGenerating ? "Building package…" : "Approve and generate"}
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
  onStatusChange,
  statusUpdates,
}: {
  content: ContentPackage[];
  onStatusChange: (id: string, status: ProductionStatus) => Promise<void>;
  statusUpdates: Record<string, { saving: boolean; error?: string; saved?: boolean }>;
}) {
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
      <div className="production-list">
        {content.map((item) => {
          const alternativeSpokenHooks = item.spokenHooks.filter(
            (hook) => hook !== item.selectedHook,
          );
          const alternativeOnScreenHooks = item.onScreenHooks.filter(
            (hook) => hook !== item.selectedOnScreenHook,
          );
          const statusUpdate = statusUpdates[item.id];

          return <article className="production-item" key={item.id}>
            <div className="production-meta">
              <span>{item.format}</span>
              <span>{item.goal}</span>
              <span>{item.testVariable} test</span>
            </div>
            <h2>{item.title}</h2>
            <div className="selected-hooks" aria-label="Selected opening">
              <div className="selected-hook spoken">
                <p className="section-label">Recommended spoken hook</p>
                <span className="instruction">Say this first</span>
                <blockquote>{item.selectedHook}</blockquote>
              </div>
              <div className="selected-hook on-screen">
                <p className="section-label">On-screen hook</p>
                <span className="instruction">Show this text during the opening</span>
                <strong>{item.selectedOnScreenHook}</strong>
              </div>
            </div>
            <div className="production-sections">
              <section className="production-section alternatives">
                <div>
                  <p className="section-label">Alternative spoken hooks</p>
                  <span className="instruction">Use one of these instead only when testing the opener</span>
                  {alternativeSpokenHooks.length > 0 ? (
                    <ol>
                      {alternativeSpokenHooks.map((hook) => <li key={hook}>{hook}</li>)}
                    </ol>
                  ) : <p className="empty-option">No alternatives generated.</p>}
                </div>
                <div>
                  <p className="section-label">Alternative on-screen hooks</p>
                  <span className="instruction">Optional visual opener variants</span>
                  {alternativeOnScreenHooks.length > 0 ? (
                    <ol>
                      {alternativeOnScreenHooks.map((hook) => <li key={hook}>{hook}</li>)}
                    </ol>
                  ) : <p className="empty-option">No alternatives generated.</p>}
                </div>
              </section>
              <section className="production-section talking-prompts">
                <p className="section-label">Talking prompts—not a script</p>
                <span className="instruction">Follow the ideas in order and explain them in your own words</span>
                <ol>
                  {item.skeleton.map((beat) => <li key={beat}>{beat}</li>)}
                </ol>
                <p className="riff-note">Hit record and riff on this. If it sounds polished, restart.</p>
              </section>
            </div>
            <div className="hypothesis">
              <p className="section-label">Internal test note—do not record</p>
              <p>{item.hypothesis}</p>
            </div>
            <div className="production-footer">
              <div className="closing-block">
                <span>Final spoken line</span>
                <small>Say this last, then stop unless an optional CTA appears below.</small>
                <strong>{item.closingLine}</strong>
                {item.cta && (
                  <div className="optional-cta">
                    <span>Optional CTA</span>
                    <strong>{item.cta}</strong>
                  </div>
                )}
              </div>
              <div className="status-control">
                <label htmlFor={`status-${item.id}`}>Production status</label>
                <select
                  id={`status-${item.id}`}
                  value={item.status}
                  disabled={statusUpdate?.saving}
                  aria-describedby={`status-message-${item.id}`}
                  onChange={(event) =>
                    void onStatusChange(item.id, event.target.value as ProductionStatus)
                  }
                >
                  {productionStatuses.map((status) => (
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
          </article>;
        })}
      </div>
    </section>
  );
}

function PerformanceLab({ connected }: { connected: boolean }) {
  return (
    <section className="performance-layout stagger-in">
      <div className="performance-lead">
        <p className="section-label">Instagram account insights</p>
        <h2>{connected ? "Analytics connection active" : "Connect Meta to begin the baseline"}</h2>
        <p>
          Performance only becomes useful when each post is measured at the same review window.
          The first dashboard version will compare owned media at 24-hour and 7-day snapshots.
        </p>
        <button type="button" className="secondary-action" disabled={!connected}>
          {connected ? "Refresh insights" : "Meta connection comes in Phase 3"}
        </button>
      </div>
      <div className="metric-table">
        <div className="metric-table-head">
          <span>Metric</span><span>24 hours</span><span>7 days</span><span>Signal</span>
        </div>
        {[
          "Views",
          "Reach",
          "Average watch time",
          "Shares",
          "Saves",
          "Follows",
        ].map((metric) => (
          <div className="metric-table-row" key={metric}>
            <strong>{metric}</strong><span>Not connected</span><span>Not connected</span><span>Baseline pending</span>
          </div>
        ))}
      </div>
    </section>
  );
}

function BrandSystem() {
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
