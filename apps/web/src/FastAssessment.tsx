import { useEffect, useRef, useState } from "react";
import type { TableView } from "../../../packages/shared/src/table";
import type { FastAssessmentResult } from "../../../packages/shared/src/fast-assessment";
import { practiceSessionHeaders, recordAssessmentShown } from "./usage-client";

type Result = FastAssessmentResult & {
  revision: number;
  handNumber: number;
  usageReceipt?: string;
};
export function FastAssessment({
  table,
  raiseTo,
  busy,
}: {
  table: TableView;
  raiseTo: string;
  busy: boolean;
}) {
  const [action, setAction] = useState("fold");
  const [result, setResult] = useState<Result | null>(null);
  const [loading, setLoading] = useState(false);
  const [open, setOpen] = useState(false);
  const [error, setError] = useState("");
  const controller = useRef<AbortController | null>(null);
  const sequence = useRef(0);
  useEffect(() => {
    ++sequence.current;
    controller.current?.abort();
    controller.current = null;
    setResult(null);
    setError("");
    setLoading(false);
    return () => {
      ++sequence.current;
      controller.current?.abort();
    };
  }, [table.id, table.revision, action, raiseTo, busy]);
  useEffect(() => {
    if (result && open && !busy) recordAssessmentShown(result.usageReceipt);
  }, [result, open, busy]);
  async function assess() {
    if (busy || controller.current) return;
    const abort = new AbortController();
    controller.current = abort;
    const request = ++sequence.current;
    setLoading(true);
    setError("");
    setResult(null);
    try {
      const response = await fetch(
        `/api/v1/tables/${table.id}/fast-assessment`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            ...practiceSessionHeaders(),
          },
          body: JSON.stringify({
            revision: table.revision,
            action,
            ...(action === "raise" ? { amount: Number(raiseTo) } : {}),
          }),
          signal: abort.signal,
        },
      );
      const data = await response.json();
      if (!response.ok)
        throw new Error(data.error ?? "Quick assessment is unavailable.");
      if (abort.signal.aborted || request !== sequence.current) return;
      if (
        data.revision !== table.revision ||
        data.handNumber !== table.handNumber
      )
        throw new Error("The hand changed. Assess your action again.");
      setResult(data as Result);
    } catch (err) {
      if (!abort.signal.aborted && request === sequence.current)
        setError((err as Error).message);
    } finally {
      if (request === sequence.current) {
        setLoading(false);
        controller.current = null;
      }
    }
  }
  const raiseValid =
    action !== "raise" ||
    (Number.isInteger(Number(raiseTo)) &&
      Number(raiseTo) >= table.legal!.minRaiseTo &&
      Number(raiseTo) <= table.legal!.maxRaiseTo);
  return (
    <details
      className="move-recommendation"
      onToggle={(event) => setOpen(event.currentTarget.open)}
    >
      <summary>Quick assessment</summary>
      <p className="quiet">
        Heads-up opening decisions. Estimates how the detailed bot-model
        comparison would assess your chosen action. Assessing does not play it.
      </p>
      <label htmlFor="quick-action">Action to assess</label>{" "}
      <select
        id="quick-action"
        value={action}
        disabled={busy || loading}
        onChange={(event) => setAction(event.target.value)}
      >
        <option value="fold">Fold</option>
        <option value={table.legal?.canCheck ? "check" : "call"}>
          {table.legal?.canCheck ? "Check" : "Call"}
        </option>
        {table.legal?.canRaise && (
          <option value="raise">
            Raise to {raiseTo || "the selected amount"} chips
          </option>
        )}
      </select>{" "}
      <button
        type="button"
        className="secondary"
        disabled={busy || loading || !raiseValid}
        onClick={() => void assess()}
      >
        {loading
          ? "Assessing…"
          : error
            ? "Retry quick assessment"
            : "Assess chosen action"}
      </button>
      {action === "raise" && (
        <p className="quiet">Uses the amount in the Raise to field below.</p>
      )}
      {loading && (
        <p role="status">Checking the local model… You can keep playing.</p>
      )}
      {error && <p role="alert">{error}</p>}
      {result && (
        <div role="status" aria-label="Quick assessment result">
          <p>
            <strong>
              {result.status === "unsupported"
                ? "Outside this model’s scope"
                : result.status === "uncertain"
                  ? "Model prediction is uncertain"
                  : result.label === "model-gap"
                    ? "Model predicts a clearer alternative may exist"
                    : "Model predicts no clear gap"}
            </strong>
          </p>
          {result.reason && <p>{result.reason}</p>}
          <p className="quiet">
            {result.status === "ready" && result.label === "no-clear-gap"
              ? "No clear gap includes inconclusive comparisons; it does not establish good play. "
              : ""}
            This approximates an authored bot model, not optimal play or poker
            skill.
          </p>
          {result.status !== "ready" && (
            <p>Use Show move hint above for the detailed comparison.</p>
          )}
          <details>
            <summary>About this model prediction</summary>
            <p>{result.support}</p>
            {result.probability !== null && (
              <p>
                Predicted chance the detailed teacher finds a statistically
                supported better alternative:{" "}
                {Math.round(result.probability * 100)}%. This is model
                confidence, not your chance of winning.
              </p>
            )}
            <ul>
              {result.limitations.map((limitation) => (
                <li key={limitation}>{limitation}</li>
              ))}
            </ul>
            <p className="quiet">
              Model {result.modelId} · Feature version {result.featureVersion}
            </p>
          </details>
        </div>
      )}
    </details>
  );
}
