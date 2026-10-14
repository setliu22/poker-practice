import { useEffect, useState } from "react";
import type { TableView } from "../../../packages/shared/src/table";
import type {
  AssistantAnalysis,
  MoveAdvice,
} from "../../../packages/shared/src/assistant";
import { StudyDialog } from "./StudyDialog";
import { SolverChart } from "./SolverChart";
export function MoveRecommendation({
  table,
  onAdvice,
  onSize,
}: {
  table: TableView;
  onAdvice: (advice: MoveAdvice | null) => void;
  onSize: (amount: number) => void;
}) {
  const [result, setResult] = useState<AssistantAnalysis | null>(null),
    [error, setError] = useState(""),
    [chartOpen, setChartOpen] = useState(false),
    [retry, setRetry] = useState(0),
    [requested, setRequested] = useState(false);
  useEffect(() => {
    if (!requested) return;
    const abort = new AbortController();
    let timer: ReturnType<typeof setTimeout>,
      attempts = 0;
    onAdvice(null);
    setResult(null);
    setError("");
    setChartOpen(false);
    const legal = table.legal!;
    async function get() {
      try {
        const r = await fetch(`/api/tables/${table.id}/assistant`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            revision: table.revision,
            layer: "advice",
            action: legal.canCheck ? "check" : "call",
            continuation: "theo",
          }),
          signal: abort.signal,
        });
        if (r.status === 429 && attempts++ < 3) {
          timer = setTimeout(get, 1500);
          return;
        }
        const data = await r.json();
        if (!r.ok) throw new Error(data.error);
        if (!abort.signal.aborted) {
          setResult(data);
          onAdvice(data.recommendation ?? null);
        }
      } catch (e) {
        if (!abort.signal.aborted) setError((e as Error).message);
      }
    }
    void get();
    return () => {
      abort.abort();
      clearTimeout(timer);
    };
  }, [table.id, table.revision, retry, requested]);
  const advice = result?.recommendation;
  if (!requested)
    return (
      <div className="move-recommendation">
        <button className="secondary" onClick={() => setRequested(true)}>
          Show move hint
        </button>
      </div>
    );
  return (
    <div
      role="region"
      id="live-move-advice"
      className="move-recommendation"
      aria-label="Suggested move"
      aria-busy={!advice && !error}
    >
      {!advice && !error && (
        <p aria-live="polite">
          Comparing your legal choices… You can keep playing.
        </p>
      )}
      {error && (
        <>
          <p>Suggestion unavailable: {error}</p>
          <button className="secondary" onClick={() => setRetry((v) => v + 1)}>
            Retry suggestion
          </button>
        </>
      )}
      {advice && (
        <>
          <p className="move-advice-title">
            <strong>
              {advice.status === "close"
                ? "Tentative suggestion"
                : "Suggested move"}
              : {advice.label}
            </strong>
            <span className="pill">Bot estimate</span>
          </p>
          {advice.status === "close" && (
            <p className="quiet">
              The tested choices are too close to call confidently.
            </p>
          )}
          {advice.action === "raise" && advice.amount !== undefined && (
            <button
              className="secondary recommended-action"
              onClick={() => onSize(advice.amount!)}
            >
              Use suggested size ({advice.amount})
            </button>
          )}
          <details>
            <summary>Why this suggestion?</summary>
            <p>
              Highest estimated return among tested choices:{" "}
              {advice.chips >= 0 ? "+" : ""}
              {advice.chips.toFixed(1)} chips.
            </p>
            <p>{advice.explanation}</p>
            {result.values?.find((v) => v.key === advice.key)?.sources && (
              <ul>
                {result.values
                  .find((v) => v.key === advice.key)!
                  .sources!.map((source, i) => (
                    <li key={i}>
                      {source.kind === "uncontested"
                        ? "Wins without showdown"
                        : source.kind === "showdown"
                          ? "Showdowns"
                          : "Later folds"}
                      : {source.contribution.toFixed(1)} chips contributed to
                      the total, across {source.probability.toFixed(1)}% of
                      sampled hands.
                    </li>
                  ))}
              </ul>
            )}
            <p>
              Uses your cards, visible board and public actions. Opponent
              responses follow the programmed policies over inferred ranges;
              later learner actions follow Theo’s policy. This is not a
              full-game optimal strategy calculation.
            </p>
            <ul>
              {result.values?.map((v) => (
                <li key={v.key}>
                  {v.label}: {v.chips.toFixed(1)} chips{" "}
                  {v.exact
                    ? "(enumerated under model)"
                    : `± ${v.margin.toFixed(1)} sampling uncertainty`}
                </li>
              ))}
            </ul>
            <p>
              {result.samples} joint sampled worlds. Uncertainty does not
              account for whether the bot model describes real opponents.
            </p>
          </details>
        </>
      )}
      {table.street === "preflop" && (
        <button
          className="secondary"
          aria-haspopup="dialog"
          onClick={() => setChartOpen(true)}
        >
          Solver range chart
        </button>
      )}
      {chartOpen && (
        <StudyDialog
          title="Solver range chart"
          onClose={() => setChartOpen(false)}
        >
          <SolverChart table={table} />
        </StudyDialog>
      )}
    </div>
  );
}
