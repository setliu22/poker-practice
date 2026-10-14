import { useEffect, useId, useRef, useState, type KeyboardEvent } from "react";
import type {
  OpeningChart,
  PreflopGuide,
} from "../../../packages/shared/src/preflop";

function OpeningMatrix({
  chart,
  hand,
}: {
  chart: OpeningChart;
  hand?: string;
}) {
  const id = useId();
  const ownIndex = chart.cells.findIndex((cell) => cell.hand === hand);
  const [selected, setSelected] = useState(ownIndex >= 0 ? ownIndex : 0);
  const buttons = useRef<(HTMLButtonElement | null)[]>([]);
  const current = chart.cells[selected] ?? chart.cells[0];
  function navigate(event: KeyboardEvent<HTMLButtonElement>, index: number) {
    const row = Math.floor(index / 13),
      column = index % 13;
    let next: number;
    switch (event.key) {
      case "ArrowRight":
        next = row * 13 + ((column + 1) % 13);
        break;
      case "ArrowLeft":
        next = row * 13 + ((column + 12) % 13);
        break;
      case "ArrowDown":
        next = ((row + 1) % 13) * 13 + column;
        break;
      case "ArrowUp":
        next = ((row + 12) % 13) * 13 + column;
        break;
      case "Home":
        next = event.ctrlKey ? 0 : row * 13;
        break;
      case "End":
        next = event.ctrlKey ? 168 : row * 13 + 12;
        break;
      default:
        return;
    }
    event.preventDefault();
    setSelected(next);
    buttons.current[next]?.focus();
  }
  if (!current) return null;
  return (
    <div className="opening-matrix-block">
      <p id={`${id}-help`} className="quiet opening-matrix-help">
        Pairs on the diagonal. s = suited; o = offsuit. Select a hand or use the
        arrow keys.
      </p>
      <div className="opening-legend" aria-label="Opening chart legend">
        <span>
          <i className="opening-raise-key" aria-hidden="true">
            R
          </i>{" "}
          Raise
        </span>
        <span>
          <i className="opening-fold-key" aria-hidden="true">
            F
          </i>{" "}
          Fold
        </span>
        {hand && (
          <span>
            <i className="opening-hero-key" aria-hidden="true">
              •
            </i>{" "}
            Your hand: {hand}
          </span>
        )}
      </div>
      <div className="opening-matrix-scroll">
        <div
          role="grid"
          className="opening-matrix"
          aria-label="Illustrative opening chart"
          aria-describedby={`${id}-help`}
          aria-rowcount={13}
          aria-colcount={13}
        >
          {Array.from({ length: 13 }, (_, row) => (
            <div className="opening-matrix-row" role="row" key={row}>
              {chart.cells
                .slice(row * 13, row * 13 + 13)
                .map((cell, column) => {
                  const index = row * 13 + column;
                  const own = cell.hand === hand;
                  return (
                    <div
                      role="gridcell"
                      key={cell.hand}
                      aria-selected={selected === index}
                    >
                      <button
                        type="button"
                        ref={(element) => {
                          buttons.current[index] = element;
                        }}
                        className={`opening-cell opening-cell-${cell.action}${own ? " opening-cell-hero" : ""}`}
                        tabIndex={selected === index ? 0 : -1}
                        aria-label={`${cell.hand}: ${cell.action === "raise" ? "raise" : "fold"}${own ? ", your hand" : ""}`}
                        aria-current={own ? "true" : undefined}
                        aria-controls={`${id}-detail`}
                        onClick={() => setSelected(index)}
                        onKeyDown={(event) => navigate(event, index)}
                      >
                        <span>{cell.hand}</span>
                        <small aria-hidden="true">
                          {cell.action === "raise" ? "R" : "F"}
                        </small>
                      </button>
                    </div>
                  );
                })}
            </div>
          ))}
        </div>
      </div>
      <p
        className="opening-cell-detail"
        id={`${id}-detail`}
        aria-live="polite"
        aria-atomic="true"
      >
        <strong>{current.hand}</strong> ·{" "}
        {current.action === "raise"
          ? `Raise to ${chart.raiseToBb} big blinds`
          : "Fold"}{" "}
        in this illustrative guide{current.hand === hand ? " · Your hand" : ""}.
      </p>
    </div>
  );
}

function ChartSource({ chart }: { chart: OpeningChart }) {
  return (
    <details className="model-details opening-source">
      <summary>Source, assumptions, and limitations</summary>
      <p>
        Starting-hand baseline:{" "}
        <a href={chart.source.url} target="_blank" rel="noreferrer">
          {chart.source.name}
        </a>{" "}
        · {chart.source.license} · revision{" "}
        <abbr title={chart.source.revision}>
          {chart.source.revision.slice(0, 12)}
        </abbr>
        .
      </p>
      <h4>When this guide applies</h4>
      <ul>
        {chart.assumptions.map((text) => (
          <li key={text}>{text}</li>
        ))}
      </ul>
      <h4>What it cannot tell you</h4>
      <ul>
        {chart.limitations.map((text) => (
          <li key={text}>{text}</li>
        ))}
      </ul>
    </details>
  );
}

export function PreflopGuidePanel({
  guide,
  expandChart = false,
}: {
  guide: PreflopGuide;
  expandChart?: boolean;
}) {
  const id = useId();
  if (guide.status === "unavailable" || !guide.chart) {
    return (
      <section
        className="preflop-guide preflop-guide-unavailable"
        aria-labelledby={`${id}-title`}
      >
        <h3 id={`${id}-title`}>This situation needs different guidance</h3>
        <p>{guide.reason}</p>
        <p>
          This is a gap in the chart library, not a rule telling you to fold. A
          caller stays in the hand; earlier folds do not add a caller. Use the
          decision assistant to examine the call price, possible opponent hands
          and responses.
        </p>
      </section>
    );
  }
  const chart = guide.chart;
  return (
    <section className="preflop-guide" aria-labelledby={`${id}-title`}>
      <h3 id={`${id}-title`}>Illustrative opening guide</h3>
      <p className="quiet opening-context">
        {chart.players} players · {guide.position} · Unopened pot
      </p>
      <div className="opening-action">
        <span>
          Your hand <strong>{guide.hand}</strong>
        </span>
        <span>
          Guide action{" "}
          <strong>
            {guide.suggestedAction === "raise"
              ? `Raise to ${guide.raiseTo} chips`
              : "Fold"}
          </strong>
        </span>
      </div>
      <p className="quiet">{guide.note}</p>
      {guide.comparison && (
        <div className="opening-comparison">
          <strong>Your action: {guide.comparison.chosenAction}</strong>
          <p>{guide.comparison.explanation}</p>
        </div>
      )}
      <details className="opening-chart-details" open={expandChart}>
        <summary>View starting-hand chart · {guide.hand} highlighted</summary>
        <OpeningMatrix chart={chart} hand={guide.hand} />
        <p className="quiet opening-frequency">
          This guide opens {chart.openPercent.toFixed(1)}% of the 1,326
          starting-hand combinations. That is how often the guide raises, not
          your chance of winning.
        </p>
      </details>
      <ChartSource chart={chart} />
    </section>
  );
}

export function PreflopGuideDialog({
  guide,
  error,
  loading,
  onClose,
  onRetry,
  onStudy,
  onSolver,
}: {
  guide: PreflopGuide | null;
  error: string;
  loading: boolean;
  onClose: () => void;
  onRetry: () => void;
  onStudy?: () => void;
  onSolver?: () => void;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const dialog = ref.current!;
    dialog.showModal();
    return () => dialog.close();
  }, []);
  return (
    <dialog
      ref={ref}
      className="bot-profile-dialog preflop-guide-dialog"
      aria-labelledby="preflop-guide-title"
      onClose={onClose}
      onClick={(event) => {
        const dialog = ref.current;
        if (event.target !== dialog || !dialog) return;
        const bounds = dialog.getBoundingClientRect();
        if (
          event.clientX < bounds.left ||
          event.clientX > bounds.right ||
          event.clientY < bounds.top ||
          event.clientY > bounds.bottom
        )
          dialog.close();
      }}
    >
      <div className="profile-heading">
        <h2 id="preflop-guide-title">Preflop guide</h2>
        <button
          type="button"
          className="secondary"
          autoFocus
          onClick={() => ref.current?.close()}
        >
          Close
        </button>
      </div>
      <div aria-live="polite" aria-busy={loading}>
        {loading && <p role="status">Loading the opening guide…</p>}
        {error && (
          <div>
            <p role="alert" className="error">
              {error}
            </p>
            <button
              type="button"
              className="primary"
              disabled={loading}
              onClick={onRetry}
            >
              Try again
            </button>
          </div>
        )}
        {guide && <PreflopGuidePanel guide={guide} expandChart />}
        {guide?.status === "unavailable" && onSolver && (
          <button className="primary" onClick={onSolver}>
            Solver chart for this situation
          </button>
        )}
        {guide?.status === "unavailable" && onStudy && (
          <button className="primary" onClick={onStudy}>
            Think through this decision
          </button>
        )}
      </div>
    </dialog>
  );
}

export function OpeningChartLibrary() {
  const id = useId();
  const [charts, setCharts] = useState<OpeningChart[]>([]);
  const [selected, setSelected] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [retry, setRetry] = useState(0);
  useEffect(() => {
    const controller = new AbortController();
    setLoading(true);
    setError("");
    fetch("/api/preflop-charts", { signal: controller.signal })
      .then(async (response) => {
        const result = await response.json();
        if (!response.ok)
          throw new Error(result.error ?? "Could not load the chart library.");
        if (!controller.signal.aborted) {
          setCharts(result as OpeningChart[]);
          setSelected((current) =>
            (result as OpeningChart[]).some((chart) => chart.id === current)
              ? current
              : (result[0]?.id ?? ""),
          );
        }
      })
      .catch((err: Error) => {
        if (!controller.signal.aborted) setError(err.message);
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false);
      });
    return () => controller.abort();
  }, [retry]);
  const chart = charts.find((item) => item.id === selected);
  const counts = [...new Set(charts.map((item) => item.players))].sort(
    (a, b) => a - b,
  );
  return (
    <section className="panel opening-library" aria-labelledby={`${id}-title`}>
      <h2 id={`${id}-title`}>Opening chart library</h2>
      <p>
        Browse local, illustrative starting-hand guides for unopened pots. They
        do not cover calls, re-raises, or decisions after the flop.
      </p>
      {loading && <p role="status">Loading charts…</p>}
      {error && (
        <div>
          <p className="error" role="alert">
            {error}
          </p>
          <button
            className="secondary"
            onClick={() => setRetry((value) => value + 1)}
          >
            Try again
          </button>
        </div>
      )}
      {chart && (
        <>
          <div className="opening-library-controls">
            <div>
              <label htmlFor={`${id}-players`}>Table size</label>
              <select
                id={`${id}-players`}
                value={chart.players}
                onChange={(event) =>
                  setSelected(
                    charts.find(
                      (item) => item.players === Number(event.target.value),
                    )!.id,
                  )
                }
              >
                {counts.map((count) => (
                  <option key={count} value={count}>
                    {count} players
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label htmlFor={`${id}-position`}>Position</label>
              <select
                id={`${id}-position`}
                value={chart.id}
                onChange={(event) => setSelected(event.target.value)}
              >
                {charts
                  .filter((item) => item.players === chart.players)
                  .map((item) => (
                    <option key={item.id} value={item.id}>
                      {item.position}
                    </option>
                  ))}
              </select>
            </div>
          </div>
          <p className="quiet">
            {chart.title} · Open to {chart.raiseToBb} big blinds. Opens{" "}
            {chart.openPercent.toFixed(1)}% of starting-hand combinations, not a
            winning probability.
          </p>
          <OpeningMatrix key={chart.id} chart={chart} />
          <ChartSource chart={chart} />
        </>
      )}
    </section>
  );
}
