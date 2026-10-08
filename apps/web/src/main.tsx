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
const suitInfo: Record<string, { symbol: string; name: string }> = {
  c: { symbol: "♣", name: "clubs" },
  d: { symbol: "♦", name: "diamonds" },
  h: { symbol: "♥", name: "hearts" },
  s: { symbol: "♠", name: "spades" },
};
const rankNames: Record<string, string> = {
  A: "Ace",
  K: "King",
  Q: "Queen",
  J: "Jack",
  T: "10",
};
function Cards({
  cards,
  small = false,
  highlighted = [],
}: {
  cards: string[];
  small?: boolean;
  highlighted?: string[];
}) {
  return (
    <div className={`cards ${small ? "small" : ""}`}>
      {cards.map((c) => (
        <span
          className={`card suit-${c[1]} ${highlighted.includes(c) ? "decisive" : ""}`}
          key={c}
          aria-label={`${rankNames[c[0]] ?? c[0]} of ${suitInfo[c[1]].name}${highlighted.includes(c) ? ", deciding rank" : ""}`}
          role="img"
        >
          <span>{c[0] === "T" ? "10" : c[0]}</span>
          <span>{suitInfo[c[1]].symbol}</span>
        </span>
      ))}
    </div>
  );
}
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
  "what-beats-me": "Compare legal opponent hands.",
  "pot-odds": "Calculate the equity needed to call.",
  equity: "Estimate equity against an exact range.",
  decision: "Compare actions under stated assumptions.",
};
function App() {
  const [page, setPage] = useState<"Practice" | "Progress" | "Reference">(
    "Practice",
  );
  return (
    <>
      <a className="skip" href="#main">
        Skip to content
      </a>
      <header>
        <div className="brand">
          <span className="brand-mark" aria-hidden="true">
            ♠
          </span>
          <span>Poker Practice</span>
        </div>
        <nav aria-label="Main navigation">
          {(["Practice", "Progress", "Reference"] as const).map((p) => (
            <button
              key={p}
              aria-current={page === p ? "page" : undefined}
              onClick={() => setPage(p)}
            >
              {p}
            </button>
          ))}
        </nav>
        <span className="local-label">
          <span aria-hidden="true">●</span> Local learner
        </span>
      </header>
      <main id="main">
        {page === "Practice" ? (
          <Practice />
        ) : page === "Progress" ? (
          <Progress />
        ) : (
          <Reference />
        )}
      </main>
      <footer>
        <span>Heads-up · No-limit Texas Hold’em · Stored on this device</span>
      </footer>
    </>
  );
}
function Practice() {
  const [mode, setMode] = useState<Mode>("who-wins"),
    [street, setStreet] = useState<"river" | "turn">("river"),
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
  async function next(nextMode = mode, nextStreet = street, nextWeak = weak) {
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
                {exercise.selection && (
                  <p className="selection-note">{exercise.selection}</p>
                )}
                <h2>{exercise.question}</h2>
                {exercise.objective && (
                  <p className="objective">
                    Learning objective: {exercise.objective}
                  </p>
                )}
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
                    <h3>Stated assumptions</h3>
                    {exercise.assumptions.map((a) => (
                      <p key={a}>{a}</p>
                    ))}
                  </div>
                )}
                {exercise.mode === "equity" && (
                  <div className="range">
                    <h3>Opponent’s exact range · equal weights</h3>
                    <div className="range-cards">
                      {exercise.range!.map((r) => (
                        <Cards key={r.join("")} cards={r} small />
                      ))}
                    </div>
                    <p className="quiet">
                      These combinations define this exercise’s range.
                    </p>
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
                      <span className="quiet">
                        Feedback appears after you answer.
                      </span>
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
                        ? "ILLUSTRATIVE STRATEGY"
                        : feedback.kind === "estimate"
                          ? "EXACT EQUITY · ESTIMATION FEEDBACK"
                          : "CALCULATED RESULT"}
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
                              ? "Required equity"
                              : "Exact equity"}
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
                      <p className="calculation">{feedback.calculation}</p>
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
                          Outlined cards show the deciding rank or kicker when
                          both players have the same hand category.
                        </p>
                      )}
                    {feedback.rangeResults && (
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
                          Derived by checking all legal opponent combinations. A
                          stronger hand in the same category may have better
                          kickers. Possible does not mean likely; a uniform
                          random hand is not a betting range.
                        </p>
                      </details>
                    )}
                    <div className="takeaway">
                      <strong>Takeaway</strong>
                      <p>{feedback.takeaway}</p>
                    </div>
                    <button className="primary" onClick={() => void next()}>
                      Next exercise <span aria-hidden="true">→</span>
                    </button>
                  </section>
                )}
                {exercise.provenance && (
                  <details className="provenance">
                    <summary>About this scenario</summary>
                    <p>
                      {exercise.provenance}. {exercise.limitations}
                    </p>
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
          <section className="progress-summary">
            <div>
              <p className="eyebrow">EXERCISES COMPLETED</p>
              <strong>{data.total}</strong>
            </div>
            <div>
              <h2>Skills needing practice</h2>
              <p className="quiet">
                Last 100 attempts. Equity estimates over 5 percentage points
                count as a miss.
              </p>
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
          <div className="progress-columns">
            <section className="panel">
              <h2>Answer accuracy</h2>
              <p className="quiet">
                Decision accuracy means a supported choice under the given
                assumptions.
              </p>
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
                Average absolute error in percentage points. Lower means closer.
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
                          <small>
                            {Math.round(a.timeMs / 1000)} seconds · for context
                            only
                          </small>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : (
              <p>Your completed exercises will appear here.</p>
            )}
            <h3>
              Recent sessions{" "}
              <span className="quiet">(grouped by UTC day)</span>
            </h3>
            <div className="session-list">
              {data.sessions.map((s) => (
                <span key={s.date}>
                  {s.date} · {s.attempts} attempts
                </span>
              ))}
            </div>
          </section>
          <div className="clear-row">
            <p>Your progress stays in the local SQLite database.</p>
            <button
              className="secondary"
              disabled={!data.total}
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
          This permanently removes all local attempts and exercises. Export JSON
          first if you want a copy.
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
function Reference() {
  const [query, setQuery] = useState("");
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
            <p>{text}</p>
          </section>
        ))}
      </div>
      {!items.length && <p>No concepts match this search.</p>}
    </>
  );
}
createRoot(document.getElementById("root")!).render(<App />);
