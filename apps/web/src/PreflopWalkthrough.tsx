import { useEffect, useRef, useState } from "react";
import { Cards } from "./Cards";
import type { OpeningChart } from "../../../packages/shared/src/preflop";
import {
  baselineAction,
  preflopTransfer,
  walkthroughChart,
  walkthroughSeats,
  raisedPotExample,
} from "../../../packages/shared/src/preflop-walkthrough";
const titles = [
  "Watch the action reach you",
  "Make the first raise",
  "Try a different hand in early position",
  "Move back to the button",
  "Someone has already raised",
  "A re-raise needs a new total",
  "Try a fresh preflop hand",
];
export function PreflopWalkthrough({ onLibrary }: { onLibrary: () => void }) {
  const [charts, setCharts] = useState<OpeningChart[]>([]),
    [error, setError] = useState(""),
    [reload, setReload] = useState(0),
    [step, setStep] = useState(0),
    [furthest, setFurthest] = useState(0),
    [folds, setFolds] = useState(0),
    [answer, setAnswer] = useState(""),
    [feedback, setFeedback] = useState(false),
    [seed, setSeed] = useState(() => {
      const value = new Uint32Array(1);
      crypto.getRandomValues(value);
      return value[0];
    }),
    [practiceCount, setPracticeCount] = useState(0);
  const heading = useRef<HTMLHeadingElement>(null);
  useEffect(() => {
    const controller = new AbortController();
    setError("");
    void fetch("/api/preflop-charts", { signal: controller.signal })
      .then(async (r) => {
        if (!r.ok) throw new Error("Opening baselines could not load.");
        return (await r.json()) as OpeningChart[];
      })
      .then((data) => {
        if (
          !["Lojack", "Hijack", "Cutoff", "Button"].every((position) =>
            walkthroughChart(data, position),
          )
        )
          throw new Error("The six-player opening baseline is incomplete.");
        setCharts(data);
      })
      .catch((e) => {
        if (!controller.signal.aborted) setError((e as Error).message);
      });
    return () => controller.abort();
  }, [reload]);
  useEffect(() => {
    heading.current?.focus();
  }, [step, feedback, seed]);
  const fresh = charts.length ? preflopTransfer(charts, seed) : null;
  const position =
    step === 2
      ? "Lojack"
      : step === 6
        ? (fresh?.position ?? "Button")
        : "Button";
  const hero = walkthroughSeats.indexOf(position),
    raised = step === 4 || step === 5;
  const hole =
    step < 2
      ? ["Ks", "Qs"]
      : step < 4
        ? ["Kc", "Td"]
        : raised
          ? ["Ah", "Kh"]
          : (fresh?.hole ?? []);
  const hand =
    step < 2 ? "KQs" : step < 4 ? "KTo" : raised ? "AKs" : (fresh?.hand ?? "");
  const chart = walkthroughChart(charts, position);
  const expected =
    step === 0
      ? "unopened"
      : step === 4
        ? "25"
        : step === 5
          ? "40"
          : chart
            ? baselineAction(chart, hand)
            : "";
  const agrees = answer === expected;
  function navigate(target: number) {
    setStep(target);
    setFurthest((n) => Math.max(n, target));
    setAnswer("");
    setFeedback(false);
    setFolds(target === 0 ? 0 : 3);
  }
  function nextHand() {
    const value = new Uint32Array(1);
    crypto.getRandomValues(value);
    setSeed(value[0]);
    setPracticeCount((n) => n + 1);
    setAnswer("");
    setFeedback(false);
  }
  const feedbackText =
    step === 0
      ? "Everyone before the button folded. Only the blinds remain in the pot, so this is an unopened pot. The original table still has six seats: use the six-player button baseline."
      : step === 1
        ? "This illustrative baseline opens KQs from the button. Raise to 25 means your total bet is 25 chips (2.5 big blinds), not an extra25 on top of another bet. The blinds can still fold, call or re-raise."
        : step === 2
          ? "The same KTo is outside this baseline's Lojack opening range. Five players still have a decision after you. Folding agrees with this authored baseline; it is not proof that every real game requires a fold."
          : step === 3
            ? "KTo enters this baseline's button opening range. The hand did not become stronger: only two opponents, the blinds, are left to act. This baseline opens more hands later. You still need a plan if they call or raise."
            : step === 4
              ? "You have posted 0, so matching the cutoff's total25 costs 25. The cutoff has entered voluntarily with a raise: this is a response to an opening range, not a first-in opening decision. The opening chart does not choose your response here."
              : step === 5
                ? "The cutoff increased the bet from 10 to 25: a15-chip raise. The minimum full re-raise adds at least another 15, making your total 40. You may fold, call 25, or raise to 40 or more. Which is best depends on the raiser's range, price and the blinds still behind you; we are checking the betting rule, not inventing a strategy recommendation."
                : `${fresh?.hand} is ${fresh?.action === "raise" ? "inside" : "outside"} the six-player ${position} opening baseline. ${fresh?.action === "raise" ? "Raise to 25" : "Fold"} agrees with this baseline in the supplied unopened situation. This comparison is practice using a reference, not a poker skill score.`;
  return (
    <div className="learning-layout preflop-walkthrough">
      <div className="page-heading">
        <div>
          <span className="eyebrow">Learn · A guided preflop hand</span>
          <h1 ref={heading} tabIndex={-1}>
            {titles[step]}
          </h1>
          <p>
            Six players · 1,000-chip stacks · Blinds 5/10 · No antes or rake
          </p>
        </div>
      </div>
      <nav aria-label="Walkthrough progress" className="walkthrough-progress">
        {titles.map((title, index) => (
          <button
            key={title}
            className={index === step ? "primary" : "secondary"}
            aria-current={index === step ? "step" : undefined}
            disabled={index > furthest}
            onClick={() => navigate(index)}
          >
            {index + 1}
            <span className="sr-only">. {title}</span>
          </button>
        ))}
      </nav>
      {error ? (
        <section className="panel">
          <p role="alert">{error}</p>
          <button onClick={() => setReload((n) => n + 1)}>Retry loading</button>
        </section>
      ) : !chart ? (
        <p role="status">Loading the opening baseline…</p>
      ) : (
        <section className="panel walkthrough-scene">
          <div
            className="preflop-learning-table"
            aria-label="Six-player table and public action order"
          >
            <div className="learning-pot">
              <strong>Preflop</strong>
              <span>Pot: {raised ? 40 : 15} chips</span>
              <span>
                {raised ? "Cutoff raised to 25" : "Only the blinds are in"}
              </span>
            </div>
            {walkthroughSeats.map((seat, index) => {
              const folded =
                index < hero &&
                (step !== 0 || index < folds) &&
                !(raised && index === 2);
              const status =
                step === 0 && index === folds && folds < 3
                  ? "Acting now"
                  : index === hero
                    ? step === 0 && folds < 3
                      ? "Waiting"
                      : "Your turn"
                    : raised && index === 2
                      ? "Raised to 25"
                      : folded
                        ? "Folded"
                        : index === 4
                          ? "Posted 5"
                          : index === 5
                            ? "Posted 10"
                            : "Waiting";
              return (
                <div
                  className={`learning-seat seat-${index} ${index === hero ? "hero-seat" : ""} ${step === 0 && index === folds && folds < 3 ? "acting-seat" : ""} ${folded ? "folded-seat" : ""} ${raised && index === 2 ? "raised-seat" : ""}`}
                  key={seat}
                >
                  <strong>
                    {seat}
                    {seat === "Button" ? " · D" : ""}
                  </strong>
                  <span>{status}</span>
                  {index === hero && <Cards cards={hole} small />}
                </div>
              );
            })}
          </div>
          <div className="walkthrough-prompt">
            <p className="quiet">
              Step {step + 1} of 7
              {step === 6 ? ` · Transfer hand${practiceCount + 1}` : ""}
            </p>
            <h2>
              {step === 0
                ? "The button acts after the cutoff"
                : step === 1
                  ? "Worked example: K♠Q♠ on the button"
                  : step === 2
                    ? "K♣T♦ with five players still to act"
                    : step === 3
                      ? "K♣T♦ with only the blinds left"
                      : step === 4
                        ? "A raise changes the question"
                        : step === 5
                          ? "Separate the total bet from the raise amount"
                          : `Your turn: ${position}`}
            </h2>
            {step === 0 && folds < 3 ? (
              <>
                <p>
                  Follow the public action in order. The dealer button marks the
                  last non-blind seat to act before the flop.
                </p>
                <button
                  className="primary"
                  onClick={() => setFolds((n) => n + 1)}
                >
                  Watch {walkthroughSeats[folds]} fold
                </button>
              </>
            ) : (
              <>
                <p>
                  {step === 0
                    ? "Three folds reach you. Is this an unopened pot or a pot facing a raise?"
                    : step === 1
                      ? "The baseline includes this suited king–queen. Try its opening action: everyone before you folded, and you have not posted a blind."
                      : step === 2
                        ? "Now try king–ten offsuit from early position. Check the optional baseline hint, then choose its action."
                        : step === 3
                          ? "Everyone before the button folds. Does the baseline now include the exact same hand?"
                          : step === 4
                            ? "Lojack and hijack folded; cutoff raised to 25. You are on the button with A♥K♥ and have paid 0 this street. How many new chips would calling cost?"
                            : step === 5
                              ? "Blinds are5/10; the cutoff raised to 25. What is the minimum legal full re-raise total from the button?"
                              : "Everyone before you folded. Use position and the reference baseline to choose an opening action."}
                </p>
                {(step === 2 || step === 3 || step === 6) && (
                  <details>
                    <summary>Show the baseline for this hand</summary>
                    <p>
                      {hand}:{" "}
                      {baselineAction(chart, hand) === "raise"
                        ? "raise to 25"
                        : "fold"}{" "}
                      in the six-player {position} authored opening range.{" "}
                      {6 - hero - 1} players are still to act.
                    </p>
                  </details>
                )}
                {!feedback ? (
                  <form
                    onSubmit={(e) => {
                      e.preventDefault();
                      setFeedback(true);
                    }}
                  >
                    <fieldset>
                      <legend>
                        {step === 4
                          ? "Call cost"
                          : step === 5
                            ? "Re-raise total"
                            : step === 0
                              ? "Pot situation"
                              : "Action in this illustrative baseline"}
                      </legend>
                      <div className="learning-choices">
                        {(step === 0
                          ? [
                              { value: "unopened", label: "Unopened" },
                              { value: "raised", label: "Facing a raise" },
                            ]
                          : step === 4
                            ? [
                                { value: "15", label: "15 chips" },
                                { value: "25", label: "25 chips" },
                                { value: "40", label: "40 chips" },
                              ]
                            : step === 5
                              ? [
                                  { value: "25", label: "Raise to 25" },
                                  { value: "40", label: "Raise to 40" },
                                  { value: "50", label: "Raise to 50" },
                                ]
                              : [
                                  { value: "raise", label: "Raise to 25" },
                                  { value: "fold", label: "Fold" },
                                ]
                        ).map((choice) => (
                          <label key={choice.value}>
                            <input
                              type="radio"
                              name="walkthrough-choice"
                              checked={answer === choice.value}
                              onChange={() => setAnswer(choice.value)}
                            />
                            {choice.label}
                          </label>
                        ))}
                      </div>
                    </fieldset>
                    <button className="primary" disabled={!answer}>
                      Reveal why
                    </button>
                  </form>
                ) : (
                  <div
                    className="learning-feedback"
                    role="region"
                    aria-label="Walkthrough feedback"
                  >
                    <h3>
                      {agrees
                        ? step === 4 || step === 5 || step === 0
                          ? "That matches the situation"
                          : "That follows the baseline"
                        : step === 4 || step === 5 || step === 0
                          ? "Recheck the situation"
                          : "Compare with the baseline"}
                    </h3>
                    <p>{feedbackText}</p>
                    {raised && (
                      <div className="button-row">
                        <span>Fold · pay 0</span>
                        <span>Call · pay{raisedPotExample.callCost}</span>
                        <span>
                          Raise · total ≥ {raisedPotExample.minimumRaiseTo}
                        </span>
                      </div>
                    )}
                    <div className="button-row">
                      <button
                        className="primary"
                        onClick={() =>
                          step < 6 ? navigate(step + 1) : nextHand()
                        }
                      >
                        {step < 5
                          ? "Continue walkthrough"
                          : step === 5
                            ? "Try a fresh preflop hand"
                            : "Next preflop hand"}
                      </button>
                      <button
                        className="secondary"
                        onClick={() => {
                          setFeedback(false);
                          setAnswer("");
                        }}
                      >
                        Try this decision again
                      </button>
                    </div>
                  </div>
                )}
              </>
            )}
          </div>
          <div className="button-row">
            {step > 0 && (
              <button className="secondary" onClick={() => navigate(step - 1)}>
                Previous step
              </button>
            )}
            <button className="secondary" onClick={() => navigate(0)}>
              Replay walkthrough
            </button>
          </div>
        </section>
      )}
      <details className="panel">
        <summary>About this opening baseline</summary>
        <p>
          Raise/fold guidance from{" "}
          <a href={chart?.source.url}>PreflopR's authored opening ranges</a>,
          not a solver or a guarantee of the best move. Source stack depth and
          sizing are unspecified; 100 big blinds and raise-to 2.5 BB are this
          app's teaching assumptions. Only unopened first actions use the chart.
          No chart agreement is recorded as a skill grade.
        </p>
      </details>
      <details className="panel">
        <summary>More practice and earlier lessons</summary>
        <p>
          Optional river value-betting and all-in exercises. Your previous
          history is preserved.
        </p>
        <button className="secondary" onClick={onLibrary}>
          Open earlier exercises
        </button>
      </details>
    </div>
  );
}
