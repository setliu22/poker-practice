import { useEffect, useRef, useState } from "react";
import type { TableView } from "../../../packages/shared/src/table";
import type {
  TableEventHistory,
  TableEventView,
} from "../../../packages/shared/src/table-events";
import type { DecisionDataset } from "../../../packages/shared/src/decision-dataset";
import { Cards } from "./Cards";

function actionText(event: TableEventView) {
  if (event.action === "fold") return "Folds";
  if (event.action === "check") return "Checks";
  if (event.action === "call") return "Calls";
  return `Raises to ${event.amount} chips`;
}

async function read<T>(url: string, signal: AbortSignal): Promise<T> {
  const response = await fetch(url, { signal });
  const data = await response.json();
  if (!response.ok) throw new Error(data.error ?? "Could not load history.");
  return data;
}

export function DecisionHistory({
  table,
  branchIntents,
  onBranch,
  onReload,
}: {
  table: TableView;
  // Owned by the parent so closing the dialog preserves uncertain retries.
  branchIntents: Map<string, string>;
  onBranch: (branch: TableView) => void;
  onReload: () => void;
}) {
  const [history, setHistory] = useState<TableEventHistory | null>(null);
  const [dataset, setDataset] = useState<DecisionDataset | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [reload, setReload] = useState(0);
  const [selected, setSelected] = useState<TableEventView | null>(null);
  const [snapshot, setSnapshot] = useState<TableView | null>(null);
  const [decisionLoading, setDecisionLoading] = useState(false);
  const [decisionError, setDecisionError] = useState("");
  const [decisionRetry, setDecisionRetry] = useState(0);
  const [branching, setBranching] = useState(false);
  const [branchError, setBranchError] = useState("");
  const [conflict, setConflict] = useState(false);
  const branchController = useRef<AbortController | null>(null);
  const branchPending = useRef(false);
  const decisionHeading = useRef<HTMLHeadingElement>(null);
  const base = `/api/v1/tables/${table.id}`;

  useEffect(() => {
    const controller = new AbortController();
    setHistory(null);
    setDataset(null);
    setLoading(true);
    setError("");
    setSelected(null);
    setSnapshot(null);
    setBranchError("");
    setConflict(false);
    void read<TableEventHistory>(`${base}/events`, controller.signal)
      .then((result) => {
        if (!controller.signal.aborted) setHistory(result);
      })
      .catch((err: Error) => {
        if (!controller.signal.aborted) setError(err.message);
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false);
      });
    // Export and suggestions are optional; they do not prevent history use.
    void read<DecisionDataset>(`${base}/decisions`, controller.signal)
      .then((result) => {
        if (!controller.signal.aborted) setDataset(result);
      })
      .catch(() => {});
    return () => controller.abort();
  }, [base, table.revision, reload]);

  useEffect(() => {
    const controller = new AbortController();
    setSnapshot(null);
    setDecisionError("");
    setBranchError("");
    if (selected) {
      setDecisionLoading(true);
      void read<TableView>(
        `${base}/events/${selected.sequence}`,
        controller.signal,
      )
        .then((result) => {
          if (!controller.signal.aborted) {
            setSnapshot(result);
            requestAnimationFrame(() => {
              if (!controller.signal.aborted) decisionHeading.current?.focus();
            });
          }
        })
        .catch((err: Error) => {
          if (!controller.signal.aborted) setDecisionError(err.message);
        })
        .finally(() => {
          if (!controller.signal.aborted) setDecisionLoading(false);
        });
    } else setDecisionLoading(false);
    return () => controller.abort();
  }, [base, selected, decisionRetry, table.revision]);

  useEffect(
    () => () => {
      branchController.current?.abort();
    },
    [base, table.revision],
  );

  const stale = history !== null && history.revision !== table.revision;
  async function branch() {
    if (!selected || !snapshot || stale || conflict || branchPending.current)
      return;
    const key = `${table.id}/${table.revision}/${selected.sequence}`;
    const actionId = branchIntents.get(key) ?? crypto.randomUUID();
    branchIntents.set(key, actionId);
    const controller = new AbortController();
    branchController.current = controller;
    branchPending.current = true;
    setBranching(true);
    setBranchError("");
    try {
      const response = await fetch(`${base}/branch`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          revision: table.revision,
          actionId,
          sequence: selected.sequence,
        }),
        signal: controller.signal,
      });
      const result = await response.json();
      if (controller.signal.aborted) return;
      if (!response.ok) {
        // A network/5xx failure might follow a committed branch: retain its key.
        if (response.status >= 400 && response.status < 500)
          branchIntents.delete(key);
        if (response.status === 409) setConflict(true);
        throw new Error(
          result.error ?? "Could not start this practice branch.",
        );
      }
      branchIntents.delete(key);
      onBranch(result as TableView);
    } catch (err) {
      if (!controller.signal.aborted) setBranchError((err as Error).message);
    } finally {
      if (!controller.signal.aborted) setBranching(false);
      branchPending.current = false;
    }
  }

  const groups: { start: TableEventView; actions: TableEventView[] }[] = [];
  for (const event of history?.events ?? []) {
    if (event.kind === "checkpoint") groups.push({ start: event, actions: [] });
    else if (event.kind === "action") groups.at(-1)?.actions.push(event);
  }
  function exportDataset() {
    if (!dataset) return;
    const url = URL.createObjectURL(
      new Blob([JSON.stringify(dataset, null, 2)], {
        type: "application/json",
      }),
    );
    const link = document.createElement("a");
    link.href = url;
    link.download = `poker-decisions-${table.id}.json`;
    link.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }

  return (
    <section aria-label="Recorded decisions" className="decision-history">
      <p className="quiet">
        Choose one of your recorded actions to revisit the decision, then try a
        different action in a separate practice game.
      </p>
      {loading && <p role="status">Loading decision history…</p>}
      {error && (
        <div>
          <p role="alert">{error}</p>
          <button className="secondary" onClick={() => setReload((n) => n + 1)}>
            Retry history
          </button>
        </div>
      )}
      {(stale || conflict) && (
        <div>
          <p role="alert">This game has changed. Reload it before branching.</p>
          <button className="secondary" onClick={onReload}>
            Reload current game
          </button>
        </div>
      )}
      {dataset && dataset.revision === table.revision && (
        <details className="review-item">
          <summary>Practice suggestions and decision data</summary>
          <p className="quiet">
            Bot-model comparison, not a trained learner model or a measure of
            poker skill. Replays and branches are marked as practice data.
          </p>
          {dataset.practiceCandidates.length > 0 ? (
            <button
              className="secondary"
              disabled={branching || !history}
              onClick={() => {
                const candidate = history?.events.find(
                  (event) =>
                    event.sequence === dataset.practiceCandidates[0] &&
                    event.heroDecision,
                );
                if (candidate) setSelected(candidate);
              }}
            >
              Practice a model-flagged decision
            </button>
          ) : (
            <p className="quiet">No supported model-flagged decisions yet.</p>
          )}
          <p>
            <button className="secondary" onClick={exportDataset}>
              Export decision data (JSON)
            </button>
          </p>
        </details>
      )}
      {selected && (
        <section className="review-item" aria-label="Historical decision">
          <h3 ref={decisionHeading} tabIndex={-1}>
            Before your action · Hand {selected.handNumber} · {selected.street}
          </h3>
          {decisionLoading && <p role="status">Loading this decision…</p>}
          {decisionError && (
            <>
              <p role="alert">{decisionError}</p>
              <button
                className="secondary"
                onClick={() => setDecisionRetry((n) => n + 1)}
              >
                Retry decision
              </button>
            </>
          )}
          {snapshot && (
            <>
              <p>Your cards</p>
              <Cards cards={snapshot.players[0].hole ?? []} small />
              <p>Board at this decision</p>
              {snapshot.board.length ? (
                <Cards cards={snapshot.board} small />
              ) : (
                <p className="quiet">No community cards yet</p>
              )}
              <p>
                Pot {snapshot.pot} chips ·{" "}
                {snapshot.legal?.toCall
                  ? `${snapshot.legal.toCall} chips to call`
                  : "Check for free"}
              </p>
              <p>Recorded action: {actionText(selected)}</p>
              <p className="quiet">
                Opponent cards stay hidden. Later cards and results are excluded
                from this view; you may still remember seeing them.
              </p>
              {branchError && <p role="alert">{branchError}</p>}
              <button
                className="primary"
                disabled={branching || stale || conflict}
                onClick={() => void branch()}
              >
                {branching ? "Starting practice…" : "Try another action"}
              </button>
              {branching && (
                <p role="status">Creating a separate practice game…</p>
              )}
            </>
          )}
        </section>
      )}
      {groups.map(({ start, actions }, index) => (
        <details
          key={start.sequence}
          open={
            index === groups.length - 1 ||
            actions.some((event) => event.sequence === selected?.sequence)
          }
          className="review-item"
        >
          <summary>
            Hand {start.handNumber}
            {start.reason === "reset" ? " · Restarted attempt" : ""}
            {start.reason === "branch" ? " · Practice branch" : ""} ·{" "}
            {actions.length} actions
          </summary>
          {start.partial && (
            <p className="quiet">
              Partial legacy history: this saved game predates decision
              recording. Earlier actions cannot be reconstructed.
            </p>
          )}
          {actions.length ? (
            <ol className="full-hand-history">
              {actions.map((event) => (
                <li key={event.sequence}>
                  <span className="quiet">
                    {event.street} · {event.name}
                  </span>
                  {event.heroDecision ? (
                    <button
                      className="secondary"
                      disabled={branching}
                      aria-pressed={selected?.sequence === event.sequence}
                      aria-label={`Inspect your ${event.action} decision, hand ${event.handNumber}, event ${event.sequence}`}
                      onClick={() => setSelected(event)}
                    >
                      {actionText(event)} · View decision
                    </button>
                  ) : (
                    <span>{actionText(event)}</span>
                  )}
                </li>
              ))}
            </ol>
          ) : (
            <p className="quiet">No recorded actions in this attempt yet.</p>
          )}
        </details>
      ))}
      <details className="review-item">
        <summary>Current hand text history</summary>
        <ol className="full-hand-history">
          {table.history.map((entry, index) => (
            <li key={index}>
              <span className="quiet">
                {entry.street} ·{" "}
                {entry.seat === null ? "Table" : table.players[entry.seat].name}
              </span>
              <span>{entry.text}</span>
            </li>
          ))}
        </ol>
      </details>
    </section>
  );
}
