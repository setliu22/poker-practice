import { Learn, EarlierLearn, LearningProgressSummary } from "./Learn";
import { LearningPathProgressSummary } from "./LearningPath";
import { LearningPathDataControls } from "./LearningPathDataControls";
import { PreflopWalkthrough } from "./PreflopWalkthrough";
import { CashPractice, CashProgressSummary } from "./CashPractice";
import React, { useEffect, useRef, useState } from "react";
import { createRoot } from "react-dom/client";
import {
  modeLabels,
  modes,
  type Exercise,
  type Feedback,
  type Mode,
  type Progress as ProgressData,
} from "../../../packages/shared/src/index";
import "./styles.css";
import { Cards } from "./Cards";
import { BotPractice } from "./BotPractice";
import { OpeningChartLibrary } from "./PreflopGuide";
async function api<T>(path: string, options?: RequestInit): Promise<T> {
  const response = await fetch("/api" + path, {
    ...options,
    headers: { "Content-Type": "application/json", ...options?.headers },
  });
  let data;
  try {
    data = await response.json();
  } catch {
    throw new Error("The local server returned an unexpected response.");
  }
  if (!response.ok) throw new Error(data.error ?? "Request failed.");
  return data;
}
const descriptions: Record<Mode, string> = {
  "who-wins": "Find the best five cards.",
  "what-beats-me": "Which hands beat yours?",
  "pot-odds": "How much of the pot must you win to call?",
  equity: "Estimate your share of the pot.",
  decision: "Choose your next move.",
};
const destinations = [
  "Learn",
  "Practice",
  "Play",
  "Progress",
  "Reference",
] as const;
type Destination = (typeof destinations)[number];
const navigationPaths: Record<Destination, string> = {
  Learn:
    "M4 4h6a3 3 0 0 1 3 3v14a4 4 0 0 0-4-3H4z M13 7a3 3 0 0 1 3-3h5v14h-4a4 4 0 0 0-4 3",
  Practice: "M21 12a9 9 0 1 1-9-9 M16 12a4 4 0 1 1-4-4 M12 12l9-9 M17 3h4v4",
  Play: "M7 7V4h13v14h-3 M4 7h13v14H4z M8 13l2.5-3 2.5 3-2.5 3z",
  Progress: "M4 20h17 M7 16v-5 M12 16V7 M17 16V3",
  Reference: "M5 3h14v18H5z M9 7h6 M9 11h6 M9 15h3",
};
function App() {
  const [page, setPage] = useState<Destination>(() => {
    try {
      return localStorage.getItem("poker-practice-learning-view") === "cash"
        ? "Practice"
        : "Learn";
    } catch {
      return "Learn";
    }
  });
  return (
    <div className="app-shell">
      <a className="skip" href="#main">
        Skip to content
      </a>
      <header className="app-sidebar">
        <div className="brand">
          <span className="brand-mark" aria-hidden="true">
            ♠
          </span>
          <span>Poker Practice</span>
        </div>
        <nav aria-label="Main navigation">
          {destinations.map((p) => (
            <button
              key={p}
              aria-current={page === p ? "page" : undefined}
              onClick={() => {
                setPage(p);
                window.scrollTo(0, 0);
              }}
            >
              <svg
                aria-hidden="true"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.7"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <path d={navigationPaths[p]} />
              </svg>
              <span>{p}</span>
            </button>
          ))}
        </nav>
      </header>
      <main id="main" className="app-main" data-page={page.toLowerCase()}>
        {page === "Learn" ? (
          <Learn />
        ) : page === "Play" ? (
          <BotPractice />
        ) : page === "Practice" ? (
          <Practice />
        ) : page === "Progress" ? (
          <Progress />
        ) : (
          <Reference />
        )}
      </main>
    </div>
  );
}
function Practice() {
  const [cash, setCash] = useState(() => {
    try {
      return localStorage.getItem("poker-practice-learning-view") === "cash";
    } catch {
      return false;
    }
  });
  const cashTrigger = useRef<HTMLButtonElement>(null);
  const returning = useRef(false);
  useEffect(() => {
    if (!cash && returning.current) {
      cashTrigger.current?.focus();
      returning.current = false;
    }
  }, [cash]);
  if (cash)
    return (
      <CashPractice
        onBack={() => {
          try {
            localStorage.removeItem("poker-practice-learning-view");
          } catch {
            /* Browser storage is optional. */
          }
          returning.current = true;
          setCash(false);
        }}
      />
    );
  return (
    <PracticeExercises
      cashTrigger={cashTrigger}
      onOpenCash={() => {
        try {
          localStorage.setItem("poker-practice-learning-view", "cash");
        } catch {
          /* Browser storage is optional. */
        }
        setCash(true);
      }}
    />
  );
}
function PracticeExercises({
  onOpenCash,
  cashTrigger,
}: {
  onOpenCash: () => void;
  cashTrigger: React.RefObject<HTMLButtonElement | null>;
}) {
  const [mode, setMode] = useState<Mode>("who-wins"),
    [street, setStreet] = useState<"river" | "turn">("river"),
    [showdownStyle, setShowdownStyle] = useState<"random" | "balanced">(() =>
      localStorage.getItem("poker-practice-showdown-style") === "balanced"
        ? "balanced"
        : "random",
    ),
    [weak, setWeak] = useState(false);
  const [exercise, setExercise] = useState<Exercise | null>(null),
    [answer, setAnswer] = useState(""),
    [classifications, setClassifications] = useState<string[]>([]),
    [reason, setReason] = useState(""),
    [feedback, setFeedback] = useState<Feedback | null>(null),
    [state, setState] = useState<
      "loading" | "unanswered" | "submitting" | "answered" | "error"
    >("loading"),
    [error, setError] = useState("");
  const started = useRef(Date.now()),
    busy = useRef(false),
    feedbackRef = useRef<HTMLElement>(null);
  async function next(
    nextMode = mode,
    nextStreet = street,
    nextWeak = weak,
    nextStyle = showdownStyle,
  ) {
    if (busy.current) return;
    busy.current = true;
    setState("loading");
    setError("");
    setFeedback(null);
    setExercise(null);
    setAnswer("");
    setClassifications([]);
    setReason("");
    try {
      const e = await api<Exercise>("/exercises", {
        method: "POST",
        body: JSON.stringify({
          mode: nextMode,
          street: nextStreet,
          targetWeak: nextWeak,
          showdownStyle: nextStyle,
        }),
      });
      setExercise(e);
      setMode(e.mode);
      if (e.mode === "equity")
        setStreet(e.board?.length === 4 ? "turn" : "river");
      started.current = Date.now();
      setState("unanswered");
    } catch (err) {
      setError((err as Error).message);
      setState("error");
    } finally {
      busy.current = false;
    }
  }
  useEffect(() => {
    void next();
  }, []);
  useEffect(() => {
    if (feedback) feedbackRef.current?.focus();
  }, [feedback]);
  async function submit(event: React.FormEvent) {
    event.preventDefault();
    if (!exercise || busy.current || feedback) return;
    busy.current = true;
    setState("submitting");
    setError("");
    const value =
      exercise.mode === "what-beats-me"
        ? classifications
        : ["pot-odds", "equity"].includes(exercise.mode)
          ? Number(answer)
          : answer;
    try {
      const result = await api<{ feedback: Feedback }>(
        `/exercises/${exercise.id}/answer`,
        {
          method: "POST",
          body: JSON.stringify({
            answer: value,
            explanation: reason || undefined,
            timeMs: Math.min(86400000, Date.now() - started.current),
          }),
        },
      );
      setFeedback(result.feedback);
      setState("answered");
    } catch (err) {
      setError((err as Error).message);
      setState("error");
    } finally {
      busy.current = false;
    }
  }
  const locked = state === "loading" || state === "submitting",
    numeric = exercise && ["equity", "pot-odds"].includes(exercise.mode),
    valid =
      exercise?.mode === "what-beats-me"
        ? classifications.length === exercise.range!.length &&
          classifications.every(Boolean)
        : numeric
          ? answer.trim() !== "" &&
            Number.isFinite(Number(answer)) &&
            Number(answer) >= 0 &&
            Number(answer) <= 100
          : answer !== "";
  return (
    <>
      <div className="page-heading">
        <div>
          <h1>Practice</h1>
        </div>
        <button
          className={`secondary weak-button ${weak ? "selected" : ""}`}
          aria-pressed={weak}
          disabled={locked}
          onClick={() => {
            setWeak(!weak);
            void next(mode, street, !weak);
          }}
        >
          ↗ Practice my weak areas
        </button>
      </div>
      <section className="panel cash-entry">
        <div>
          <span className="eyebrow">Online cash · 2–9 seats</span>
          <h2>Online cash Decision Lab</h2>
          <p>Practice a river decision, then see why.</p>
        </div>
        <button
          ref={cashTrigger}
          className="secondary"
          onClick={onOpenCash}
          aria-label="Open online cash Decision Lab"
        >
          Open Decision Lab <span aria-hidden="true">↗</span>
        </button>
      </section>
      <div className="practice-layout">
        <aside className="mode-panel">
          <p className="eyebrow">PRACTICE MODES</p>
          <div className="mode-list" aria-label="Practice modes">
            {modes.map((m, i) => (
              <button
                className={mode === m ? "active" : ""}
                key={m}
                aria-label={modeLabels[m]}
                disabled={locked}
                aria-pressed={mode === m}
                onClick={() => {
                  setMode(m);
                  void next(m);
                }}
              >
                <span className="mode-number">0{i + 1}</span>
                <span>
                  <strong>{modeLabels[m]}</strong>
                  <small>{descriptions[m]}</small>
                </span>
                <span aria-hidden="true">→</span>
              </button>
            ))}
          </div>
        </aside>
        <section
          className="exercise-panel"
          aria-busy={locked}
          aria-label="Current exercise"
        >
          {mode === "who-wins" && (
            <div className="street-control">
              <label htmlFor="showdown-style">Showdown deals</label>
              <select
                id="showdown-style"
                value={showdownStyle}
                disabled={locked}
                onChange={(event) => {
                  const style = event.target.value as "random" | "balanced";
                  setShowdownStyle(style);
                  localStorage.setItem("poker-practice-showdown-style", style);
                  void next(mode, street, weak, style);
                }}
              >
                <option value="random">Random deals</option>
                <option value="balanced">Balanced hands</option>
              </select>
              <p className="quiet">
                {showdownStyle === "balanced"
                  ? "Practice each hand type equally. Rare hands appear more often."
                  : "Natural random deals from the full deck."}
              </p>
            </div>
          )}
          {mode === "equity" && (
            <div className="street-control">
              <label htmlFor="street">Street</label>
              <select
                id="street"
                value={street}
                disabled={locked}
                onChange={(e) => {
                  const s = e.target.value as "turn" | "river";
                  setStreet(s);
                  void next(mode, s);
                }}
              >
                <option value="river">River · start here</option>
                <option value="turn">Turn · one card to come</option>
              </select>
            </div>
          )}
          {state === "loading" ? (
            <div className="loading" role="status">
              Dealing your next exercise…
            </div>
          ) : (
            exercise && (
              <>
                <div className="exercise-top">
                  <span className="pill">{modeLabels[exercise.mode]}</span>
                  <span className="quiet">
                    {exercise.board?.length === 4 ? "Turn" : "River"} · Heads-up
                  </span>
                </div>
                <h2>{exercise.question}</h2>
                {exercise.context && (
                  <div className="context">
                    {exercise.context.map((c) => (
                      <p key={c}>{c}</p>
                    ))}
                  </div>
                )}
                {exercise.board && (
                  <div className="table-cards">
                    <div className="board">
                      <h3>Community cards</h3>
                      <Cards cards={exercise.board} />
                    </div>
                    <div className="players">
                      <div>
                        <h3>
                          {exercise.mode === "who-wins"
                            ? "Player 1"
                            : "Your hand"}
                        </h3>
                        <Cards cards={exercise.hero!} />
                      </div>
                      {exercise.villain && (
                        <div>
                          <h3>Player 2</h3>
                          <Cards cards={exercise.villain} />
                        </div>
                      )}
                    </div>
                  </div>
                )}
                {exercise.pot !== undefined && (
                  <div className="pot-grid">
                    <div>
                      <small>Pot before their bet</small>
                      <strong>${exercise.pot}</strong>
                    </div>
                    <div>
                      <small>Opponent’s bet</small>
                      <strong>${exercise.bet}</strong>
                    </div>
                    <div>
                      <small>Amount to call</small>
                      <strong>${exercise.call}</strong>
                    </div>
                  </div>
                )}
                {exercise.assumptions && (
                  <div className="assumptions">
                    <h3>For this hand</h3>
                    {exercise.assumptions.map((a) => (
                      <p key={a}>{a}</p>
                    ))}
                  </div>
                )}
                {exercise.mode === "equity" && (
                  <div className="range">
                    <h3>Possible opponent hands · equally likely</h3>
                    <div className="range-cards">
                      {exercise.range!.map((r) => (
                        <Cards key={r.join("")} cards={r} small />
                      ))}
                    </div>
                  </div>
                )}
                <form onSubmit={submit}>
                  <fieldset disabled={locked || !!feedback}>
                    <legend>
                      {exercise.mode === "what-beats-me"
                        ? "Classify each opponent hand"
                        : numeric
                          ? "Your estimate"
                          : "Your answer"}
                    </legend>
                    {exercise.mode === "what-beats-me" ? (
                      <div className="classifications">
                        {exercise.range!.map((r, i) => (
                          <div className="classification" key={r.join("")}>
                            <Cards cards={r} small />
                            <label className="sr-only" htmlFor={`class-${i}`}>
                              Classify {r.join(" ")}
                            </label>
                            <select
                              id={`class-${i}`}
                              required
                              value={classifications[i] ?? ""}
                              onChange={(e) => {
                                const values = exercise.range!.map(
                                  (_, j) => classifications[j] ?? "",
                                );
                                values[i] = e.target.value;
                                setClassifications(values);
                              }}
                            >
                              <option value="">Choose comparison…</option>
                              <option value="beats">Beats me</option>
                              <option value="ties">Ties me</option>
                              <option value="loses">Loses to me</option>
                            </select>
                          </div>
                        ))}
                      </div>
                    ) : numeric ? (
                      <div className="numeric-answer">
                        <label htmlFor="percentage">
                          {exercise.mode === "pot-odds"
                            ? "Required equity"
                            : "Estimated equity"}
                        </label>
                        <div>
                          <input
                            id="percentage"
                            type="number"
                            inputMode="decimal"
                            min="0"
                            max="100"
                            step="any"
                            required
                            placeholder="e.g. 35"
                            value={answer}
                            onChange={(e) => setAnswer(e.target.value)}
                          />
                          <span>%</span>
                        </div>
                        <small>Enter a percentage from 0 to 100.</small>
                      </div>
                    ) : (
                      <div className="answer-options">
                        {exercise.options?.map((option) => (
                          <label
                            key={option}
                            className={answer === option ? "chosen" : ""}
                          >
                            <input
                              type="radio"
                              name="answer"
                              value={option}
                              checked={answer === option}
                              onChange={() => setAnswer(option)}
                            />
                            {option}
                          </label>
                        ))}
                      </div>
                    )}
                    {exercise.mode === "decision" && (
                      <div className="reason">
                        <label htmlFor="reason">
                          Your reasoning{" "}
                          <span className="quiet">
                            (optional, saved but not graded)
                          </span>
                        </label>
                        <textarea
                          id="reason"
                          maxLength={1000}
                          value={reason}
                          onChange={(e) => setReason(e.target.value)}
                          placeholder="Which hands or assumptions influenced your choice?"
                        />
                      </div>
                    )}
                  </fieldset>
                  {!feedback && (
                    <div className="submit-row">
                      <button
                        className="primary"
                        disabled={!valid || locked}
                        type="submit"
                      >
                        {state === "submitting"
                          ? "Checking…"
                          : "Check my answer"}
                      </button>
                    </div>
                  )}
                </form>
                {feedback && (
                  <section
                    className="feedback"
                    tabIndex={-1}
                    ref={feedbackRef}
                    aria-label="Answer feedback"
                  >
                    <p className="eyebrow">
                      {feedback.kind === "illustrative"
                        ? "PRACTICE GUIDE"
                        : feedback.kind === "estimate"
                          ? "YOUR ESTIMATE"
                          : "RESULT"}
                    </p>
                    <h3>
                      {feedback.correct === undefined
                        ? ""
                        : feedback.correct
                          ? "✓ "
                          : "↳ "}
                      {feedback.result}
                    </h3>
                    {feedback.equity !== undefined && (
                      <div className="results-grid">
                        <div>
                          <small>
                            {exercise.mode === "pot-odds"
                              ? "Needed to call"
                              : "Pot share for these hands"}
                          </small>
                          <strong>{feedback.equity.toFixed(2)}%</strong>
                        </div>
                        <div>
                          <small>Your estimate</small>
                          <strong>{feedback.estimate?.toFixed(2)}%</strong>
                        </div>
                        <div>
                          <small>Absolute difference</small>
                          <strong>
                            {feedback.error?.toFixed(2)}
                            <em> pp</em>
                          </strong>
                        </div>
                      </div>
                    )}
                    <p className="feedback-explanation">
                      {feedback.explanation}
                    </p>
                    {feedback.calculation && (
                      <details>
                        <summary>Show the calculation</summary>
                        <p className="calculation">{feedback.calculation}</p>
                      </details>
                    )}
                    {feedback.hands && (
                      <div
                        className={`best-hands ${exercise.mode === "who-wins" ? "showdown-comparison" : ""}`}
                      >
                        {feedback.hands.map((h) => (
                          <div
                            className={`hand-result ${h.outcome ?? ""}`}
                            key={h.label}
                          >
                            {h.outcome && (
                              <span className="hand-outcome">
                                {h.outcome === "winner"
                                  ? "Stronger hand"
                                  : h.outcome === "loser"
                                    ? "Weaker hand"
                                    : "Equal hand · split pot"}
                              </span>
                            )}
                            <h4>
                              {h.label} · {h.name}
                            </h4>
                            {h.summary && (
                              <p className="hand-summary">{h.summary}</p>
                            )}
                            <Cards
                              cards={h.cards}
                              small={exercise.mode !== "who-wins"}
                              highlighted={h.decisiveCards}
                            />
                          </div>
                        ))}
                      </div>
                    )}
                    {exercise.mode === "who-wins" &&
                      feedback.hands?.some((h) => h.decisiveCards?.length) && (
                        <p className="quiet">
                          Outlined cards decide the result.
                        </p>
                      )}
                    {feedback.rangeResults && (
                      <details>
                        <summary>Results for each hand</summary>
                        <div className="table-scroll">
                          <table>
                            <caption>
                              Results against each opponent combination
                            </caption>
                            <thead>
                              <tr>
                                <th scope="col">Hand</th>
                                <th scope="col">Your equity</th>
                                <th scope="col">Win / tie / rivers</th>
                              </tr>
                            </thead>
                            <tbody>
                              {feedback.rangeResults.map((r) => (
                                <tr key={r.combo.join("")}>
                                  <td>
                                    <Cards cards={r.combo} small />
                                  </td>
                                  <td>{r.equity.toFixed(2)}%</td>
                                  <td>
                                    {r.wins} / {r.ties} / {r.total}
                                  </td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </div>
                      </details>
                    )}
                    {feedback.stronger && (
                      <details>
                        <summary>
                          Reveal possible stronger hand categories
                        </summary>
                        <p>
                          {feedback.stronger.length
                            ? feedback.stronger.join(", ")
                            : "No stronger hand is possible."}
                        </p>
                        <p>
                          Possible does not mean likely. Better kickers can also
                          win within the same hand type.
                        </p>
                      </details>
                    )}
                    <button className="primary" onClick={() => void next()}>
                      Next exercise <span aria-hidden="true">→</span>
                    </button>
                  </section>
                )}
                {(exercise.provenance ||
                  exercise.selection ||
                  exercise.objective) && (
                  <details className="provenance">
                    <summary>About this scenario</summary>
                    {exercise.objective && <p>{exercise.objective}</p>}
                    {exercise.selection && <p>{exercise.selection}</p>}
                    {exercise.provenance && (
                      <p>
                        {exercise.provenance}. {exercise.limitations}
                      </p>
                    )}
                  </details>
                )}
              </>
            )
          )}
          {error && (
            <div className="error" role="alert">
              <p>{error}</p>
              {!exercise && (
                <button className="secondary" onClick={() => void next()}>
                  Try again
                </button>
              )}
            </div>
          )}
        </section>
      </div>
    </>
  );
}
function Progress() {
  const [data, setData] = useState<ProgressData | null>(null),
    [error, setError] = useState(""),
    [clearing, setClearing] = useState(false);
  const dialog = useRef<HTMLDialogElement>(null);
  async function load() {
    try {
      setData(await api<ProgressData>("/progress"));
      setError("");
    } catch (err) {
      setError((err as Error).message);
    }
  }
  useEffect(() => {
    void load();
  }, []);
  async function clear() {
    setClearing(true);
    try {
      await api("/progress", { method: "DELETE" });
      dialog.current?.close();
      await load();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setClearing(false);
    }
  }
  return (
    <>
      <div className="page-heading">
        <div>
          <h1>Progress</h1>
        </div>
        <a className="secondary" href="/api/export" download>
          Export JSON ↓
        </a>
      </div>
      {error && (
        <div className="error" role="alert">
          {error}
          <button onClick={() => void load()}>Retry</button>
        </div>
      )}
      {!data ? (
        <p role="status">Loading progress…</p>
      ) : (
        <>
          <div className="progress-overview">
            <LearningPathProgressSummary refresh={data} />
            <CashProgressSummary refresh={data} />
          </div>
          <section className="progress-summary">
            <div>
              <p className="eyebrow">EXERCISES COMPLETED</p>
              <strong>{data.total}</strong>
            </div>
            <div>
              <h2>Skills needing practice</h2>
              <p className="quiet">Based on your last 100 answers.</p>
              {data.skills.filter((s) => s.mistakes > 0).length ? (
                <ul className="skill-list">
                  {data.skills
                    .filter((s) => s.mistakes > 0)
                    .slice(0, 5)
                    .map((s) => (
                      <li key={s.tag}>
                        <span>{s.tag}</span>
                        <span>
                          {s.mistakes} misses / {s.attempts} attempts
                        </span>
                      </li>
                    ))}
                </ul>
              ) : (
                <p>No recent weaknesses recorded.</p>
              )}
            </div>
          </section>
          <details className="panel practice-stats">
            <summary>Detailed practice stats</summary>
            <LearningProgressSummary refresh={data} />
            <div className="progress-columns">
              <section className="panel">
                <h2>Answer accuracy</h2>
                <p className="quiet">Correct for the practice situation.</p>
                {data.categorical.map((m) => (
                  <div className="metric" key={m.mode}>
                    <div>
                      <strong>{modeLabels[m.mode]}</strong>
                      <span>
                        {m.attempts ? `${m.accuracy.toFixed(0)}%` : "—"}
                      </span>
                    </div>
                    <progress
                      aria-label={`${modeLabels[m.mode]} accuracy`}
                      max="100"
                      value={m.accuracy}
                    />
                    <small>{m.attempts} attempts</small>
                  </div>
                ))}
              </section>
              <section className="panel">
                <h2>Estimation error</h2>
                <p className="quiet">
                  Lower means a closer estimate. "pp" means percentage points.
                </p>
                {data.numeric.map((m) => (
                  <div className="metric" key={m.mode}>
                    <div>
                      <strong>{modeLabels[m.mode]}</strong>
                      <span>
                        {m.attempts ? `${m.averageError.toFixed(2)} pp` : "—"}
                      </span>
                    </div>
                    <small>
                      {m.attempts} attempts
                      {m.mode === "pot-odds"
                        ? " · answers within 0.5 pp are accepted"
                        : ""}
                    </small>
                  </div>
                ))}
              </section>
            </div>
            <section className="panel recent">
              <h2>Recent practice</h2>
              {data.recent.length ? (
                <div className="table-scroll">
                  <table>
                    <thead>
                      <tr>
                        <th scope="col">Exercise</th>
                        <th scope="col">Result</th>
                        <th scope="col">When</th>
                      </tr>
                    </thead>
                    <tbody>
                      {data.recent.map((a) => (
                        <tr key={a.id}>
                          <td>
                            {modeLabels[a.mode]}
                            <small>{a.tags.join(" · ")}</small>
                          </td>
                          <td>
                            {a.feedback.kind === "estimate"
                              ? `${a.feedback.error?.toFixed(2)} pp error`
                              : a.feedback.correct
                                ? "Supported / correct"
                                : "Review needed"}
                          </td>
                          <td>
                            {new Date(a.date).toLocaleString()}
                            <small>{Math.round(a.timeMs / 1000)} seconds</small>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ) : (
                <p>Your completed exercises will appear here.</p>
              )}
              <h3>Recent sessions</h3>
              <div className="session-list">
                {data.sessions.map((s) => (
                  <span key={s.date}>
                    {s.date} · {s.attempts} attempts
                  </span>
                ))}
              </div>
            </section>
          </details>
          <details className="panel learning-data-section">
            <summary>Learning path data</summary>
            <LearningPathDataControls
              onChange={async () => {
                const next = await api<ProgressData>("/progress");
                setData(next);
              }}
            />
          </details>
          <div className="clear-row">
            <button
              className="secondary"
              onClick={() => dialog.current?.showModal()}
            >
              Clear progress
            </button>
          </div>
        </>
      )}
      <dialog ref={dialog}>
        <h2>Clear your progress?</h2>
        <p>
          This deletes your practice history. Export it first to keep a copy.
        </p>
        <div className="dialog-actions">
          <button
            className="secondary"
            disabled={clearing}
            onClick={() => dialog.current?.close()}
          >
            Keep progress
          </button>
          <button
            className="primary"
            disabled={clearing}
            onClick={() => void clear()}
          >
            {clearing ? "Clearing…" : "Clear all progress"}
          </button>
        </div>
      </dialog>
    </>
  );
}
const reference = [
  [
    "Preflop opening charts",
    "An opening chart groups the 1,326 possible starting combinations into 169 hand classes. Pairs lie on the diagonal; s means suited and o means offsuit. An opening percentage describes how many combinations the guide raises, not your chance of winning. The local library provides illustrative raise/fold opening baselines for 2-, 6-, and 9-player tables. It does not cover limpers, earlier raises, re-raises, or postflop decisions. These are not solved strategies or poker-skill grades.",
  ],
  [
    "Hand rankings",
    "Strongest to weakest: straight flush, four of a kind, full house, flush, straight, three of a kind, two pair, one pair, high card. A royal flush is an ace-high straight flush. Use the best five cards out of your two hole cards and the five community cards. An ace can be low in A–2–3–4–5 or high in 10–J–Q–K–A; a straight cannot wrap around.",
  ],
  [
    "Kickers and ties",
    "A kicker is an unpaired card used to break a tie between otherwise equal hands. Compare the made-hand ranks first, then remaining cards from highest to lowest. With two pair, compare the higher pair, then the lower pair, then the kicker. With full houses, compare the three-of-a-kind rank, then the pair. Flushes compare all five ranks in order. If the best five-card ranks are identical, split the pot. Suits do not break ties. Sometimes the board plays for both players.",
  ],
  [
    "Range versus exact hand",
    "An exact hand is one specific two-card combination, such as ace of spades and king of hearts. A range is a set of possible hands. In these equity exercises, each listed legal combination has equal weight. Known cards block combinations containing those cards. A uniformly random legal hand does not represent the range an opponent has after betting. Possible does not mean likely.",
  ],
  [
    "Value bets and bluffs",
    "A value bet aims to get called by weaker hands. A bluff aims to make better hands fold. A medium-strength hand may prefer checking when weaker hands fold and stronger hands call. To compare betting expected values, specify how often each opponent response happens and the net payout for each response. Equity alone cannot tell you the EV of a bet.",
  ],
  [
    "Pot odds",
    "Required equity = amount to call ÷ (pot after opponent’s bet + your call). If the pot was $100 and the opponent bets $50, you call $50 to make a final pot of $200: 50 ÷ 200 = 25%. This is the break-even equity for a simple river or all-in call, excluding rake, side pots and unequal all-ins. Earlier-street future bets can change whether calling is worthwhile.",
  ],
  [
    "Equity",
    "Equity is probability of winning plus half the probability of tying in a heads-up pot. It is always measured against a specified opponent hand or range and legal remaining cards. These exercises enumerate exact river outcomes and all legal rivers on the turn. Equity is not necessarily the probability of improving your hand.",
  ],
  [
    "Outs",
    "Outs are unseen cards that improve your hand in a useful way. A four-card flush draw often has nine flush-completing cards, but some may make an opponent a full house or be blocked by their hole cards. Improving does not necessarily mean winning. Count clean outs in the situation, rather than assuming every improvement is good.",
  ],
  [
    "Rule of 2 and 4",
    "Outs × 2 roughly estimates improvement on the next card. Flop outs × 4 roughly estimates improvement by the river when seeing both remaining cards. These are approximations, especially with many outs. Nine outs is roughly 18% for the next card or 36% across two cards. Improving does not necessarily mean winning. Future bets can change whether calling a draw is worthwhile.",
  ],
  [
    "How feedback works",
    "Who wins, hand comparisons, pot odds and equity use deterministic server-side calculations. Decision examples marked Calculated result define probabilities, responses and payouts. Illustrative strategy is an authored teaching recommendation under simplified assumptions; multiple answers can be supported. These are original educational examples, not solver output, GTO claims, or expert-approved advice.",
  ],
];
const referenceSummaries: Record<string, string> = {
  "Preflop opening charts":
    "A practice guide for whether to raise or fold when nobody has entered the pot. 's' means suited; 'o' means offsuit.",
  "Hand rankings":
    "Strongest to weakest: straight flush, four of a kind, full house, flush, straight, three of a kind, two pair, one pair, high card. Use your best five cards.",
  "Kickers and ties":
    "If the main hand is tied, compare the remaining cards, highest first. Identical best five cards split the pot; suits do not break ties.",
  "Range versus exact hand":
    "A range is the set of hands an opponent could have. Possible does not mean equally likely.",
  "Value bets and bluffs":
    "Bet for value when weaker hands can call. Bluff when better hands can fold.",
  "Pot odds":
    "For a simple closing call, divide the call cost by the final pot to find your required pot share. A $50 call into a $150 pot needs 25%, before rake.",
  Equity:
    "Your expected share of the pot against an opponent's hand or range, including split pots.",
  Outs: "Unseen cards that help your hand. Improving your hand does not always mean winning.",
  "Rule of 2 and 4":
    "Outs × 2 estimates improvement on the next card. Outs × 4 estimates improvement across flop-to-river if you see both cards.",
  "How feedback works":
    "Math answers use the stated cards and ranges. Strategy guides are practice examples, not proof of the best play.",
};
function Reference() {
  const [query, setQuery] = useState("");
  const [tool, setTool] = useState<"legacy" | "preflop" | null>(null);
  const legacyTrigger = useRef<HTMLButtonElement>(null);
  const preflopTrigger = useRef<HTMLButtonElement>(null);
  const toolReturn = useRef<"legacy" | "preflop" | null>(null);
  useEffect(() => {
    if (!tool && toolReturn.current) {
      (toolReturn.current === "legacy"
        ? legacyTrigger
        : preflopTrigger
      ).current?.focus();
      toolReturn.current = null;
    }
  }, [tool]);
  if (tool)
    return (
      <>
        <button
          className="secondary reference-back"
          onClick={() => setTool(null)}
        >
          Back to reference
        </button>
        {tool === "legacy" ? (
          <EarlierLearn />
        ) : (
          <PreflopWalkthrough onLibrary={() => setTool("legacy")} />
        )}
      </>
    );
  const items = reference.filter((r) =>
    r.join(" ").toLowerCase().includes(query.toLowerCase()),
  );
  return (
    <>
      <div className="page-heading">
        <div>
          <h1>Reference</h1>
        </div>
      </div>
      <section
        className="panel reference-tools"
        aria-label="Guided reference tools"
      >
        <div>
          <h2>Guided reference tools</h2>
          <p className="quiet">
            Explore an example or revisit earlier lessons.
          </p>
        </div>
        <div className="button-row">
          <button
            ref={preflopTrigger}
            className="secondary"
            aria-label="Open preflop walkthrough"
            onClick={() => {
              toolReturn.current = "preflop";
              setTool("preflop");
            }}
          >
            Preflop walkthrough
          </button>
          <button
            ref={legacyTrigger}
            className="secondary"
            aria-label="Open legacy lessons"
            onClick={() => {
              toolReturn.current = "legacy";
              setTool("legacy");
            }}
          >
            Earlier lessons
          </button>
        </div>
      </section>
      <div className="search">
        <label htmlFor="search">Find a concept</label>
        <input
          id="search"
          type="search"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search rankings, equity, outs…"
        />
      </div>
      <div className="reference-grid">
        {items.map(([title, text]) => (
          <section className="panel" key={title}>
            <h2>{title}</h2>
            <p>{referenceSummaries[title]}</p>
            <details>
              <summary>More details</summary>
              <p>{text}</p>
            </details>
          </section>
        ))}
      </div>
      {(query.trim() === "" ||
        /preflop|opening|chart|starting|range/i.test(query)) && (
        <details className="panel" open={query.trim() !== ""}>
          <summary>Opening charts</summary>
          <OpeningChartLibrary />
        </details>
      )}
      {!items.length && <p>No concepts match this search.</p>}
    </>
  );
}
createRoot(document.getElementById("root")!).render(<App />);
