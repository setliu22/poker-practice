import { useEffect, useMemo, useRef, useState } from "react";
import { Cards } from "./Cards";
import type { OpeningChart } from "../../../packages/shared/src/preflop";
import {
  baselineAction,
  generateWalkthrough,
  preflopTransfer,
  walkthroughChart,
  walkthroughSeatsFor,
} from "../../../packages/shared/src/preflop-walkthrough";
const titles = [
  "Watch the action reach you",
  "Choose an opening action",
  "Try a different hand in early position",
  "Move back to the button",
  "Someone has already raised",
  "A re-raise needs a new total",
  "Try a fresh preflop hand",
];
function randomSeed() {
  return crypto.getRandomValues(new Uint32Array(1))[0];
}
const sizingExplanation =
  "Deciding whether to open uses the hand and position. Choosing the size is a separate decision: this app illustrates 25 chips (2.5 BB) for every hand in the opening range. Hand strength does not set that size. Real position, stacks, rake and opponent responses affect the choice; this chart does not prove an optimal size.";
export function PreflopWalkthrough({ onLibrary }: { onLibrary: () => void }) {
  const [charts, setCharts] = useState<OpeningChart[]>([]),
    [error, setError] = useState(""),
    [reload, setReload] = useState(0),
    [players, setPlayers] = useState<6 | 9>(9),
    [step, setStep] = useState(0),
    [furthest, setFurthest] = useState(0),
    [folds, setFolds] = useState(0),
    [answer, setAnswer] = useState(""),
    [feedback, setFeedback] = useState(false),
    [seed, setSeed] = useState(randomSeed),
    [transferSeed, setTransferSeed] = useState(seed),
    [practiceCount, setPracticeCount] = useState(0);
  const heading = useRef<HTMLHeadingElement>(null);
  const recentContexts = useRef<string[]>([]);
  const recentTransfers = useRef<string[]>([]);
  useEffect(() => {
    const controller = new AbortController();
    setError("");
    setCharts([]);
    void fetch("/api/preflop-charts", { signal: controller.signal })
      .then(async (r) => {
        if (!r.ok) throw new Error("Opening baselines could not load.");
        return (await r.json()) as OpeningChart[];
      })
      .then((data) => {
        for (const count of [6, 9] as const) {
          if (
            !walkthroughSeatsFor(count)
              .slice(0, -2)
              .every((position) => walkthroughChart(data, position, count))
          )
            throw new Error(
              `The ${count}-player opening baseline is incomplete.`,
            );
        }
        if (!controller.signal.aborted) setCharts(data);
      })
      .catch((e) => {
        if (!controller.signal.aborted) setError((e as Error).message);
      });
    return () => controller.abort();
  }, [reload]);
  useEffect(() => {
    heading.current?.focus();
  }, [step, feedback, seed, transferSeed, players]);
  const context = useMemo(
    () => (charts.length ? generateWalkthrough(charts, seed, players) : null),
    [charts, seed, players],
  );
  const fresh = useMemo(
    () =>
      charts.length ? preflopTransfer(charts, transferSeed, players) : null,
    [charts, transferSeed, players],
  );
  const seats = context?.seats ?? walkthroughSeatsFor(players);
  const position =
    step === 2
      ? (context?.contrast.earlyPosition ?? seats[0])
      : step === 6
        ? (fresh?.position ?? "Button")
        : "Button";
  const hero = seats.indexOf(position),
    button = seats.indexOf("Button"),
    cutoff = seats.indexOf("Cutoff");
  const raised = step === 4 || step === 5;
  const example =
    step < 2
      ? context?.opening
      : step < 4
        ? context?.contrast
        : raised
          ? context?.raised
          : fresh;
  const hole = example?.hole ?? [],
    hand = example?.hand ?? "";
  const chart = walkthroughChart(charts, position, players);
  const expected =
    step === 0
      ? "unopened"
      : step === 4
        ? String(context?.raised.callCost)
        : step === 5
          ? String(context?.raised.minimumRaiseTo)
          : chart
            ? baselineAction(chart, hand)
            : "";
  const agrees = answer === expected;
  function clearAnswer() {
    setAnswer("");
    setFeedback(false);
  }
  function navigate(target: number) {
    setStep(target);
    setFurthest((n) => Math.max(n, target));
    clearAnswer();
    setFolds(0);
  }
  function newWalkthrough(count: 6 | 9 = players) {
    if (!context) return;
    const avoid = [...recentContexts.current, context.fingerprint];
    const base = randomSeed();
    let candidate = base;
    for (let attempt = 0; attempt < 128; attempt++) {
      candidate = (base + Math.imul(attempt, 0x9e3779b9)) >>> 0;
      if (
        !avoid.includes(
          generateWalkthrough(charts, candidate, count).fingerprint,
        )
      )
        break;
    }
    recentContexts.current = avoid.slice(-12);
    setPlayers(count);
    setSeed(candidate);
    setTransferSeed(candidate);
    setPracticeCount(0);
    setFurthest(0);
    navigate(0);
  }
  function nextHand() {
    if (!fresh) return;
    const avoid = [
      ...recentTransfers.current,
      `${players}:${fresh.position}:${fresh.hand}`,
    ];
    const base = randomSeed();
    let candidate = base;
    for (let attempt = 0; attempt < 128; attempt++) {
      candidate = (base + Math.imul(attempt, 0x9e3779b9)) >>> 0;
      const next = preflopTransfer(charts, candidate, players);
      if (!avoid.includes(`${players}:${next.position}:${next.hand}`)) break;
    }
    recentTransfers.current = avoid.slice(-12);
    setTransferSeed(candidate);
    setPracticeCount((n) => n + 1);
    clearAnswer();
  }
  const raiseTo = context?.raised.raiseTo ?? 25;
  const minimumRaiseTo = context?.raised.minimumRaiseTo ?? 40;
  const feedbackText =
    step === 0
      ? `Everyone before the button folded. Only the blinds remain in the pot, so this is an unopened pot. The original table still has ${players} seats: use the ${players}-player button baseline.`
      : step === 1
        ? `${hand} is ${expected === "raise" ? "inside" : "outside"} the ${players}-player Button opening baseline. ${expected === "raise" ? "Raise to 25" : "Fold"} agrees with this authored baseline. Raise to 25 means a total bet of 25 chips, not an extra 25 on top of another bet. Opening can win the blinds or build a pot in position; the button acts last after the flop if still in the hand. The two blinds can still fold, call or re-raise.`
        : step === 2
          ? `The same ${hand} is outside this baseline's ${position} opening range. ${players - hero - 1} players still have a decision after you. Folding agrees with this authored baseline; it is not proof that every real game requires a fold.`
          : step === 3
            ? `${hand} enters this baseline's Button opening range. The hand did not become stronger: only two opponents, the blinds, are left to act. This baseline opens more hands later. You still need a plan if they call or raise.`
            : step === 4
              ? `You have posted 0, so matching the cutoff's total ${raiseTo} costs ${raiseTo} chips. The cutoff entered voluntarily with a raise: this is a response to an opening range, not a first-in opening decision. The opening chart does not choose your response here. This is betting arithmetic, not strategy.`
              : step === 5
                ? `The cutoff increased the bet from 10 to ${raiseTo}: a ${raiseTo - 10}-chip raise. The minimum full re-raise adds at least another ${raiseTo - 10}, making your total ${minimumRaiseTo}. You may fold, call ${raiseTo}, or raise to ${minimumRaiseTo} or more. Which is best depends on the raiser's range, price and the blinds still behind you. This is betting arithmetic, not a strategy recommendation.`
                : `${fresh?.hand} is ${fresh?.action === "raise" ? "inside" : "outside"} the ${players}-player ${position} opening baseline. ${fresh?.action === "raise" ? "Raise to 25" : "Fold"} agrees with this baseline in the supplied unopened situation. This comparison is practice using a reference, not a poker skill score.`;
  const choiceValues =
    step === 0
      ? [
          { value: "unopened", label: "Unopened" },
          { value: "raised", label: "Facing a raise" },
        ]
      : step === 4
        ? [10, raiseTo, raiseTo + 15].map((n) => ({
            value: String(n),
            label: `${n} chips`,
          }))
        : step === 5
          ? [raiseTo, minimumRaiseTo, minimumRaiseTo + 10].map((n) => ({
              value: String(n),
              label: `Raise to ${n}`,
            }))
          : [
              { value: "raise", label: "Raise to 25" },
              { value: "fold", label: "Fold" },
            ];
  return (
    <div className="learning-layout preflop-walkthrough">
      <div className="page-heading">
        <div>
          <span className="eyebrow">Learn · A guided preflop hand</span>
          <h1 ref={heading} tabIndex={-1}>
            {titles[step]}
          </h1>
          <p>
            {players} players · 1,000-chip stacks · Blinds 5/10 · No antes or
            rake
          </p>
        </div>
      </div>
      <div className="button-row walkthrough-settings">
        <label>
          Walkthrough table size
          <select
            value={players}
            disabled={!context}
            onChange={(e) => newWalkthrough(Number(e.target.value) as 6 | 9)}
          >
            <option value="9">9 players</option>
            <option value="6">6 players</option>
          </select>
        </label>
        <button
          className="secondary"
          disabled={!context}
          onClick={() => newWalkthrough()}
        >
          New randomized walkthrough
        </button>
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
      ) : !context || !chart ? (
        <p role="status">Loading the opening baseline…</p>
      ) : (
        <section className="panel walkthrough-scene">
          <div
            className="preflop-learning-table walkthrough-grid"
            aria-label={`${players}-player table and public action order`}
          >
            <div className="learning-pot">
              <strong>Preflop</strong>
              <span>Pot: {raised ? context.raised.potChips : 15} chips</span>
              <span>
                {raised
                  ? `Cutoff raised to ${raiseTo}`
                  : "Only the blinds are in"}
              </span>
            </div>
            {seats.map((seat, index) => {
              const acting = step === 0 && index === folds && folds < button;
              const folded =
                index < hero &&
                (step !== 0 || index < folds) &&
                !(raised && index === cutoff);
              const status = acting
                ? "Acting now"
                : index === hero
                  ? step === 0 && folds < button
                    ? "Waiting"
                    : "Your turn"
                  : raised && index === cutoff
                    ? `Raised to ${raiseTo}`
                    : folded
                      ? "Folded"
                      : seat === "Small blind"
                        ? "Posted 5"
                        : seat === "Big blind"
                          ? "Posted 10"
                          : "Waiting";
              return (
                <div
                  className={`learning-seat seat-${index} ${index === hero ? "hero-seat" : ""} ${acting ? "acting-seat" : ""} ${folded ? "folded-seat" : ""} ${raised && index === cutoff ? "raised-seat" : ""}`}
                  key={seat}
                >
                  <strong>
                    {index + 1}. {seat}
                    {seat === "Button" ? " · D" : ""}
                  </strong>
                  <span>{status}</span>
                  {index === hero && <Cards cards={hole} small />}
                </div>
              );
            })}
          </div>
          <div
            className="walkthrough-prompt"
            key={`${players}:${seed}:${transferSeed}:${step}`}
          >
            <p className="quiet">
              Step {step + 1} of 7
              {step === 6 ? ` · Transfer hand ${practiceCount + 1}` : ""}
            </p>
            <h2>
              {step === 0
                ? `${hand}: the button acts after the cutoff`
                : step === 1
                  ? `${hand} on the button: choose an opening action`
                  : step === 2
                    ? `${hand} in ${position}: ${players - hero - 1} players still to act`
                    : step === 3
                      ? `${hand} on the button: only the blinds left`
                      : step === 4
                        ? `${hand}: a raise changes the question`
                        : step === 5
                          ? `${hand}: separate the total bet from the raise amount`
                          : `${hand}: your turn in ${position}`}
            </h2>
            {step === 0 && folds < button ? (
              <>
                <p>
                  Follow the public action in order. The dealer button marks the
                  last non-blind seat to act before the flop.
                </p>
                <button
                  className="primary"
                  onClick={() => setFolds((n) => n + 1)}
                >
                  Watch {seats[folds]} fold
                </button>
              </>
            ) : (
              <>
                <p>
                  {step === 0
                    ? `${button} folds reach you. Is this an unopened pot or a pot facing a raise?`
                    : step === 1
                      ? "Everyone before you folded, and you have not posted a blind. Use the hand and position to choose its action in the reference baseline."
                      : step === 2
                        ? "Try this hand from earlier position. Choose its action in the reference baseline; an optional hint is available."
                        : step === 3
                          ? "Everyone before the button folds. Does the baseline now include the exact same hand?"
                          : step === 4
                            ? `Everyone before the cutoff folded; cutoff raised to ${raiseTo}. You are on the button with ${hand} and have paid 0 this street. How many new chips would calling cost?`
                            : step === 5
                              ? `Blinds are 5/10; the cutoff raised to ${raiseTo}. What is the minimum legal full re-raise total from the button?`
                              : "Everyone before you folded. Use position and the reference baseline to choose an opening action."}
                </p>
                {[1, 2, 3, 6].includes(step) && (
                  <details>
                    <summary>Show the baseline for this hand</summary>
                    <p>
                      {hand}:{" "}
                      {baselineAction(chart, hand) === "raise"
                        ? "raise to 25"
                        : "fold"}{" "}
                      in the {players}-player {position} authored opening range.{" "}
                      {players - hero - 1} players are still to act.
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
                        {choiceValues.map((choice) => (
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
                        ? raised || step === 0
                          ? "That matches the situation"
                          : "That follows the baseline"
                        : raised || step === 0
                          ? "Recheck the situation"
                          : "Compare with the baseline"}
                    </h3>
                    <p>{feedbackText}</p>
                    {[1, 3, 6].includes(step) && <p>{sizingExplanation}</p>}
                    {raised && (
                      <div className="button-row">
                        <span>Fold · pay 0</span>
                        <span>Call · pay {context.raised.callCost}</span>
                        <span>Raise · total ≥ {minimumRaiseTo}</span>
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
                      <button className="secondary" onClick={clearAnswer}>
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
          {chart ? (
            <a href={chart.source.url}>PreflopR's authored opening ranges</a>
          ) : (
            "PreflopR's authored opening ranges"
          )}
          , not a solver or a guarantee of the best move. Source stack depth,
          rake and sizing are unspecified; 100 big blinds, no rake and raise-to
          2.5 BB are this app's teaching assumptions. Only unopened first
          actions use the chart. No chart agreement is recorded as a skill
          grade.
        </p>
        <p>{sizingExplanation}</p>
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
