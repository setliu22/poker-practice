import { PreflopWalkthrough } from "./PreflopWalkthrough";
import { ReadLesson, ReadProgressSummary } from "./ReadLesson";
import { useEffect, useRef, useState } from "react";
import { Cards } from "./Cards";
import { CashPractice } from "./CashPractice";
import type {
  LearningQuestion,
  LearningFeedback,
  LearningProgress,
} from "../../../packages/shared/src/learning";
async function request<T>(path: string, body?: unknown): Promise<T> {
  const r = await fetch(
    `/api/learning${path}`,
    body === undefined
      ? undefined
      : {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
        },
  );
  const data = await r.json();
  if (!r.ok) throw new Error(data.error ?? "Unable to load the lesson.");
  return data;
}
function EarlierLearn() {
  const [reading, setReading] = useState(false);
  const [screen, setScreen] = useState<"lesson" | "exercise" | "complete">(
      "lesson",
    ),
    [question, setQuestion] = useState<LearningQuestion | null>(null),
    [feedback, setFeedback] = useState<LearningFeedback | null>(null),
    [action, setAction] = useState<"bet" | "check" | "">(""),
    [reason, setReason] = useState<"weaker-call" | "stronger-only" | "">(""),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(""),
    [failedLoad, setFailedLoad] = useState<number | null>(null),
    [progress, setProgress] = useState<LearningProgress | null>(null),
    [missed, setMissed] = useState<number[]>([]),
    [review, setReview] = useState<number[] | null>(null),
    [results, setResults] = useState<LearningFeedback[]>([]);
  const started = useRef(Date.now()),
    lock = useRef(false),
    focus = useRef<HTMLHeadingElement>(null);
  const loadProgress = () =>
    request<LearningProgress>("/progress")
      .then(setProgress)
      .catch(() => {});
  useEffect(() => {
    void loadProgress();
  }, []);
  useEffect(() => {
    focus.current?.focus();
  }, [screen, question?.id, feedback]);
  async function load(index: number) {
    if (lock.current) return;
    lock.current = true;
    setBusy(true);
    setError("");
    setFailedLoad(index);
    try {
      const q = await request<LearningQuestion>("/questions", { index });
      setFailedLoad(null);
      setQuestion(q);
      setFeedback(null);
      setAction("");
      setReason("");
      setScreen("exercise");
      started.current = Date.now();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      lock.current = false;
      setBusy(false);
    }
  }
  async function submit() {
    if (lock.current || !question || !action || !reason || feedback) return;
    lock.current = true;
    setBusy(true);
    setError("");
    try {
      const f = await request<LearningFeedback>(
        `/questions/${question.id}/answer`,
        { action, reason, timeMs: Math.max(0, Date.now() - started.current) },
      );
      setFeedback(f);
      setResults((r) => [...r, f]);
      if (!f.actionCorrect || !f.reasonCorrect)
        setMissed((m) =>
          m.includes(question.index) ? m : [...m, question.index],
        );
      void loadProgress();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      lock.current = false;
      setBusy(false);
    }
  }
  function next() {
    if (!question) return;
    if (review) {
      const rest = review.slice(1);
      setReview(rest);
      if (rest.length) void load(rest[0]);
      else setScreen("complete");
    } else if (question.index + 1 < question.total)
      void load(question.index + 1);
    else setScreen("complete");
  }
  if (reading) return <ReadLesson onBack={() => setReading(false)} />;
  return (
    <div className="learning-layout">
      <div className="page-heading">
        <div>
          <span className="eyebrow">Learn · Module 1</span>
          <h1 ref={focus} tabIndex={-1}>
            {screen === "lesson"
              ? "Should I bet or check?"
              : screen === "complete"
                ? "Your lesson review"
                : (question?.title ?? "Loading exercise…")}
          </h1>
        </div>
      </div>
      {error && (
        <p role="alert">
          {error}{" "}
          <button
            onClick={() =>
              failedLoad !== null ? void load(failedLoad) : void submit()
            }
          >
            Try again
          </button>
        </p>
      )}
      {screen === "lesson" && (
        <>
          <section className="panel">
            <h2>All-in decision practice</h2>
            <p>
              Practice varied draws against explicit ranges, compare the call
              price, and test the same hand at a different price.
            </p>
            <button className="primary" onClick={() => setReading(true)}>
              Open all-in decision practice
            </button>
          </section>
          <section className="panel learning-lesson">
            <h2>Find the hands that would pay you</h2>
            <p>
              A <strong>value bet</strong> aims to get called by weaker hands.
              Having a strong hand is a starting point; you still need to ask
              which hands your opponent will call with.
            </p>
            <p>
              If weaker hands fold and stronger hands call, checking can earn
              more on average. Checking keeps the weaker hands in the showdown
              without putting more chips at risk against stronger hands.
            </p>
            <p>
              In this lesson, you get an exact opponent range—a list of possible
              hands—and their responses. Choose a move, then identify what your
              bet would accomplish.
            </p>
            <div className="learning-example">
              <strong>Ask before betting:</strong>
              <p>“Which hands do I beat, and would those hands call?”</p>
            </div>
            <p className="quiet">
              8 short river exercises · No timer · Exact calculations under
              stated responses. Free-play opponents require estimates.
            </p>
            <button
              className="primary"
              disabled={busy}
              onClick={() => {
                setResults([]);
                setMissed([]);
                setReview(null);
                void load(0);
              }}
            >
              {busy ? "Loading…" : "Start lesson"}
            </button>
          </section>
          {progress && progress.attempts > 0 && (
            <section className="panel">
              <h2>Saved learning progress</h2>
              <p>
                Decisions: {progress.decisionsCorrect}/{progress.attempts} ·
                Reasons: {progress.reasonsCorrect}/{progress.attempts}
              </p>
              <p>
                Both correct on transfer exercises:{" "}
                {progress.transferBothCorrect}/{progress.transferAttempts}.
                Transfer means applying the idea to a changed situation.
              </p>
            </section>
          )}
        </>
      )}
      {screen === "exercise" && question && (
        <section className="panel learning-exercise" aria-busy={busy}>
          <p className="quiet">
            {review ? "Revisit" : question.stage} · Exercise{" "}
            {question.index + 1} of {question.total}
          </p>
          <p>{question.change}</p>
          <p className="quiet">
            {question.context} · Pot {question.pot} · Bet option {question.bet}{" "}
            chips
          </p>
          <div className="learning-cards">
            <div>
              <h3>Your cards</h3>
              <Cards cards={question.hole} />
            </div>
            <div>
              <h3>Board</h3>
              <Cards cards={question.board} />
            </div>
          </div>
          <h3>Possible opponent hands</h3>
          <p className="quiet">
            Each combination is equally likely. If you check, all check back. If
            you bet {question.bet}:
          </p>
          <div className="learning-opponents">
            {question.opponents.map((o) => (
              <div className="learning-opponent" key={o.cards.join("")}>
                <Cards cards={o.cards} small />
                <span>
                  {o.response === "call" ? `Calls ${question.bet}` : "Folds"}
                </span>
              </div>
            ))}
          </div>
          <details>
            <summary>Complete assumptions</summary>
            <ul>
              {question.assumptions.map((a) => (
                <li key={a}>{a}</li>
              ))}
            </ul>
            <p>
              Original educational example. These response rules isolate value
              betting; they are not predictions of how everyone plays.
            </p>
          </details>
          {!feedback ? (
            <form
              onSubmit={(e) => {
                e.preventDefault();
                void submit();
              }}
            >
              <fieldset disabled={busy}>
                <legend>Which action earns more on average?</legend>
                <div className="learning-choices">
                  {(["check", "bet"] as const).map((a) => (
                    <label key={a}>
                      <input
                        type="radio"
                        name="learn-action"
                        checked={action === a}
                        onChange={() => setAction(a)}
                      />
                      {a === "check" ? "Check" : `Bet ${question.bet}`}
                    </label>
                  ))}
                </div>
              </fieldset>
              <fieldset disabled={busy}>
                <legend>What would your bet accomplish?</legend>
                <label>
                  <input
                    type="radio"
                    name="learn-reason"
                    checked={reason === "weaker-call"}
                    onChange={() => setReason("weaker-call")}
                  />
                  Get calls from weaker hands, although stronger hands may call
                  too
                </label>
                <label>
                  <input
                    type="radio"
                    name="learn-reason"
                    checked={reason === "stronger-only"}
                    onChange={() => setReason("stronger-only")}
                  />
                  Make weaker hands fold while stronger hands call
                </label>
              </fieldset>
              <button className="primary" disabled={busy || !action || !reason}>
                {busy ? "Checking your reasoning…" : "Check my reasoning"}
              </button>
            </form>
          ) : (
            <div
              className="learning-feedback"
              role="region"
              aria-label="Lesson feedback"
            >
              <h2 tabIndex={-1} ref={focus}>
                {feedback.best === "bet" ? `Bet ${question.bet}` : "Check"}{" "}
                earns more here
              </h2>
              <p>
                <strong>Decision:</strong>{" "}
                {feedback.actionCorrect ? "Correct" : "Needs revision"} ·{" "}
                <strong>Reason:</strong>{" "}
                {feedback.reasonCorrect ? "Correct" : "Needs revision"}
              </p>
              <p>{feedback.explanation}</p>
              <p>
                <strong>Takeaway:</strong> {feedback.takeaway}
              </p>
              <details>
                <summary>Show the exact calculation</summary>
                <p>
                  These are net chips from the current decision. A fold wins the
                  current pot. At showdown: pot share × final pot − your new
                  bet. Each branch has weight 1/{feedback.branches.length}.
                </p>
                <div className="learning-table-scroll">
                  <table>
                    <thead>
                      <tr>
                        <th>Opponent</th>
                        <th>Result</th>
                        <th>Response to bet</th>
                        <th>Check net</th>
                        <th>Bet net</th>
                      </tr>
                    </thead>
                    <tbody>
                      {feedback.branches.map((b) => (
                        <tr key={b.cards.join("")}>
                          <td>
                            <Cards cards={b.cards} small />
                          </td>
                          <td>{b.outcome}</td>
                          <td>{b.response}</td>
                          <td>{b.checkNet}</td>
                          <td>{b.betNet}</td>
                        </tr>
                      ))}
                    </tbody>
                    <tfoot>
                      <tr>
                        <th colSpan={3}>Average</th>
                        <td>{feedback.checkEv.toFixed(1)}</td>
                        <td>{feedback.betEv.toFixed(1)}</td>
                      </tr>
                    </tfoot>
                  </table>
                </div>
                <p>
                  A positive bet result alone does not make it best: compare it
                  with checking. These exact results depend on the stated
                  responses.
                </p>
              </details>
              <button className="primary" disabled={busy} onClick={next}>
                {busy
                  ? "Loading…"
                  : question.index === question.total - 1 ||
                      review?.length === 1
                    ? "Review lesson"
                    : "Next situation"}
              </button>
            </div>
          )}
        </section>
      )}
      {screen === "complete" && (
        <section className="panel">
          <h2>What to take into your next hand</h2>
          <p>
            Identify specific weaker hands that could call before you make a
            value bet. If they fold, compare checking with betting into stronger
            hands.
          </p>
          <p>
            This session: {results.filter((f) => f.actionCorrect).length}/
            {results.length} decisions and{" "}
            {results.filter((f) => f.reasonCorrect).length}/{results.length}{" "}
            reasons correct.
          </p>
          {missed.length > 0 ? (
            <>
              <p>
                You had trouble with {missed.length} situation
                {missed.length === 1 ? "" : "s"}. Revisit them and explain the
                calls before choosing.
              </p>
              <button
                className="primary"
                onClick={() => {
                  setReview([...missed]);
                  setMissed([]);
                  void load(missed[0]);
                }}
              >
                Revisit missed situations
              </button>
            </>
          ) : (
            <p>
              You answered both parts correctly throughout this session. Try the
              idea in bot practice; real opponents’ responses are uncertain.
            </p>
          )}
          <button className="secondary" onClick={() => setScreen("lesson")}>
            Back to lesson
          </button>
          {progress && (
            <p className="quiet">
              Saved across sessions: {progress.transferBothCorrect}/
              {progress.transferAttempts} transfer exercises with both parts
              correct.
            </p>
          )}
        </section>
      )}
    </div>
  );
}

export function LearningProgressSummary({ refresh }: { refresh: unknown }) {
  const [data, setData] = useState<LearningProgress | null>(null);
  useEffect(() => {
    let active = true;
    void request<LearningProgress>("/progress")
      .then((p) => {
        if (active) setData(p);
      })
      .catch(() => {});
    return () => {
      active = false;
    };
  }, [refresh]);
  if (!data?.attempts) return <ReadProgressSummary refresh={refresh} />;
  return (
    <section className="panel">
      <ReadProgressSummary refresh={refresh} />
      <h2>Learning progress</h2>
      <p>
        Decisions correct: {data.decisionsCorrect}/{data.attempts} · Reasons
        correct: {data.reasonsCorrect}/{data.attempts}
      </p>
      <p>
        Transfer exercises with both correct: {data.transferBothCorrect}/
        {data.transferAttempts}
      </p>
      <p className="quiet">
        These measure the stated lesson situations, separately from chip profit
        and free-play model estimates.
      </p>
      <ul>
        {data.recent.slice(0, 4).map((r, i) => (
          <li key={i}>
            {r.title} ·{" "}
            {r.actionCorrect && r.reasonCorrect
              ? "Both correct"
              : !r.reasonCorrect
                ? "Revisit the reason"
                : "Revisit the decision"}
          </li>
        ))}
      </ul>
    </section>
  );
}

export function Learn() {
  const [earlier, setEarlier] = useState(false);
  const [cash, setCash] = useState(() => {
    try {
      return localStorage.getItem("poker-practice-learning-view") === "cash";
    } catch {
      return false;
    }
  });
  if (cash)
    return (
      <CashPractice
        onBack={() => {
          try {
            localStorage.removeItem("poker-practice-learning-view");
          } catch {
            /* Browser storage is optional. */
          }
          setCash(false);
        }}
      />
    );
  if (earlier)
    return (
      <>
        <button className="secondary" onClick={() => setEarlier(false)}>
          Back to preflop walkthrough
        </button>
        <EarlierLearn />
      </>
    );
  return (
    <>
      <section className="panel cash-entry">
        <span className="eyebrow">Online cash · 2–9 seats</span>
        <h2>Online cash Decision Lab</h2>
        <p>
          Make a river decision before seeing feedback. Practice calls, value
          bets, bluffs and multiway pots, then revisit your reasoning with a
          fresh hand.
        </p>
        <button
          className="primary"
          onClick={() => {
            try {
              localStorage.setItem("poker-practice-learning-view", "cash");
            } catch {
              /* Browser storage is optional. */
            }
            setCash(true);
          }}
        >
          Open online cash Decision Lab
        </button>
      </section>
      <PreflopWalkthrough onLibrary={() => setEarlier(true)} />
    </>
  );
}
