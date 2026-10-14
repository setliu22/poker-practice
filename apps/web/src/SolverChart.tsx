import { useEffect, useRef, useState } from "react";
import type { TableView } from "../../../packages/shared/src/table";
import type { SolverChart as Chart } from "../../../packages/shared/src/solver-chart";
export function SolverChart({ table }: { table: TableView }) {
  const [chart, setChart] = useState<Chart | null>(null),
    [error, setError] = useState("");
  const hole = table.players[0].hole ?? [],
    ranks = "23456789TJQKA";
  const sorted = [...hole].sort(
    (a, b) => ranks.indexOf(b[0]) - ranks.indexOf(a[0]),
  );
  const hand =
    sorted.length === 2
      ? sorted[0][0] +
        sorted[1][0] +
        (sorted[0][0] === sorted[1][0]
          ? ""
          : sorted[0][1] === sorted[1][1]
            ? "s"
            : "o")
      : "";
  const [selected, setSelected] = useState(hand),
    [retry, setRetry] = useState(0);
  const buttons = useRef<(HTMLButtonElement | null)[]>([]);
  useEffect(() => {
    const abort = new AbortController();
    let timer: ReturnType<typeof setTimeout>;
    let firstRequest = true;
    setChart(null);
    setError("");
    async function poll() {
      try {
        const r = await fetch(`/api/tables/${table.id}/solver-chart`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            revision: table.revision,
            ...(firstRequest && retry > 0 ? { retry: true } : {}),
          }),
          signal: abort.signal,
        });
        const data = await r.json();
        firstRequest = false;
        if (!r.ok) throw new Error(data.error);
        if (!abort.signal.aborted) {
          setChart(data);
          if (["queued", "building", "solving"].includes(data.status))
            timer = setTimeout(poll, 1500);
        }
      } catch (e) {
        if (!abort.signal.aborted) setError((e as Error).message);
      }
    }
    void poll();
    return () => {
      abort.abort();
      clearTimeout(timer);
    };
  }, [table.id, table.revision, retry]);
  const cell = chart?.cells?.find((c) => c.hand === selected);
  const own = chart?.cells?.find((c) => c.hand === hand);
  const ownIndex = own
    ? own.frequencies.reduce(
        (best, v, i) => (v > own.frequencies[best] ? i : best),
        0,
      )
    : 0;
  return (
    <section className="solver-chart-panel" aria-label="GTOpen range chart">
      <h3>Chart for this betting sequence</h3>
      <p>
        GTOpen · Local solve · Actual table size, position and public actions
      </p>
      {!chart && !error && <p role="status">Connecting to the local solver…</p>}
      {error && <p role="alert">{error}</p>}
      {chart && (
        <p aria-live="polite">
          {chart.message}
          {chart.status !== "ready" && chart.iteration !== undefined
            ? ` Iteration ${chart.iteration}.`
            : ""}
        </p>
      )}
      {chart?.status === "unavailable" && (
        <p>
          The suggested move against the practice bots remains separate. A
          missing chart does not mean fold.
        </p>
      )}
      {(error || chart?.status === "unavailable") && (
        <button className="secondary" onClick={() => setRetry((v) => v + 1)}>
          Try again
        </button>
      )}
      {chart?.status === "ready" && (
        <>
          {own && (
            <div className="move-advice">
              <strong>
                {hand}:{" "}
                {chart.converged
                  ? "Solver’s most-used action"
                  : "Preliminary most-used action"}{" "}
                — {chart.actions![ownIndex].label} (
                {own.frequencies[ownIndex].toFixed(1)}%)
              </strong>
              <p>
                {own.reach <= 1e-8
                  ? "This hand has almost no reach through this modeled sequence; its strategy is weak evidence."
                  : "Percentages describe mixed strategy, not your chance of winning. The solver opponents differ from the practice bots."}
              </p>
            </div>
          )}
          <div className="solver-legend">
            {chart.actions?.map((a, i) => (
              <span key={i} className={`solver-kind-${a.kind}`}>
                {a.label}
              </span>
            ))}
          </div>
          <div className="solver-grid-scroll">
            <div
              className="solver-grid"
              role="grid"
              aria-label="GTOpen starting-hand strategy"
            >
              {Array.from({ length: 13 }, (_, r) => (
                <div role="row" key={r}>
                  {chart.cells!.slice(r * 13, r * 13 + 13).map((c, offset) => {
                    const i = r * 13 + offset,
                      best = c.frequencies.reduce(
                        (k, v, j) => (v > c.frequencies[k] ? j : k),
                        0,
                      ),
                      a = chart.actions![best];
                    return (
                      <div role="gridcell" key={c.hand}>
                        <button
                          ref={(el) => {
                            buttons.current[i] = el;
                          }}
                          className={`solver-cell solver-kind-${a.kind}${c.hand === hand ? " solver-own" : ""}`}
                          aria-label={`${c.hand}: ${a.label} ${c.frequencies[best].toFixed(1)}%${c.hand === hand ? ", your hand" : ""}`}
                          aria-current={c.hand === hand ? "true" : undefined}
                          tabIndex={c.hand === selected ? 0 : -1}
                          onFocus={() => setSelected(c.hand)}
                          onClick={() => setSelected(c.hand)}
                          onKeyDown={(e) => {
                            let next = i;
                            if (e.key === "ArrowRight")
                              next = r * 13 + ((offset + 1) % 13);
                            else if (e.key === "ArrowLeft")
                              next = r * 13 + ((offset + 12) % 13);
                            else if (e.key === "ArrowDown")
                              next = ((r + 1) % 13) * 13 + offset;
                            else if (e.key === "ArrowUp")
                              next = ((r + 12) % 13) * 13 + offset;
                            else if (e.key === "Home")
                              next = e.ctrlKey ? 0 : r * 13;
                            else if (e.key === "End")
                              next = e.ctrlKey ? 168 : r * 13 + 12;
                            else return;
                            e.preventDefault();
                            setSelected(chart.cells![next].hand);
                            buttons.current[next]?.focus();
                          }}
                        >
                          {c.hand}
                        </button>
                      </div>
                    );
                  })}
                </div>
              ))}
            </div>
          </div>
          {cell && (
            <div className="solver-cell-detail" aria-live="polite">
              <strong>
                {selected}
                {selected === hand ? " · Your hand" : ""}
              </strong>
              <ul>
                {chart.actions!.map((a, i) => (
                  <li key={i}>
                    {a.label}: {cell.frequencies[i].toFixed(1)}%
                  </li>
                ))}
              </ul>
            </div>
          )}
          <details>
            <summary>Solver accuracy and assumptions</summary>
            <p>
              Published iteration {chart.iteration}; model best-response gap{" "}
              {chart.gap?.toFixed(4)} BB, target {chart.targetGap}.{" "}
              {chart.converged
                ? "Target reached within this model."
                : "Target not reached; this chart is preliminary."}
            </p>
            <ul>
              {chart.limitations?.map((s, i) => (
                <li key={i}>{s}</li>
              ))}
            </ul>
            <p>
              Engine revision {chart.engineRevision.slice(0, 12)}. Source:{" "}
              <a
                href="https://github.com/MatthewPDingle/GTOpen"
                target="_blank"
                rel="noreferrer"
              >
                GTOpen
              </a>
              .
            </p>
          </details>
        </>
      )}
    </section>
  );
}
