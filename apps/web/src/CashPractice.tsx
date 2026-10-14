import { useEffect, useRef, useState } from "react";
import { Cards } from "./Cards";
import {
  cashSkills,
  type CashAction,
  type CashAnswer,
  type CashConfidence,
  type CashDrillView,
  type CashFeedback,
  type CashPhase,
  type CashProgress,
  type CashQuestion,
  type CashSkill,
} from "../../../packages/shared/src/cash-practice";

const labels: Record<CashSkill, string> = {
  "bluff-catch": "River calls",
  "value-bet": "Value bets",
  bluff: "River bluffs",
  "multiway-call": "Multiway calls",
};
const storageKey = "poker-practice-cash";
type Settings = { players: number; skill: CashSkill | "auto" };
function saved(): { settings?: Settings; id?: string; phase?: CashPhase } {
  try {
    const value = JSON.parse(localStorage.getItem(storageKey) ?? "{}");
    return value && typeof value === "object" && !Array.isArray(value)
      ? value
      : {};
  } catch {
    return {};
  }
}
function persist(
  settings: Settings,
  id?: string,
  phase: CashPhase = "initial",
) {
  try {
    localStorage.setItem(storageKey, JSON.stringify({ settings, id, phase }));
  } catch {
    /* Practice also works without browser storage. */
  }
}
function initialSettings(): Settings {
  const value = saved().settings;
  const settings: Settings = {
    players:
      value &&
      Number.isInteger(value.players) &&
      value.players >= 2 &&
      value.players <= 9
        ? value.players
        : 9,
    skill:
      value && (value.skill === "auto" || cashSkills.includes(value.skill))
        ? value.skill
        : "auto",
  };
  if (settings.players === 2 && settings.skill === "multiway-call")
    settings.skill = "auto";
  return settings;
}
class RequestError extends Error {
  constructor(
    message: string,
    public status: number,
  ) {
    super(message);
  }
}
async function request<T>(
  path: string,
  body?: unknown,
  signal?: AbortSignal,
): Promise<T> {
  const response = await fetch(`/api/cash-practice${path}`, {
    signal,
    ...(body === undefined
      ? {}
      : {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
        }),
  });
  let data;
  try {
    data = await response.json();
  } catch {
    throw new RequestError(
      "The local server returned an unexpected response.",
      response.status,
    );
  }
  if (!response.ok)
    throw new RequestError(
      data.error ?? "Unable to load cash practice.",
      response.status,
    );
  return data;
}
const number = (n: number) => Number(n.toFixed(2)).toString();

export function CashProgressSummary({
  refresh,
  players = 9,
  onReview,
}: {
  refresh?: unknown;
  players?: number;
  onReview?: (skill: CashSkill) => void;
}) {
  const [data, setData] = useState<CashProgress | null>(null);
  const [error, setError] = useState("");
  const [retry, setRetry] = useState(0);
  useEffect(() => {
    const controller = new AbortController();
    setError("");
    void request<CashProgress>(
      `/progress?players=${players}`,
      undefined,
      controller.signal,
    )
      .then((value) => {
        if (!controller.signal.aborted) setData(value);
      })
      .catch((e: Error) => {
        if (!controller.signal.aborted) setError(e.message);
      });
    return () => controller.abort();
  }, [refresh, players, retry]);
  return (
    <section className="panel cash-progress" aria-label="Online cash progress">
      <h2>Cash practice progress</h2>
      {error ? (
        <p role="alert">
          {error}{" "}
          <button onClick={() => setRetry((v) => v + 1)}>Retry progress</button>
        </p>
      ) : !data ? (
        <p role="status">Loading cash progress…</p>
      ) : (
        <>
          <p>
            Independent first answers:{" "}
            <strong>
              {data.independentCorrect}/{data.independentAttempts}
            </strong>{" "}
            correct for these practice ranges.
          </p>
          <p>
            Hinted first answers: {data.assistedAttempts} · Guided follow-ups:{" "}
            {data.transferCorrect}/{data.transferAttempts} correct for these
            practice ranges.
          </p>
          <details>
            <summary>Progress details</summary>
            <p>
              Correct means the action, reason and estimate match this practice
              range. These counts measure exercises, not real-world poker skill.
            </p>
            <p>
              High-confidence independent misses: {data.highConfidenceMistakes}.
            </p>
            <p>{data.nextSessionCue}</p>
          </details>
          {data.attempts > 0 && (
            <details>
              <summary>What to practice next</summary>
              <ul className="cash-skill-list">
                {[...data.skills]
                  .sort((a, b) => b.reviewPriority - a.reviewPriority)
                  .map((s) => (
                    <li key={s.skill}>
                      <strong>{s.label}</strong>
                      <span>
                        {s.independentCorrect}/{s.independentAttempts}{" "}
                        independent complete answers · {s.actionMistakes} action
                        misses · {s.reasonMistakes} reason misses
                        {s.estimateMeanErrorPp !== null
                          ? ` · ${number(s.estimateMeanErrorPp)} percentage points mean estimate error`
                          : ""}
                      </span>
                      <p>{s.nextCue}</p>
                      {onReview &&
                        !(players === 2 && s.skill === "multiway-call") && (
                          <button
                            className="secondary"
                            onClick={() => onReview(s.skill)}
                          >
                            Fresh {labels[s.skill].toLowerCase()} drill
                          </button>
                        )}
                    </li>
                  ))}
              </ul>
            </details>
          )}
          {data.recent.length > 0 && (
            <details>
              <summary>Recent first answers</summary>
              <ul>
                {data.recent.slice(0, 5).map((r) => (
                  <li key={r.id}>
                    {r.label} · {r.assisted ? "Hinted" : "Independent"} ·{" "}
                    {r.correct
                      ? "Complete answer correct"
                      : "Revisit reasoning"}{" "}
                    · Confidence: {r.confidence.replaceAll("-", " ")}
                  </li>
                ))}
              </ul>
            </details>
          )}
        </>
      )}
    </section>
  );
}

function QuestionScene({ question: q }: { question: CashQuestion }) {
  return (
    <>
      <p className="cash-context">
        <strong>{q.tablePlayers}-seat cash table</strong> · {q.activePlayers}{" "}
        players still in this pot · You:{" "}
        {q.seats.find((seat) => seat.seat === q.heroSeat)?.position}
      </p>
      <p>
        Current pot: <strong>{number(q.potBb)} BB</strong>
        {q.callBb > 0
          ? ` · Call costs ${number(q.callBb)} BB`
          : ` · Offered bet ${number(q.betBb)} BB`}{" "}
        · Fixed rake: {number(q.rakeBb)} BB
      </p>
      <p className="quiet">
        BB = big blind. Rake is a fixed practice deduction.
      </p>
      <p>
        {q.callBb > 0
          ? "Calling ends the betting."
          : "Checking ends the hand; bets get only the shown responses."}
      </p>
      <div className="learning-cards">
        <div>
          <h3>Your cards</h3>
          <Cards cards={q.hole} />
        </div>
        <div>
          <h3>River board</h3>
          <Cards cards={q.board} />
        </div>
      </div>
      <details>
        <summary>Table details</summary>
        <p>
          {q.startingStackBb} BB starting stacks · River effective stack before
          wagers: {number(q.effectiveStackBb)} BB
        </p>
        <div className="cash-seats" aria-label="Table seats">
          {q.seats.map((s) => (
            <div
              key={s.seat}
              className={`cash-seat ${s.seat === q.heroSeat ? "cash-hero" : ""} ${s.status === "folded" ? "cash-folded" : ""}`}
            >
              <strong>
                {s.position}
                {s.seat === q.dealerSeat ? " · Button" : ""}
              </strong>
              <span>
                {s.label}
                {s.seat === q.heroSeat && s.label !== "You" ? " · You" : ""}
              </span>
              <span>
                {s.status === "folded" ? "Folded" : "In this pot"} ·{" "}
                {number(s.stackBb)} BB left
              </span>
            </div>
          ))}
        </div>
      </details>
      <details>
        <summary>Hand history</summary>
        <ol className="cash-history">
          {q.history.map((a, i) => (
            <li key={i}>
              <strong>{a.street}</strong> · {a.label}
            </li>
          ))}
        </ol>
      </details>
      <h3>Opponent ranges</h3>
      <p className="quiet">Practice ranges; real opponents vary.</p>
      <div className="cash-ranges">
        {q.ranges.map((r) => (
          <section key={r.seat} aria-label={r.label}>
            <h4>{r.label}</h4>
            {r.combinations.map((c, i) => (
              <div className="cash-range-row" key={i}>
                <Cards cards={c.cards} small />
                <span>
                  Weight{" "}
                  {(
                    (100 * c.weight) /
                    r.combinations.reduce((sum, combo) => sum + combo.weight, 0)
                  ).toFixed(2)}
                  %
                  {c.response
                    ? ` · ${c.response === "call" ? "Calls" : "Folds to"} ${number(q.betBb)} BB bet`
                    : ""}
                </span>
              </div>
            ))}
          </section>
        ))}
      </div>
      <details>
        <summary>Range details</summary>
        <p>
          Possible hands, not revealed cards. Blocked joint combinations are
          excluded. Percentages are normalized within each range and rounded;
          calculations use unrounded weights. The pot includes visible river
          bets and calls.
        </p>
        <ul>
          {q.assumptions.map((a) => (
            <li key={a}>{a}</li>
          ))}
        </ul>
      </details>
    </>
  );
}

function AnswerForm({
  question,
  busy,
  onSubmit,
}: {
  question: CashQuestion;
  busy: boolean;
  onSubmit: (answer: CashAnswer) => void;
}) {
  const [action, setAction] = useState<CashAction | "">("");
  const [reasonId, setReason] = useState("");
  const [estimate, setEstimate] = useState("");
  const [confidence, setConfidence] = useState<CashConfidence | "">("");
  const valid =
    action &&
    reasonId &&
    confidence &&
    estimate.trim() !== "" &&
    Number.isFinite(Number(estimate)) &&
    Number(estimate) >= 0 &&
    Number(estimate) <= 100;
  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        if (valid)
          onSubmit({
            phase: question.phase,
            action: action as CashAction,
            reasonId,
            estimatePercent: Number(estimate),
            confidence: confidence as CashConfidence,
          });
      }}
    >
      <fieldset disabled={busy}>
        <legend>Your action</legend>
        {question.options.map((o) => (
          <label key={o.action}>
            <input
              required
              type="radio"
              name={`cash-action-${question.phase}`}
              checked={action === o.action}
              onChange={() => setAction(o.action)}
            />
            {o.label}
          </label>
        ))}
      </fieldset>
      <fieldset disabled={busy}>
        <legend>Why?</legend>
        {question.reasons.map((r) => (
          <label key={r.id}>
            <input
              required
              type="radio"
              name={`cash-reason-${question.phase}`}
              checked={reasonId === r.id}
              onChange={() => setReason(r.id)}
            />
            {r.label}
          </label>
        ))}
      </fieldset>
      <label className="cash-estimate">
        {question.estimatePrompt}
        <input
          aria-label={question.estimatePrompt}
          type="number"
          min="0"
          max="100"
          step="any"
          required
          value={estimate}
          disabled={busy}
          onChange={(e) => setEstimate(e.target.value)}
        />
        <span className="quiet">0–100%</span>
      </label>
      <fieldset disabled={busy}>
        <legend>Confidence</legend>
        {(
          [
            ["unsure", "Unsure"],
            ["somewhat-sure", "Somewhat sure"],
            ["very-sure", "Very sure"],
          ] as const
        ).map(([value, label]) => (
          <label key={value}>
            <input
              required
              type="radio"
              name={`cash-confidence-${question.phase}`}
              checked={confidence === value}
              onChange={() => setConfidence(value)}
            />
            {label}
          </label>
        ))}
      </fieldset>
      <button className="primary" type="submit" disabled={busy || !valid}>
        {busy ? "Saving…" : "Check answer"}
      </button>
      <p className="quiet">Saved once; feedback follows.</p>
    </form>
  );
}

function Feedback({
  feedback: f,
  answer,
  question,
}: {
  feedback: CashFeedback;
  answer: CashAnswer;
  question: CashQuestion;
}) {
  const focus = useRef<HTMLElement>(null);
  const acceptedLabels = f.acceptedActions.map(
    (action) =>
      question.options.find((option) => option.action === action)?.label ??
      action,
  );
  const betValue = f.actionValues.find((value) => value.action === "bet");
  const checkValue = f.actionValues.find((value) => value.action === "check");
  const numericReason =
    question.callBb > 0 && f.sharePercent !== undefined
      ? `Expected pot share: ${number(f.sharePercent)}% · Required share: ${number(f.expectedEstimate)}%.`
      : question.skill === "bluff" && f.foldPercent !== undefined
        ? `Supplied folds: ${number(f.foldPercent)}% · Required folds: ${number(f.expectedEstimate)}%.`
        : question.skill === "value-bet" &&
            f.weakerCallerPercent !== undefined &&
            betValue &&
            checkValue
          ? `Weaker callers: ${number(f.weakerCallerPercent)}% · Average return in this example: ${number(betValue.evBb)} BB betting vs ${number(checkValue.evBb)} BB checking.`
          : f.explanation;
  useEffect(() => {
    focus.current?.focus();
  }, []);
  return (
    <section
      ref={focus}
      tabIndex={-1}
      className="cash-feedback"
      aria-label="Cash decision feedback"
    >
      <h3>
        {f.correct
          ? "Correct for this practice range"
          : "Revisit this decision"}
      </h3>
      <p>
        {f.phase === "transfer"
          ? "Guided follow-up"
          : f.assisted
            ? "Hinted first answer"
            : "Independent first answer"}
      </p>
      <p>
        In this example: <strong>{acceptedLabels.join(" or ")}</strong>.
      </p>
      <p>
        Action: {f.actionCorrect ? "Correct" : "Revisit"} · Reason:{" "}
        {f.reasonCorrect ? "Correct" : "Revisit"} · Estimate:{" "}
        {f.estimateCorrect ? "Within tolerance" : "Revisit"}
      </p>
      <p>{numericReason}</p>
      <p>{f.takeaway}</p>
      <details>
        <summary>Answer breakdown</summary>
        <p>
          Your action:{" "}
          {question.options.find((o) => o.action === answer.action)?.label}.
          Your reason:{" "}
          {question.reasons.find((r) => r.id === answer.reasonId)?.label}. Your
          estimate: {number(answer.estimatePercent)}%. Confidence:{" "}
          {answer.confidence.replaceAll("-", " ")}.
        </p>
        <p>
          Reference estimate for this practice range:{" "}
          {number(f.expectedEstimate)}% · Error: {number(f.estimateErrorPp)}{" "}
          percentage points
        </p>
      </details>
      <details>
        <summary>Math</summary>
        <h4>Expected value for these practice ranges and responses</h4>
        <ul>
          {f.actionValues.map((v) => (
            <li key={v.action}>
              {v.label}: {number(v.evBb)} BB
            </li>
          ))}
        </ul>
        <p>{f.explanation}</p>
        <p className="cash-calculation">{f.calculation}</p>
      </details>
    </section>
  );
}

export function CashPractice({ onBack }: { onBack: () => void }) {
  const [settings, setSettings] = useState<Settings>(initialSettings);
  const [drill, setDrill] = useState<CashDrillView | null>(null);
  const [phase, setPhase] = useState<CashPhase>("initial");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [hint, setHint] = useState("");
  const [refresh, setRefresh] = useState(0);
  const lock = useRef(false);
  const active = useRef(true);
  const retry = useRef<() => void>(() => {});
  const controller = useRef<AbortController | null>(null);
  const focus = useRef<HTMLHeadingElement>(null);
  async function perform(
    operation: (signal: AbortSignal) => Promise<void>,
    again: () => void,
  ) {
    if (lock.current) return;
    lock.current = true;
    setBusy(true);
    setError("");
    retry.current = again;
    const requestController = new AbortController();
    controller.current = requestController;
    try {
      await operation(requestController.signal);
    } catch (e) {
      if (active.current && !requestController.signal.aborted)
        setError((e as Error).message);
    } finally {
      lock.current = false;
      if (active.current) setBusy(false);
    }
  }
  function apply(view: CashDrillView, nextPhase: CashPhase) {
    if (!active.current) return;
    setDrill(view);
    setPhase(nextPhase);
    setHint("");
    persist(settings, view.id, nextPhase);
    setRefresh((v) => v + 1);
  }
  function create(skill = settings.skill) {
    void perform(
      async (signal) => {
        const view = await request<CashDrillView>(
          "/drills",
          { players: settings.players, ...(skill === "auto" ? {} : { skill }) },
          signal,
        );
        apply(view, "initial");
        setNotice("");
      },
      () => create(skill),
    );
  }
  useEffect(() => {
    active.current = true;
    const stored = saved();
    function resume() {
      void perform(async (signal) => {
        try {
          const view = await request<CashDrillView>(
            `/drills/${stored.id}`,
            undefined,
            signal,
          );
          apply(
            view,
            stored.phase === "transfer" && view.transfer
              ? "transfer"
              : "initial",
          );
        } catch (e) {
          if (e instanceof RequestError && e.status === 404) {
            if (active.current) {
              persist(settings);
              setNotice(
                "The saved drill was cleared. Start a fresh drill when you're ready.",
              );
            }
          } else throw e;
        }
      }, resume);
    }
    if (stored.id) resume();
    return () => {
      active.current = false;
      controller.current?.abort();
    };
  }, []);
  useEffect(() => {
    focus.current?.focus();
  }, [drill?.id, phase]);
  const question = phase === "transfer" ? drill?.transfer : drill?.initial;
  const feedback = drill?.feedback[phase];
  function changeSettings(next: Settings) {
    if (next.players === 2 && next.skill === "multiway-call")
      next.skill = "auto";
    setSettings(next);
    persist(next, drill?.id, phase);
  }
  function submit(answer: CashAnswer) {
    if (!drill) return;
    void perform(
      async (signal) => {
        const view = await request<CashDrillView>(
          `/drills/${drill.id}/answer`,
          answer,
          signal,
        );
        apply(view, phase);
      },
      () => submit(answer),
    );
  }
  function showHint() {
    if (!drill) return;
    void perform(async (signal) => {
      const result = await request<{ hint: string }>(
        `/drills/${drill.id}/hint`,
        { phase },
        signal,
      );
      if (active.current) {
        setHint(result.hint);
        setDrill((view) =>
          view
            ? {
                ...view,
                assisted: Array.from(new Set([...view.assisted, phase])),
              }
            : view,
        );
      }
    }, showHint);
  }
  return (
    <div className="learning-layout cash-practice">
      <button className="secondary" disabled={busy} onClick={onBack}>
        Back to learning
      </button>
      <div className="page-heading">
        <div>
          <h1 ref={focus} tabIndex={-1}>
            Online cash Decision Lab
          </h1>
        </div>
      </div>
      <section className="panel cash-settings" aria-label="Next drill settings">
        <h2>Next hand</h2>
        <p className="quiet">Settings apply to the next hand.</p>
        <div className="cash-settings-row">
          <label>
            Table seats
            <select
              aria-label="Table seats"
              value={settings.players}
              disabled={busy}
              onChange={(e) =>
                changeSettings({ ...settings, players: Number(e.target.value) })
              }
            >
              {[2, 3, 4, 5, 6, 7, 8, 9].map((n) => (
                <option key={n} value={n}>
                  {n} seats
                </option>
              ))}
            </select>
          </label>
          <label>
            Practice focus
            <select
              aria-label="Practice focus"
              value={settings.skill}
              disabled={busy}
              onChange={(e) =>
                changeSettings({
                  ...settings,
                  skill: e.target.value as Settings["skill"],
                })
              }
            >
              <option value="auto">Mixed practice</option>
              {cashSkills
                .filter((s) => settings.players !== 2 || s !== "multiway-call")
                .map((s) => (
                  <option key={s} value={s}>
                    {labels[s]}
                  </option>
                ))}
            </select>
          </label>
        </div>
        <button className="primary" disabled={busy} onClick={() => create()}>
          {busy
            ? "Working…"
            : drill
              ? "Start fresh cash drill"
              : "Start cash drill"}
        </button>
      </section>
      {busy && <p role="status">Loading or saving cash practice…</p>}
      {notice && <p role="status">{notice}</p>}
      {error && (
        <p role="alert">
          {error}{" "}
          <button disabled={busy} onClick={() => retry.current()}>
            Try again
          </button>
        </p>
      )}
      {drill && question && (
        <section
          className="panel cash-question"
          aria-label="Current cash decision"
          aria-busy={busy}
        >
          <p className="eyebrow">
            {phase === "initial" ? "First decision" : "Guided follow-up"}
          </p>
          <h2>{question.title}</h2>
          {question.change && <p className="cash-change">{question.change}</p>}
          <QuestionScene question={question} />
          {phase === "initial" && (
            <details>
              <summary>Why this drill?</summary>
              <p>{drill.selectionReason}</p>
            </details>
          )}
          {feedback && drill.answers[phase] ? (
            <>
              <Feedback
                key={`${drill.id}-${phase}`}
                feedback={feedback}
                answer={drill.answers[phase]!}
                question={question}
              />
              <div className="button-row">
                {phase === "initial" && drill.transfer && (
                  <button
                    className="primary"
                    disabled={busy}
                    onClick={() => {
                      setPhase("transfer");
                      setHint("");
                      persist(settings, drill.id, "transfer");
                    }}
                  >
                    Try the change
                  </button>
                )}
                <button
                  className="secondary"
                  disabled={
                    busy ||
                    (settings.players === 2 &&
                      question.skill === "multiway-call")
                  }
                  onClick={() => create(question.skill)}
                >
                  Fresh drill for this skill
                </button>
                {phase === "transfer" && (
                  <button
                    className="secondary"
                    disabled={busy}
                    onClick={() => {
                      setPhase("initial");
                      setHint("");
                      persist(settings, drill.id);
                    }}
                  >
                    Review saved first answer
                  </button>
                )}
              </div>
              {settings.players === 2 && question.skill === "multiway-call" && (
                <p className="quiet">
                  Multiway calls need at least three seats.
                </p>
              )}
            </>
          ) : (
            <>
              <button className="secondary" disabled={busy} onClick={showHint}>
                {drill.assisted.includes(phase)
                  ? "Show hint again"
                  : "Use a hint"}
              </button>
              {drill.assisted.includes(phase) && (
                <p className="quiet">Hint used · Counts as a hinted answer.</p>
              )}
              {hint && (
                <p className="cash-cue" role="status">
                  {hint}
                </p>
              )}
              <AnswerForm
                key={`${drill.id}-${phase}`}
                question={question}
                busy={busy}
                onSubmit={submit}
              />
            </>
          )}
        </section>
      )}
      <CashProgressSummary
        refresh={refresh}
        players={settings.players}
        onReview={busy ? undefined : (skill) => create(skill)}
      />
    </div>
  );
}
