import { useEffect, useRef, useState } from "react";
import { Cards } from "./Cards";
import type {
  ReadQuestion,
  ReadFeedback,
  ReadProgress,
} from "../../../packages/shared/src/read-lesson";
async function api<T>(path: string, body?: unknown): Promise<T> {
  const r = await fetch(
    `/api/learning/read${path}`,
    body === undefined
      ? undefined
      : {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
        },
  );
  const data = await r.json();
  if (!r.ok) throw new Error(data.error ?? "Unable to load practice.");
  return data;
}
export function ReadLesson({ onBack }: { onBack: () => void }) {
  const [q, setQ] = useState<ReadQuestion | null>(null),
    [feedback, setFeedback] = useState<ReadFeedback | null>(null),
    [price, setPrice] = useState(""),
    [estimate, setEstimate] = useState(""),
    [action, setAction] = useState(""),
    [counter, setCounter] = useState(""),
    [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  const lock = useRef(false),
    heading = useRef<HTMLHeadingElement>(null);
  useEffect(() => {
    heading.current?.focus();
  }, [q?.id, feedback]);
  async function start(repeatId?: string) {
    if (lock.current) return;
    lock.current = true;
    setBusy(true);
    setError("");
    try {
      const data = await api<ReadQuestion>("/", repeatId ? { repeatId } : {});
      setQ(data);
      setFeedback(null);
      setPrice("");
      setEstimate("");
      setAction("");
      setCounter("");
    } catch (e) {
      setError((e as Error).message);
    } finally {
      lock.current = false;
      setBusy(false);
    }
  }
  async function submit() {
    if (lock.current || !q) return;
    lock.current = true;
    setBusy(true);
    setError("");
    try {
      setFeedback(
        await api<ReadFeedback>(`/${q.id}/answer`, {
          step: "decision",
          ...(estimate.trim() ? { equityPercent: Number(estimate) } : {}),
          pricePercent: Number(price),
          action,
          counterAction: counter,
          reason: "price",
        }),
      );
    } catch (e) {
      setError((e as Error).message);
    } finally {
      lock.current = false;
      setBusy(false);
    }
  }
  const validNumber = (s: string) =>
    s.trim() !== "" &&
    Number.isFinite(Number(s)) &&
    Number(s) >= 0 &&
    Number(s) <= 100;
  const equity =
    q?.guide?.reduce((sum, row) => sum + row.weight * row.equity, 0) ?? 0;
  return (
    <div className="learning-layout">
      <button className="secondary" onClick={onBack}>
        Back to lessons
      </button>
      <div className="page-heading">
        <div>
          <span className="eyebrow">Learn · All-in decision practice</span>
          <h1 ref={heading} tabIndex={-1}>
            {q?.title ?? "Can your hand justify the call?"}
          </h1>
        </div>
      </div>
      <details className="panel">
        <summary>How to decide</summary>
        <p>
          Calling an all-in buys every remaining card. Compare your expected
          share of the final pot (including half of ties) with the price: chips
          to call ÷ final pot. Folding costs zero additional chips.
        </p>
        <p>
          Start with the supplied opponent range. Improving your hand is useful
          only when the final hand beats that range. Use the matchup guide when
          counting outs is misleading. These exercises supply narrow ranges so
          the assumptions can be checked; they do not predict real opponents.
        </p>
      </details>
      {error && <p role="alert">{error}</p>}
      {!q ? (
        <section className="panel">
          <p>
            Practice dominated draws, overcards, straight draws and redraws.
            Each situation asks for a decision, then changes the call price.
            Each new attempt generates fresh legal cards and supplied ranges.
            Recent mistakes make the corresponding skill more likely to appear.
          </p>
          <button
            className="primary"
            disabled={busy}
            onClick={() => void start()}
          >
            {busy ? "Loading…" : "Start decision practice"}
          </button>
        </section>
      ) : (
        <section className="panel" aria-busy={busy}>
          <div className="learning-cards">
            <div>
              <h3>Your cards</h3>
              <Cards cards={q.hole} />
            </div>
            <div>
              <h3>Flop</h3>
              <Cards cards={q.board} />
            </div>
          </div>
          <p>
            Pot before the shove: <strong>{q.potBefore}</strong>. Opponent
            shoves <strong>{q.bet}</strong>. You can call {q.bet} or fold.
            Calling leaves no further bets.
          </p>
          <h3>Supplied range after the shove</h3>
          <div className="learning-opponents">
            {q.opponents.map((o) => (
              <div className="learning-opponent" key={o.cards.join("")}>
                <Cards cards={o.cards} small />
                <span>{(o.prior * 100).toFixed(0)}% of the range</span>
              </div>
            ))}
          </div>
          <p>{q.coaching}</p>
          {q.selectionReason && <p className="quiet">{q.selectionReason}</p>}
          <details>
            <summary>Help estimate: exact matchup shares</summary>
            <p>
              Multiply each share by its range weight, then add. These shares
              count every legal turn–river pair, including ties and redraws.
            </p>
            {q.guide?.map((row) => (
              <div className="learning-opponent" key={row.cards.join("")}>
                <Cards cards={row.cards} small />
                <span>
                  Your pot share: {row.equity.toFixed(1)}% × range weight{" "}
                  {(row.weight * 100).toFixed(0)}%
                </span>
              </div>
            ))}
            <p>
              Weighted share: <strong>{equity.toFixed(1)}%</strong>. For this
              exercise you may use that share directly to focus on the decision.
            </p>
          </details>
          <details>
            <summary>Complete assumptions</summary>
            <ul>
              {q.assumptions.map((a) => (
                <li key={a}>{a}</li>
              ))}
            </ul>
          </details>
          {!feedback ? (
            <form
              onSubmit={(e) => {
                e.preventDefault();
                void submit();
              }}
            >
              <label>
                Required pot share to call (%)
                <input
                  aria-label="Required pot share"
                  type="number"
                  min={0}
                  max={100}
                  step="any"
                  value={price}
                  onChange={(e) => setPrice(e.target.value)}
                  disabled={busy}
                />
              </label>
              <p className="quiet">
                Final pot = {q.potBefore} + {q.bet} + your {q.bet} call. Divide
                the call cost by that final pot.
              </p>
              <label>
                Your equity estimate (%) · optional
                <input
                  aria-label="Optional equity estimate"
                  type="number"
                  min={0}
                  max={100}
                  step="any"
                  value={estimate}
                  onChange={(e) => setEstimate(e.target.value)}
                  disabled={busy}
                />
              </label>
              <fieldset disabled={busy}>
                <legend>Which action earns more under this range?</legend>
                {["call", "fold"].map((a) => (
                  <label key={a}>
                    <input
                      type="radio"
                      name="decision-action"
                      checked={action === a}
                      onChange={() => setAction(a)}
                    />
                    {a === "call" ? `Call ${q.bet}` : "Fold"}
                  </label>
                ))}
              </fieldset>
              <fieldset disabled={busy}>
                <legend>
                  Same cards and range: opponent shoves {q.counterBet} instead.
                  What changes?
                </legend>
                <p>
                  This controlled comparison keeps the range and {q.potBefore}
                  -chip starting pot fixed. Both players have enough chips to
                  match the new all-in amount. In real play, a different bet
                  size can also change the range.
                </p>
                {["call", "fold"].map((a) => (
                  <label key={a}>
                    <input
                      type="radio"
                      name="counter-action"
                      checked={counter === a}
                      onChange={() => setCounter(a)}
                    />
                    {a === "call" ? `Call ${q.counterBet}` : "Fold"}
                  </label>
                ))}
              </fieldset>
              <button
                className="primary"
                disabled={
                  busy ||
                  !validNumber(price) ||
                  (!!estimate.trim() && !validNumber(estimate)) ||
                  !action ||
                  !counter
                }
              >
                {busy ? "Checking…" : "Check both decisions"}
              </button>
            </form>
          ) : (
            <div
              className="learning-feedback"
              role="region"
              aria-label="Decision feedback"
            >
              <h2>
                {feedback.callEv! > 0 ? `Call ${q.bet}` : "Fold"} under this
                range
              </h2>
              <p>
                First decision: {feedback.actionCorrect ? "correct" : "revisit"}
                . Changed price:{" "}
                {feedback.counterCorrect ? "correct" : "revisit"}.
              </p>
              <p>
                Your share is <strong>{feedback.equity?.toFixed(1)}%</strong>;
                the first call needs{" "}
                <strong>{feedback.required?.toFixed(1)}%</strong>. Calling
                averages {feedback.callEv?.toFixed(1)} additional chips; folding
                averages 0.
              </p>
              <p>
                At {q.counterBet}, the required share is{" "}
                {feedback.counterRequired?.toFixed(1)}%.{" "}
                {feedback.counterEv! > 0 ? "Calling" : "Folding"} earns more;
                call EV is {feedback.counterEv?.toFixed(1)} chips. Your hand's
                equity stays the same when only the price changes.
              </p>
              <p>
                Call-price estimate error: {feedback.priceError?.toFixed(1)}{" "}
                percentage points.
                {feedback.errorPp !== undefined &&
                  ` Equity estimate error: ${feedback.errorPp.toFixed(1)} points.`}
              </p>
              <p>{q.coaching}</p>
              <h3>Which part of the range drives your share?</h3>
              {q.guide?.map((row) => (
                <div className="learning-opponent" key={row.cards.join("")}>
                  <Cards cards={row.cards} small />
                  <span>
                    {row.equity.toFixed(1)}% share against this hand, weighted{" "}
                    {(row.weight * 100).toFixed(0)}%.
                  </span>
                </div>
              ))}
              <p>
                Giving more weight to the hand with the lower matchup share
                lowers your total equity; more weight to the higher-share hand
                raises it. Check that change against the call price.
              </p>
              <details>
                <summary>Exact calculation</summary>
                <p>{feedback.explanation}</p>
                <p>
                  Outright wins: {feedback.winPercent?.toFixed(1)}%; ties:{" "}
                  {feedback.tiePercent?.toFixed(1)}%. Equity includes half of
                  tied pots.
                </p>
              </details>
              <div className="button-row">
                <button
                  className="primary"
                  disabled={busy}
                  onClick={() => void start()}
                >
                  Next situation
                </button>
                <button
                  className="secondary"
                  disabled={busy}
                  onClick={() => void start(q.id)}
                >
                  Repeat this situation
                </button>
              </div>
            </div>
          )}
        </section>
      )}
    </div>
  );
}
export function ReadProgressSummary({ refresh }: { refresh: unknown }) {
  const [p, setP] = useState<ReadProgress | null>(null);
  useEffect(() => {
    let active = true;
    void api<ReadProgress>("/progress")
      .then((data) => {
        if (active) setP(data);
      })
      .catch(() => {});
    return () => {
      active = false;
    };
  }, [refresh]);
  if (!p?.completed) return null;
  return (
    <section className="panel">
      <h2>All-in practice history</h2>
      <p>
        Completed decisions: {p.completed} · First decisions correct:{" "}
        {p.decisionsCorrect}/{p.completed}
      </p>
      <p className="quiet">
        Includes saved attempts from the earlier read lesson. Repeats record
        fresh attempts.
      </p>
    </section>
  );
}
