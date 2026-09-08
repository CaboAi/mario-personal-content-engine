"use client";

import { useMemo, useState } from "react";
import { getBatchMix } from "@/lib/batch-mix";
import type { ContentBatch, ContentPackage } from "@/lib/domain";

type Props = {
  batches: ContentBatch[];
  content: ContentPackage[];
  onReschedule: (id: string, plannedFor: string | null) => Promise<void>;
  onOpenProduction: () => void;
  scheduleUpdates: Record<string, { saving: boolean; error?: string }>;
};

function prettyDate(value?: string) {
  if (!value) return "Unscheduled";
  return new Intl.DateTimeFormat("en-US", { weekday: "short", month: "short", day: "numeric" })
    .format(new Date(`${value}T12:00:00`));
}

export function EditorialCalendar({ batches, content, onReschedule, onOpenProduction, scheduleUpdates }: Props) {
  const [batchId, setBatchId] = useState(batches[0]?.id ?? "all");
  const [goal, setGoal] = useState("all");
  const [status, setStatus] = useState("all");
  const [selectedId, setSelectedId] = useState<string | null>(null);

  const scheduled = useMemo(() => content
    .filter((item) => !item.archivedAt && item.status !== "Posted")
    .filter((item) => batchId === "all" || item.batchId === batchId)
    .filter((item) => goal === "all" || item.goal === goal)
    .filter((item) => status === "all" || item.status === status)
    .sort((a, b) => (a.plannedFor ?? "9999-12-31").localeCompare(b.plannedFor ?? "9999-12-31")),
  [batchId, content, goal, status]);

  const selected = content.find((item) => item.id === selectedId);
  const activeBatch = batches.find((batch) => batch.id === batchId);
  const batchPackages = useMemo(() => content
    .filter((item) => !item.archivedAt)
    .filter((item) => batchId === "all" || item.batchId === batchId), [batchId, content]);
  const batchMix = useMemo(() => getBatchMix(batchPackages), [batchPackages]);
  const uniqueGoals = [...new Set(content.map((item) => item.goal))];
  const uniqueStatuses = [...new Set(content.map((item) => item.status))];

  return <section className="calendar-layout stagger-in">
    <div className="calendar-heading">
      <div>
        <p className="section-label">Editorial calendar</p>
        <h2>{activeBatch?.title ?? "Your upcoming content"}</h2>
        <p>Planning dates are editorial only. Instagram posting and performance review timing remain tied to the actual post match.</p>
      </div>
      <button type="button" className="secondary-action" onClick={onOpenProduction}>Open Today focus</button>
    </div>

    <div className="batch-mode-mix" role="status">
      <strong>{batchMix.legal ? "Mode mix is legal" : "Mode mix is not legal"}</strong>
      <span>Dispatch {batchMix.actualPercentages.Dispatch.toFixed(0)}% / {batchMix.targetPercentages.Dispatch}% target</span>
      <span>Practical {batchMix.actualPercentages.Practical.toFixed(0)}% / {batchMix.targetPercentages.Practical}% target</span>
      <span>Reflection {batchMix.actualPercentages.Reflection.toFixed(0)}% / {batchMix.targetPercentages.Reflection}% target (33% ceiling)</span>
      {batchMix.violations.map((violation) => <span key={`${violation.mode}-${violation.rule}`}>{violation.message}</span>)}
    </div>

    <div className="calendar-filters" aria-label="Calendar filters">
      <label><span>Batch</span><select value={batchId} onChange={(event) => setBatchId(event.target.value)}><option value="all">All batches</option>{batches.map((batch) => <option key={batch.id} value={batch.id}>{batch.title}</option>)}</select></label>
      <label><span>Goal</span><select value={goal} onChange={(event) => setGoal(event.target.value)}><option value="all">All goals</option>{uniqueGoals.map((value) => <option key={value}>{value}</option>)}</select></label>
      <label><span>Status</span><select value={status} onChange={(event) => setStatus(event.target.value)}><option value="all">All statuses</option>{uniqueStatuses.map((value) => <option key={value}>{value}</option>)}</select></label>
    </div>

    {activeBatch?.sourceUrl && <a className="calendar-source-link" href={activeBatch.sourceUrl} target="_blank" rel="noreferrer">Open Notion reference</a>}

    <div className="calendar-grid">
      {scheduled.map((item) => {
        const update = scheduleUpdates[item.id];
        return <article className="calendar-card" key={item.id}>
          <button className="calendar-card-main" type="button" onClick={() => setSelectedId(item.id)}>
            <span className="calendar-date">{prettyDate(item.plannedFor)}</span>
            <strong>{item.title}</strong>
            <span>{item.mode ?? "Reflection"} · {item.format} · {item.goal} · {item.testVariable} test</span>
            <div><span className={`status-pill status-${item.status.toLowerCase().replaceAll(" ", "-")}`}>{item.status}</span>{item.publicationClearance === false && <span className="calendar-privacy">Needs approval</span>}</div>
          </button>
          <label className="calendar-date-edit"><span>Planned date</span><input aria-label={`Planned date for ${item.title}`} type="date" value={item.plannedFor ?? ""} disabled={update?.saving} onChange={(event) => void onReschedule(item.id, event.target.value || null)} /></label>
          {update?.error && <small className="calendar-error">{update.error}</small>}
        </article>;
      })}
      {scheduled.length === 0 && <p className="calendar-empty">No upcoming content matches those filters.</p>}
    </div>

    {selected && <aside className="calendar-detail" aria-live="polite">
      <button type="button" className="text-action" onClick={() => setSelectedId(null)}>Close</button>
      <p className="section-label">Selected package</p>
      <h3>{selected.title}</h3>
      <p><strong>Mode:</strong> {selected.mode ?? "Reflection"}</p>
      <p><strong>Selected hook:</strong> {selected.selectedHook}</p>
      <p><strong>Source:</strong> {selected.sourceReference ?? selected.sourceTitle}</p>
      {selected.privacyNotes && <p className="calendar-detail-note"><strong>Privacy:</strong> {selected.privacyNotes}</p>}
      {selected.fullScript && <details><summary>Preview full script</summary><p>{selected.fullScript}</p></details>}
      <button type="button" className="primary-action" onClick={onOpenProduction}>Open full production package</button>
    </aside>}
  </section>;
}
