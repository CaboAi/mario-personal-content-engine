"use client";

import { useState } from "react";
import type {
  BrandSourceInventory,
  CarouselPublication,
  ContentPackage,
  DashboardData,
  MetricSnapshot,
  Pairing,
  PerformanceReview,
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
  const [publications, setPublications] = useState(initialData.publications);
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
            publications={publications}
            publishingConnected={initialData.publishingConnected}
            liveMode={initialData.liveMode}
            onContentChange={(updated) =>
              setContent((items) =>
                items.map((item) => (item.id === updated.id ? updated : item)),
              )
            }
            onPublicationChange={(updated) =>
              setPublications((items) => [
                updated,
                ...items.filter((item) => item.contentId !== updated.contentId),
              ])
            }
            onStatusChange={updateProductionStatus}
            statusUpdates={statusUpdates}
          />
        )}

        {view === "performance" && (
          <PerformanceLab
            connected={initialData.analyticsConnected}
            content={content}
            metrics={initialData.metrics}
            reviews={initialData.performanceReviews}
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
  publications,
  publishingConnected,
  liveMode,
  onContentChange,
  onPublicationChange,
  onStatusChange,
  statusUpdates,
}: {
  content: ContentPackage[];
  publications: CarouselPublication[];
  publishingConnected: boolean;
  liveMode: boolean;
  onContentChange: (content: ContentPackage) => void;
  onPublicationChange: (publication: CarouselPublication) => void;
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
            {item.carouselSlides.length > 0 && (
              <div className="carousel-plan">
                <div className="panel-heading">
                  <div>
                    <p className="section-label">Carousel slide plan</p>
                    <h3>One idea per slide</h3>
                  </div>
                  <span>{item.carouselSlides.length} slides</span>
                </div>
                <ol>
                  {item.carouselSlides.map((slide, index) => (
                    <li key={`${item.id}-slide-${index}`}>
                      <span>{String(index + 1).padStart(2, "0")}</span>
                      <div><strong>{slide.headline}</strong><p>{slide.body}</p><small>{slide.altText}</small></div>
                    </li>
                  ))}
                </ol>
              </div>
            )}
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
            <div className="distribution-tools">
              <InstagramLinker
                item={item}
                liveMode={liveMode}
                onContentChange={onContentChange}
              />
              {item.format === "Carousel" && (
                <CarouselPublisher
                  item={item}
                  publication={publications.find((job) => job.contentId === item.id)}
                  connected={publishingConnected}
                  liveMode={liveMode}
                  onPublicationChange={onPublicationChange}
                />
              )}
            </div>
          </article>;
        })}
      </div>
    </section>
  );
}

function InstagramLinker({
  item,
  liveMode,
  onContentChange,
}: {
  item: ContentPackage;
  liveMode: boolean;
  onContentChange: (content: ContentPackage) => void;
}) {
  const [mediaId, setMediaId] = useState("");
  const [postDate, setPostDate] = useState(new Date().toISOString().slice(0, 16));
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  if (item.instagramMediaId) {
    return (
      <section className="distribution-card linked">
        <p className="section-label">Instagram post linked</p>
        <strong>{item.instagramMediaId}</strong>
        <span>24-hour and 7-day review windows are scheduled from {item.postDate ? formatDate(item.postDate) : "the post date"}.</span>
        {item.instagramPermalink && <a href={item.instagramPermalink} target="_blank" rel="noreferrer">Open on Instagram</a>}
      </section>
    );
  }

  async function linkPost() {
    setSaving(true);
    setMessage(null);
    try {
      if (!liveMode) throw new Error("Supabase is required to schedule review windows.");
      const parsedDate = new Date(postDate);
      if (!mediaId.trim() || Number.isNaN(parsedDate.getTime())) throw new Error("Add the Instagram Media ID and post date.");
      const response = await fetch(`/api/content/${encodeURIComponent(item.id)}/instagram`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ instagramMediaId: mediaId.trim(), postDate: parsedDate.toISOString() }),
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || "Instagram link failed.");
      onContentChange(result.content);
    } catch (cause) {
      setMessage(cause instanceof Error ? cause.message : "Instagram link failed.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <section className="distribution-card">
      <p className="section-label">Already published manually?</p>
      <h3>Link the Instagram post</h3>
      <p>This does not publish anything. It schedules like-for-like 24-hour and 7-day measurement.</p>
      <div className="compact-form">
        <label><span>Instagram Media ID</span><input value={mediaId} onChange={(event) => setMediaId(event.target.value)} placeholder="1789…" /></label>
        <label><span>Published at</span><input type="datetime-local" value={postDate} onChange={(event) => setPostDate(event.target.value)} /></label>
        <button type="button" className="secondary-action" disabled={saving || !mediaId.trim()} onClick={() => void linkPost()}>{saving ? "Linking…" : "Link post"}</button>
      </div>
      {message && <p className="operation-message error" role="alert">{message}</p>}
    </section>
  );
}

function CarouselPublisher({
  item,
  publication,
  connected,
  liveMode,
  onPublicationChange,
}: {
  item: ContentPackage;
  publication?: CarouselPublication;
  connected: boolean;
  liveMode: boolean;
  onPublicationChange: (publication: CarouselPublication) => void;
}) {
  const [assetUrls, setAssetUrls] = useState<string[]>(
    publication?.assetUrls.length ? publication.assetUrls : item.carouselSlides.map(() => ""),
  );
  const [caption, setCaption] = useState(publication?.caption ?? item.caption ?? "");
  const [confirmed, setConfirmed] = useState(false);
  const [busy, setBusy] = useState<"validate" | "publish" | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const altTexts = item.carouselSlides.map((slide) => slide.altText);
  const currentStatus = publication?.status ?? "Draft";

  function updateAsset(index: number, value: string) {
    setAssetUrls((values) => values.map((current, currentIndex) => currentIndex === index ? value : current));
  }

  async function validateAssets() {
    setBusy("validate");
    setMessage(null);
    try {
      if (!liveMode) throw new Error("Supabase is required to validate carousel assets.");
      const response = await fetch(`/api/carousels/${encodeURIComponent(item.id)}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ assetUrls, altTexts, caption }),
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || "Carousel validation failed.");
      onPublicationChange(result.publication);
      setMessage("Assets validated. Review every slide before enabling publish.");
    } catch (cause) {
      setMessage(cause instanceof Error ? cause.message : "Carousel validation failed.");
    } finally {
      setBusy(null);
    }
  }

  async function publishCarousel() {
    setBusy("publish");
    setMessage(null);
    try {
      const response = await fetch(`/api/carousels/${encodeURIComponent(item.id)}/publish`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ confirmed: true }),
      });
      const result = await response.json();
      if (!response.ok && response.status !== 202) throw new Error(result.error || "Carousel publishing failed.");
      if (result.publication) onPublicationChange(result.publication);
      setMessage(result.message || "Carousel published to Instagram.");
      setConfirmed(false);
    } catch (cause) {
      setMessage(cause instanceof Error ? cause.message : "Carousel publishing failed.");
    } finally {
      setBusy(null);
    }
  }

  return (
    <section className="distribution-card carousel-publisher">
      <div className="distribution-heading">
        <div><p className="section-label">Carousel publisher</p><h3>Validate, review, then publish</h3></div>
        <StatusPill status={currentStatus} />
      </div>
      <p>Use public HTTPS JPEG URLs. Nothing is sent to Meta until the final confirmed button is clicked.</p>
      <div className="asset-list">
        {item.carouselSlides.map((slide, index) => (
          <label key={`${item.id}-asset-${index}`}>
            <span>Slide {index + 1}: {slide.headline}</span>
            <input type="url" value={assetUrls[index] ?? ""} onChange={(event) => updateAsset(index, event.target.value)} placeholder="https://…/slide.jpg" />
            <small>Alt text: {slide.altText}</small>
          </label>
        ))}
      </div>
      <label className="caption-field"><span>Instagram caption</span><textarea rows={5} value={caption} onChange={(event) => setCaption(event.target.value)} /></label>
      <div className="publisher-actions">
        <button type="button" className="secondary-action" disabled={busy !== null || assetUrls.some((url) => !url)} onClick={() => void validateAssets()}>{busy === "validate" ? "Validating…" : "Validate assets"}</button>
        <label className="publish-confirmation">
          <input type="checkbox" checked={confirmed} onChange={(event) => setConfirmed(event.target.checked)} disabled={currentStatus !== "Validated" && currentStatus !== "Processing"} />
          <span>I reviewed every image, alt text, order, and caption.</span>
        </label>
        <button type="button" className="primary-action publish-action" disabled={!connected || !confirmed || busy !== null || (currentStatus !== "Validated" && currentStatus !== "Processing")} onClick={() => void publishCarousel()}>{busy === "publish" ? "Sending to Meta…" : connected ? "Publish carousel to Instagram" : "Connect Meta to publish"}</button>
      </div>
      {message && <p className="operation-message" role="status">{message}</p>}
      {publication?.instagramPermalink && <a href={publication.instagramPermalink} target="_blank" rel="noreferrer">Open published carousel</a>}
      {publication?.lastError && <p className="operation-message error" role="alert">{publication.lastError}</p>}
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
  const rows: Array<[string, keyof MetricSnapshot]> = [
    ["Views", "views"], ["Reach", "reach"], ["Average watch time", "averageWatchSeconds"],
    ["Shares", "shares"], ["Saves", "saves"], ["Follows", "follows"],
  ];
  return (
    <article className="performance-card">
      <div className="performance-card-heading">
        <div><span>{item.goal} goal</span><h3>{item.title}</h3></div>
        <StatusPill status={signal} />
      </div>
      <div className="metric-table">
        <div className="metric-table-head"><span>Metric</span><span>24 hours</span><span>7 days</span><span>Signal</span></div>
        {rows.map(([label, key]) => (
          <div className="metric-table-row" key={label}><strong>{label}</strong><span>{metricValue(at24, key)}</span><span>{metricValue(at168, key)}</span><span>{signal}</span></div>
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
}: {
  connected: boolean;
  content: ContentPackage[];
  metrics: MetricSnapshot[];
  reviews: PerformanceReview[];
}) {
  const [refreshing, setRefreshing] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const linked = content.filter((item) => item.instagramMediaId);

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

  return (
    <section className="performance-layout stagger-in">
      <div className="performance-lead">
        <p className="section-label">Instagram account insights</p>
        <h2>{connected ? "Analytics connection active" : "Connect Meta to begin the baseline"}</h2>
        <p>
          Each linked post is reviewed at the same 24-hour and 7-day windows. Meta can lag by
          up to 48 hours, so unavailable values stay blank and retry later instead of becoming zero.
        </p>
        <button type="button" className="secondary-action" disabled={!connected || refreshing} onClick={() => void refreshInsights()}>
          {refreshing ? "Refreshing…" : connected ? "Refresh due windows" : "Meta connection required"}
        </button>
        {message && <p className="operation-message" role="status">{message}</p>}
      </div>
      <div className="performance-stack">
        <div className="performance-summary">
          <Metric value={linked.length} label="Linked posts" />
          <Metric value={reviews.filter((review) => review.status === "Pending").length} label="Windows pending" />
          <Metric value={reviews.filter((review) => review.status === "Complete").length} label="Windows complete" />
        </div>
        {linked.length === 0 ? (
          <div className="performance-empty">Link an Instagram Media ID from Production after a post goes live.</div>
        ) : linked.map((item) => (
          <PerformanceCard key={item.id} item={item} metrics={metrics} reviews={reviews} />
        ))}
      </div>
    </section>
  );
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
              <span>{source.sourceType}</span>
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
