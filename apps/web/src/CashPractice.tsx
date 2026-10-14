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
      <h2>Online cash practice progress</h2>
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
            complete answers correct.
          </p>
          <p>
            Hinted first answers: {data.assistedAttempts} · Guided follow-ups:{" "}
            {data.transferCorrect}/{data.transferAttempts} correct.
          </p>
          <p>
            High-confidence independent misses: {data.highConfidenceMistakes}.
          </p>
          <p className="quiet">
            A complete answer includes the action, reason and estimate under
            supplied study assumptions. These counts measure these exercises,
            separately from chip profit or real-world poker skill.
          </p>
          {!data.attempts && (
            <p>
              Start with a fresh decision, explain it, then check what changes
              at a different price or range.
            </p>
          )}
          <div className="cash-cue">
            <strong>For your next real session</strong>
            <p>{data.nextSessionCue}</p>
          </div>
          {data.attempts > 0 && (
            <details open>
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
        players still in this pot · {q.startingStackBb} BB starting stacks
      </p>
      <p>
        River effective stack before wagers: {number(q.effectiveStackBb)} BB ·
        Current pot: <strong>{number(q.potBb)} BB</strong>
        {q.callBb > 0
          ? ` · Call costs ${number(q.callBb)} BB`
          : ` · Offered bet ${number(q.betBb)} BB`}{" "}
        · Study rake: {number(q.rakeBb)} BB
      </p>
      <p className="quiet">
        The current pot includes visible river bets and calls. BB means big
        blinds; the study rake is a fixed deduction, not a site fee schedule.
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
      <details>
        <summary>Public action history</summary>
        <ol className="cash-history">
          {q.history.map((a, i) => (
            <li key={i}>
              <strong>{a.street}</strong> · {a.label}
            </li>
          ))}
        </ol>
      </details>
      <h3>Supplied study ranges</h3>
      <p className="quiet">
        These are possible hands and study weights, not revealed opponent cards
        or a prediction of a real player's range. Blocked joint combinations are
        excluded in multiway calculations. Each percentage is normalized within
        its supplied range and rounded to two decimal places; the calculation
        uses the unrounded weights.
      </p>
      <div className="cash-ranges">
        {q.ranges.map((r) => (
          <section key={r.seat} aria-label={r.label}>
            <h4>{r.label}</h4>
            {r.combinations.map((c, i) => (
              <div className="cash-range-row" key={i}>
                <Cards cards={c.cards} small />
                <span>
                  Study weight{" "}
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
        <summary>Complete study assumptions</summary>
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
        <legend>Your action under the supplied assumptions</legend>
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
        <span className="quiet">Percent, from 0 to 100.</span>
      </label>
      <fieldset disabled={busy}>
        <legend>How confident are you in this answer?</legend>
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
        {busy ? "Saving…" : "Commit my answer"}
      </button>
      <p className="quiet">
        Your first answer is saved once. Feedback appears after you commit.
      </p>
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
      <h3>{f.correct ? "Complete answer correct" : "Review this decision"}</h3>
      <p>
        {f.phase === "transfer"
          ? "Guided follow-up"
          : f.assisted
            ? "Hinted first answer"
            : "Independent first answer"}{" "}
        · Confidence: {answer.confidence.replaceAll("-", " ")}.
      </p>
      <p>
        Your action:{" "}
        {question.options.find((o) => o.action === answer.action)?.label}. Your
        reason: {question.reasons.find((r) => r.id === answer.reasonId)?.label}.
        Your estimate: {number(answer.estimatePercent)}%.
      </p>
      <ul>
        <li>Action: {f.actionCorrect ? "Correct" : "Needs revision"}</li>
        <li>Reason: {f.reasonCorrect ? "Correct" : "Needs revision"}</li>
        <li>
          Estimate: {f.estimateCorrect ? "Within tolerance" : "Needs revision"}{" "}
          · Reference {number(f.expectedEstimate)}% · Error{" "}
          {number(f.estimateErrorPp)} percentage points
        </li>
      </ul>
      <h4>Expected value under the supplied ranges and responses</h4>
      <ul>
        {f.actionValues.map((v) => (
          <li key={v.action}>
            {v.label}: {number(v.evBb)} BB
          </li>
        ))}
      </ul>
      <p>{f.explanation}</p>
      <p className="cash-calculation">{f.calculation}</p>
      <p>{f.takeaway}</p>
      <p className="quiet">
        Exact for these legal weighted river combinations and stipulated
        responses. Real opponent ranges and responses remain uncertain.
      </p>
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
          <span className="eyebrow">Online no-limit Hold’em cash</span>
          <h1 ref={focus} tabIndex={-1}>
            Online cash Decision Lab
          </h1>
        </div>
      </div>
      <p>
        Practice a river decision, explain the range and price, then test a
        changed assumption. Use the next-session cue when reviewing your own
        hands after play.
      </p>
      <section className="panel cash-settings" aria-label="Next drill settings">
        <h2>Next drill settings</h2>
        <p className="quiet">
          Changing these controls applies to the next fresh drill. The current
          hand keeps its original table size.
        </p>
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
                  {n} seats{n === 9 ? " · full ring" : ""}
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
              <option value="auto">Adaptive mix</option>
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
            {phase === "initial"
              ? "First decision"
              : "Guided changed-assumption follow-up"}
          </p>
          <h2>{question.title}</h2>
          {phase === "initial" && (
            <p className="quiet">{drill.selectionReason}</p>
          )}
          {question.change && <p className="cash-change">{question.change}</p>}
          {phase === "transfer" && (
            <p className="quiet">
              This follows revealed feedback, so it is counted separately from
              independent first answers.
            </p>
          )}
          <QuestionScene question={question} />
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
                    Try the changed assumption
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
                  Choose at least three seats in the next drill settings to
                  revisit multiway calls.
                </p>
              )}
            </>
          ) : (
            <>
              <button className="secondary" disabled={busy} onClick={showHint}>
                {drill.assisted.includes(phase)
                  ? "Show reasoning hint again"
                  : "Use a reasoning hint"}
              </button>
              {drill.assisted.includes(phase) && (
                <p className="quiet">
                  A hint was used for this decision. This answer will be
                  recorded as assisted.
                </p>
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
