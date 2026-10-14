import { useEffect, useRef, useState } from "react";
import type { TableView } from "../../../packages/shared/src/table";
import type {
  AssistantAnalysis,
  AssistantContext,
  MoveAdvice,
} from "../../../packages/shared/src/assistant";
import { Cards } from "./Cards";
import { RangeMatrix } from "./RangeMatrix";
import { PreflopGuidePanel } from "./PreflopGuide";

const pct = (n: number) => `${n.toFixed(1)}%`;

export function DecisionAssistant({
  table,
  recommendation,
}: {
  table: TableView;
  recommendation?: MoveAdvice | null;
}) {
  const [context, setContext] = useState<AssistantContext | null>(null),
    [error, setError] = useState("");
  const [action, setAction] = useState("check"),
    [amount, setAmount] = useState("25");
  const [continuation, setContinuation] = useState<"theo" | "check-fold">(
    "theo",
  );
  const [previousAnalysis, setPreviousAnalysis] =
    useState<AssistantAnalysis | null>(null);
  const [analysis, setAnalysis] = useState<AssistantAnalysis | null>(null),
    [loading, setLoading] = useState(false);
  const [retry, setRetry] = useState(0),
    [advanced, setAdvanced] = useState(false);
  const sequence = useRef(0),
    controller = useRef<AbortController | null>(null);
  const legal = table.legal!;
  useEffect(() => {
    const abort = new AbortController();
    const id = ++sequence.current;
    controller.current?.abort();
    setContext(null);
    setPreviousAnalysis(null);
    setAnalysis(null);
    setError("");
    setLoading(false);
    setAction(legal.canCheck ? "check" : "call");
    setAmount(
      String(Math.min(legal.maxRaiseTo, Math.max(legal.minRaiseTo, 25))),
    );
    fetch(`/api/tables/${table.id}/assistant`, {
      method: "POST",
      signal: abort.signal,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ revision: table.revision, layer: "context" }),
    })
      .then(async (r) => {
        const data = await r.json();
        if (!r.ok) throw new Error(data.error);
        if (id === sequence.current && !abort.signal.aborted) setContext(data);
      })
      .catch((e) => {
        if (!abort.signal.aborted) setError(e.message);
      });
    return () => {
      abort.abort();
      controller.current?.abort();
      sequence.current++;
    };
  }, [table.id, table.revision, retry]);
  function invalidate() {
    if (analysis) setPreviousAnalysis(analysis);
    controller.current?.abort();
    sequence.current++;
    setAnalysis(null);
    setLoading(false);
    setError("");
  }
  async function calculate(layer: "behavior" | "advanced") {
    if (loading) return;
    const abort = new AbortController(),
      id = ++sequence.current;
    controller.current?.abort();
    controller.current = abort;
    setLoading(true);
    setAnalysis(null);
    setError("");
    try {
      const r = await fetch(`/api/tables/${table.id}/assistant`, {
        method: "POST",
        signal: abort.signal,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          revision: table.revision,
          layer,
          action,
          ...(action === "raise" ? { amount: Number(amount) } : {}),
          continuation,
        }),
      });
      const data = await r.json();
      if (!r.ok) throw new Error(data.error);
      if (id === sequence.current && !abort.signal.aborted) setAnalysis(data);
    } catch (e) {
      if (!abort.signal.aborted && id === sequence.current)
        setError((e as Error).message);
    } finally {
      if (id === sequence.current) setLoading(false);
    }
  }
  const [thinkingAction, setThinkingAction] = useState<
    "fold" | "continue" | "raise"
  >("continue");
  useEffect(() => {
    if (recommendation)
      setThinkingAction(
        recommendation.action === "raise"
          ? "raise"
          : recommendation.action === "fold"
            ? "fold"
            : "continue",
      );
  }, [recommendation?.key]);
  const callThreshold = legal.toCall
    ? (100 * legal.toCall) / (table.pot + legal.toCall)
    : 0;
  const valid =
    action !== "raise" ||
    (Number.isInteger(Number(amount)) &&
      Number(amount) >= legal.minRaiseTo &&
      Number(amount) <= legal.maxRaiseTo);
  return (
    <section
      id="live-preflop-assistant"
      className="decision-assistant"
      aria-label="Preflop decision assistant"
    >
      <h3>Before you act</h3>
      {!context && !error && <p role="status">Reading the situation…</p>}
      {context && (
        <>
          <section
            className="decision-walkthrough"
            aria-label="How to make this decision"
          >
            <h4>
              {recommendation
                ? `${recommendation.status === "close" ? "Tentative suggestion" : "Suggested move"}: ${recommendation.label}`
                : "Think through your move"}
            </h4>
            <p className="quiet">
              {recommendation
                ? `Highest estimated return among tested choices: ${recommendation.chips.toFixed(1)} chips under the bot model. ${recommendation.status === "close" ? "Other choices are too close to separate confidently." : ""}`
                : "Consider the hands that could continue and the price of your action. Show move hint beside the betting controls if you want a model estimate."}
            </p>
            <p>
              Use your cards, position and the betting so far first. A winning
              percentage alone cannot choose your action.
            </p>
            <p>
              <strong>
                {legal.toCall
                  ? `You face a call of ${legal.toCall} into a pot of ${table.pot}.`
                  : `You can check for free. The pot is ${table.pot}.`}
              </strong>{" "}
              {context.position}. {context.stillToAct} opponents still need to
              act.
            </p>
            <details>
              <summary>Explore the reasoning for other actions</summary>
              <label>
                Action to explain
                <select
                  aria-label="Think through an action"
                  value={thinkingAction}
                  onChange={(e) =>
                    setThinkingAction(e.target.value as typeof thinkingAction)
                  }
                >
                  <option value="continue">
                    {legal.canCheck ? "Check" : `Call ${legal.toCall}`}
                  </option>
                  <option value="fold">Fold</option>
                  {legal.canRaise && <option value="raise">Raise</option>}
                </select>
              </label>
            </details>
            {thinkingAction === "fold" ? (
              <p>
                <strong>What would justify folding?</strong> You expect
                continuing to lose more new chips than it returns. Chips already
                committed are sunk: folding adds no further cost. A weak hand
                facing strong raises is different from the same hand in an
                unopened pot.
              </p>
            ) : thinkingAction === "raise" ? (
              <p>
                <strong>What would justify raising?</strong> Weaker hands call,
                enough opponents fold, or a combination of both. Name the hands
                you hope will call and decide what you would do against a
                re-raise. Select a size under “How might opponents respond?” to
                inspect those assumptions.
              </p>
            ) : legal.canCheck ? (
              <p>
                <strong>What would justify checking?</strong> You keep your hand
                in the pot without paying now. This can make sense when worse
                hands would fold to a bet and stronger hands would continue.
                Checking can still lead to a later bet from an opponent.
              </p>
            ) : (
              <p>
                <strong>What would justify calling?</strong> Your likely return
                must cover the {legal.toCall} new chips. The simple call-price
                threshold is {callThreshold.toFixed(1)}% ({legal.toCall} ÷{" "}
                {table.pot + legal.toCall}); it applies directly only with no
                further contributions and eligibility for the whole pot.
                Preflop, future bets and your ability to reach showdown matter
                too.
              </p>
            )}
            <details>
              <summary>Which numbers should I use?</summary>
              <ul>
                <li>
                  <strong>Position and action history:</strong> tell you which
                  strategy situation you are in; a limp, raise or re-raise
                  changes it.
                </li>
                <li>
                  <strong>Opponent ranges:</strong> possible hands inferred from
                  their actions. Ask which hands you beat, not whether they
                  could have any strong hand.
                </li>
                <li>
                  <strong>Showdown equity:</strong> your expected pot share if
                  everyone reaches showdown. It does not include winning by
                  making opponents fold.
                </li>
                <li>
                  <strong>Response predictions:</strong> inspect whether your
                  chosen raise is likely to get folds or calls under the
                  programmed bot model.
                </li>
                <li>
                  <strong>Modeled EV:</strong> compares average net chips under
                  specified future behavior. Similar estimates with overlapping
                  uncertainty do not establish a best action.
                </li>
              </ul>
            </details>
            <details>
              <summary>What would an optimal answer look like?</summary>
              <p>
                For specified opponent behavior and legal choices, it would
                maximize expected net chips while accounting for future
                decisions. An equilibrium strategy can mix actions; it is not
                necessarily one move for every hand. This trainer does not solve
                that full game. Its charts are illustrative and its EV
                comparisons are conditional estimates.
              </p>
            </details>
          </section>
          <div className="assistant-facts">
            <div>
              <Cards cards={context.hole} small />
              <strong>
                {context.hand} · {context.category}
              </strong>
            </div>
            <div>
              <strong>{context.position}</strong>
              <p>
                {context.tableSize} seats · {context.competing} players in the
                hand · {context.stillToAct} opponents still to act
              </p>
              <p>
                Effective stack (including bets):{" "}
                {context.effective.length
                  ? `${Math.min(...context.effective.map((p) => p.bb)).toFixed(1)}–${Math.max(...context.effective.map((p) => p.bb)).toFixed(1)} BB`
                  : "—"}
              </p>
              <details>
                <summary>Stacks against each opponent</summary>
                <ul>
                  {context.effective.map((p) => (
                    <li key={p.seat}>
                      {p.name}: {p.bb.toFixed(1)} BB
                    </li>
                  ))}
                </ul>
                <p className="quiet">
                  Includes chips already bet this street. Different stacks can
                  create side pots.
                </p>
              </details>
            </div>
          </div>
          <div
            className="assistant-timeline"
            aria-label="Preflop betting so far"
          >
            {context.history.map((h, i) => (
              <span key={i}>
                <strong>{h.name}</strong> {h.text}
              </span>
            ))}
          </div>
          <p className="assistant-takeaway">{context.intuition[0]}</p>
          <p className="quiet">{context.intuition[2]}</p>
          <details>
            <summary>Opening baseline (illustrative)</summary>
            <PreflopGuidePanel guide={context.guide} />
          </details>
          {context.guide.status === "available" && (
            <p className="quiet">
              This is a position-based opening baseline. Suitedness and pairs
              affect which hands it includes; it does not prove a hand is
              profitable against every opponent.
            </p>
          )}
          <details className="assistant-behavior">
            <summary>2 · How might opponents respond?</summary>
            <p>{context.intuition[1]}</p>
            <div className="assistant-tools">
              <label>
                Inspect action
                <select
                  aria-label="Assistant action"
                  value={action}
                  onChange={(e) => {
                    invalidate();
                    setAction(e.target.value);
                  }}
                >
                  <option value="fold">Fold</option>
                  <option value={legal.canCheck ? "check" : "call"}>
                    {legal.canCheck ? "Check" : `Call ${legal.toCall}`}
                  </option>
                  {legal.canRaise && <option value="raise">Raise</option>}
                </select>
              </label>
              {action === "raise" && (
                <label>
                  Raise to
                  <input
                    aria-label="Assistant raise to"
                    type="number"
                    min={legal.minRaiseTo}
                    max={legal.maxRaiseTo}
                    step="1"
                    value={amount}
                    onChange={(e) => {
                      invalidate();
                      setAmount(e.target.value);
                    }}
                  />
                </label>
              )}
              {action === "raise" && (
                <div className="assistant-size-buttons">
                  {[
                    ...new Set([
                      legal.minRaiseTo,
                      Math.min(
                        legal.maxRaiseTo,
                        Math.max(
                          legal.minRaiseTo,
                          Math.round(table.currentBet + table.pot / 2),
                        ),
                      ),
                      Math.min(
                        legal.maxRaiseTo,
                        Math.max(
                          legal.minRaiseTo,
                          table.currentBet + table.pot,
                        ),
                      ),
                    ]),
                  ].map((n) => (
                    <button
                      type="button"
                      className="secondary"
                      key={n}
                      onClick={() => {
                        invalidate();
                        setAmount(String(n));
                      }}
                    >
                      {n} chips
                    </button>
                  ))}
                </div>
              )}
            </div>
            <p className="quiet">
              Inspection only. These controls never place a bet.
            </p>
            <button
              className="secondary"
              disabled={loading || !valid}
              onClick={() => void calculate("behavior")}
            >
              Estimate responses
            </button>
            {analysis && (
              <div className="assistant-responses">
                <p>
                  <strong>
                    Everyone folds before your next decision/street:{" "}
                    {analysis.immediateAllFold.toFixed(1)}%
                  </strong>
                  <small>
                    95% sampling interval{" "}
                    {analysis.allFoldInterval
                      .map((n) => n.toFixed(1))
                      .join("–")}
                    % · {analysis.samples.toLocaleString()} simulations
                  </small>
                </p>
                {analysis.opponents.map((p) => (
                  <section key={p.seat} className="assistant-opponent">
                    <h4>
                      {p.name} · {p.profile?.style ?? p.style}
                    </h4>
                    <p>{p.profile?.summary}</p>
                    <details>
                      <summary>Which hands could they hold?</summary>
                      <p>
                        {p.range.combinations} legal combinations, weighted by
                        how likely this bot was to take its public actions. This
                        is an inferred range, not its actual cards.
                      </p>
                      <RangeMatrix cells={p.range.matrix} name={p.name} />
                    </details>
                    {p.reached > 0 ? (
                      <p>
                        When reached: fold {p.fold.toFixed(1)}% · call{" "}
                        {p.call.toFixed(1)}% · re-raise {p.raise.toFixed(1)}%
                        {p.check > 0 ? ` · check ${p.check.toFixed(1)}%` : ""}.
                        Reached in {p.reached.toFixed(1)}% of sequences.
                      </p>
                    ) : (
                      <p>
                        No betting response before your next decision/street in
                        these samples. This can include all-in opponents.
                      </p>
                    )}
                    {previousAnalysis?.action === "raise" &&
                      analysis.action === "raise" &&
                      previousAnalysis.amount !== analysis.amount &&
                      (() => {
                        const old = previousAnalysis.opponents.find(
                          (old) => old.seat === p.seat,
                        );
                        return old && old.reached > 0 && p.reached > 0 ? (
                          <p className="quiet">
                            Compared with {previousAnalysis.amount} chips: fold{" "}
                            {(p.fold - old.fold).toFixed(1)}, call{" "}
                            {(p.call - old.call).toFixed(1)}, re-raise{" "}
                            {(p.raise - old.raise).toFixed(1)} percentage
                            points. These differences include sampling noise and
                            may condition on different earlier responses.
                          </p>
                        ) : null;
                      })()}
                    <details>
                      <summary>Assumptions and observed behavior</summary>
                      <p>
                        The policy uses possible hand strength, call price,
                        raise pressure, position, stacks, prior actions and the
                        number of players. Its public-read adjustments are
                        smoothed; they are not proof of a human tendency.
                      </p>
                      <ul>
                        {p.profile?.tendencies.map((t) => (
                          <li key={t}>{t}</li>
                        ))}
                      </ul>
                      <p>
                        Observed: {p.observed.decisions} decisions;{" "}
                        {p.observed.facing} facing a bet, with{" "}
                        {p.observed.folds} folds and {p.observed.calls} calls;{" "}
                        {p.observed.raises} raises across all decisions.
                      </p>
                      {p.observed.facing > 0 && (
                        <p>
                          Observed fold rate:{" "}
                          {pct((100 * p.observed.folds) / p.observed.facing)};
                          95% interval {pct(p.observed.foldInterval[0])}–
                          {pct(p.observed.foldInterval[1])}. Observed call rate:{" "}
                          {pct((100 * p.observed.calls) / p.observed.facing)};
                          95% interval {pct(p.observed.callInterval[0])}–
                          {pct(p.observed.callInterval[1])}.
                        </p>
                      )}
                      <p className="quiet">
                        These are aggregate public counts from this game, not
                        measured response rates to your selected size. Small
                        counts are weak evidence. Predictions above come from
                        the programmed policy, including public history and its
                        smoothed adjustments.
                      </p>
                      {p.reached > 0 && (
                        <p className="quiet">
                          95% sampling intervals: fold{" "}
                          {p.intervals.fold.map((n) => n.toFixed(1)).join("–")}%
                          · call{" "}
                          {p.intervals.call.map((n) => n.toFixed(1)).join("–")}%
                          · re-raise{" "}
                          {p.intervals.raise.map((n) => n.toFixed(1)).join("–")}
                          %.
                        </p>
                      )}
                    </details>
                  </section>
                ))}
                <details>
                  <summary>Possible response sequences</summary>
                  <ul>
                    {analysis.branches.map((b) => (
                      <li key={b.label}>
                        {b.label}: {b.percent.toFixed(1)}%{" "}
                        <small>
                          ({b.interval.map((n) => n.toFixed(1)).join("–")}%
                          sampling interval)
                        </small>
                      </li>
                    ))}
                  </ul>
                  <p className="quiet">
                    Stops at your next decision or the next street. “Other”
                    groups the remaining sequences.
                  </p>
                </details>
              </div>
            )}
            <details
              className="assistant-advanced"
              onToggle={(e) => setAdvanced(e.currentTarget.open)}
            >
              <summary>3 · Showdown equity and modeled EV</summary>
              {advanced && (
                <>
                  <p>
                    EV asks what the action earns on average under specified
                    responses. Equity asks what share you get at showdown if
                    everyone continues. They are different questions.
                  </p>
                  <label>
                    Later decision plan
                    <select
                      aria-label="Assistant continuation"
                      value={continuation}
                      onChange={(e) => {
                        invalidate();
                        setContinuation(e.target.value as typeof continuation);
                      }}
                    >
                      <option value="theo">Theo’s authored continuation</option>
                      <option value="check-fold">
                        Check/fold sensitivity test
                      </option>
                    </select>
                  </label>
                  <p className="quiet">
                    Theo can fold, call, check or raise on later decisions. The
                    check/fold test checks when free and folds to any later bet;
                    it is not advice to play that way.
                  </p>
                  <button
                    className="secondary"
                    disabled={loading || !valid}
                    onClick={() => void calculate("advanced")}
                  >
                    Compare modeled actions
                  </button>
                  {analysis?.equity && (
                    <>
                      <div className="assistant-equity">
                        <strong>
                          Showdown equity: {analysis.equity.share.toFixed(1)}%
                        </strong>
                        <p>
                          Win outright {analysis.equity.win.toFixed(1)}% · tie
                          for first {analysis.equity.tie.toFixed(1)}%. Assumes
                          all {analysis.equity.opponents} opponents reach
                          showdown; no fold success is included. Equal pot
                          eligibility is assumed here; side pots and odd chips
                          can change the actual share of chips.
                        </p>
                        <p className="quiet">
                          {analysis.equity.samples.toLocaleString()} showdown
                          samples · pot-share interval{" "}
                          {analysis.equity.intervals.share
                            .map((n) => n.toFixed(1))
                            .join("–")}
                          %.
                        </p>
                      </div>
                      <div className="table-scroll">
                        <table>
                          <caption>Conditional EV from this decision</caption>
                          <thead>
                            <tr>
                              <th>Action / plan</th>
                              <th>Average net chips</th>
                              <th>Sampling uncertainty</th>
                              <th>Difference vs inspected action</th>
                            </tr>
                          </thead>
                          <tbody>
                            {analysis.values?.map((v) => (
                              <tr key={v.key}>
                                <th>{v.label}</th>
                                <td>
                                  {v.chips.toFixed(1)}
                                  {v.sources && (
                                    <details>
                                      <summary>Why this return?</summary>
                                      <ul>
                                        {v.sources.map((source) => (
                                          <li key={source.kind}>
                                            {source.kind === "uncontested"
                                              ? "Won without showdown, on any street"
                                              : source.kind === "showdown"
                                                ? "Reached showdown"
                                                : "Folded before showdown"}
                                            : {source.probability.toFixed(1)}%
                                            of samples;{" "}
                                            {source.contribution.toFixed(1)}{" "}
                                            chips contributed to total EV (
                                            {source.averageNet.toFixed(1)} chips
                                            on average within this branch).
                                          </li>
                                        ))}
                                      </ul>
                                      <p className="quiet">
                                        Contributions total this row’s EV.
                                        Uncontested wins can involve later
                                        folds; they are not all immediate bluff
                                        success.
                                      </p>
                                    </details>
                                  )}
                                </td>
                                <td>
                                  {v.exact
                                    ? "Enumerated under model"
                                    : `± ${v.margin.toFixed(1)} · ${v.samples} samples`}
                                </td>
                                <td>
                                  {(() => {
                                    const c = analysis.comparisons?.find(
                                      (c) => c.key === v.key,
                                    );
                                    return c
                                      ? `${c.difference.toFixed(1)} ± ${c.margin.toFixed(1)} chips${c.clear ? " · higher under model" : " · no clear advantage"}`
                                      : "Inspected action";
                                  })()}
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                      <p>
                        Positive EV means sampled payouts outweighed new chips
                        invested under this model. It may come from folds,
                        winning called pots, or later actions. It does not
                        establish the most profitable move against real
                        opponents.
                      </p>
                      <p className="quiet">
                        Paired differences compare alternatives on the same
                        sampled deals and adjust for testing multiple choices. A
                        difference whose interval includes zero is inconclusive.
                        Changing your later plan can change the result. EV’s
                        folds later in the hand are not the immediate fold
                        probability above.
                      </p>
                      <details>
                        <summary>Formulas and model limitations</summary>
                        <ul>
                          {analysis.assumptions.map((a) => (
                            <li key={a}>{a}</li>
                          ))}
                        </ul>
                        <p>
                          EV = Σ(branch probability × net payout), estimated by
                          average settled outcomes. Fold = 0 from this decision
                          because earlier contributions are sunk. A zero-equity
                          immediate bluff needs folds &gt; new risk ÷ (current
                          pot + new risk), assuming no other payouts.
                        </p>
                      </details>
                    </>
                  )}
                </>
              )}
            </details>
            {loading && (
              <p role="status">
                Calculating on a copy of this decision… You can continue
                playing.
              </p>
            )}
          </details>
        </>
      )}
      {error && (
        <div role="alert" className="error">
          <p>{error}</p>
          <button
            className="secondary"
            onClick={() =>
              context
                ? void calculate(advanced ? "advanced" : "behavior")
                : setRetry((n) => n + 1)
            }
          >
            Try again
          </button>
        </div>
      )}
    </section>
  );
}
