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
  "Hand strength does not set this practice size. Position, stacks, rake and opponents can change a real opening size; this chart does not prove an optimal size.";
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
        if (!r.ok) throw new Error("Opening guide could not load.");
        return (await r.json()) as OpeningChart[];
      })
      .then((data) => {
        for (const count of [6, 9] as const) {
          if (
            !walkthroughSeatsFor(count)
              .slice(0, -2)
              .every((position) => walkthroughChart(data, position, count))
          )
            throw new Error(`The ${count}-player opening guide is incomplete.`);
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
      ? `Only the blinds are in, so the pot is unopened. Keep using the ${players}-player guide even after others fold.`
      : step === 1
        ? `${hand} is ${expected === "raise" ? "inside" : "outside"} the ${players}-player Button opening guide: ${expected === "raise" ? "raise to 25" : "fold"}. The button acts last after the flop, which helps you decide with more information.`
        : step === 2
          ? `${hand} is outside the guide's ${position} opening range: fold. With ${players - hero - 1} players still to act, early position opens fewer hands.`
          : step === 3
            ? `${hand} enters the Button opening range: raise to 25. The hand did not become stronger; only the two blinds are left to act.`
            : step === 4
              ? `You have posted 0, so matching the cutoff's total ${raiseTo} costs ${raiseTo} chips. This opening guide cannot choose your response to a raise.`
              : step === 5
                ? `The raise from 10 to ${raiseTo} is a ${raiseTo - 10}-chip increase; add at least ${raiseTo - 10} again, making your total ${minimumRaiseTo}. That is the legal minimum, not a strategy recommendation.`
                : `${fresh?.hand} is ${fresh?.action === "raise" ? "inside" : "outside"} the ${players}-player ${position} opening guide: ${fresh?.action === "raise" ? "raise to 25" : "fold"}. This is guide practice, not a poker skill score.`;
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
          <p className="quiet">Practice guide; real games can differ.</p>
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
        <p role="status">Loading the opening guide…</p>
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
                <p>Watch each player act before the button.</p>
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
                    ? "Everyone before you folded. Is the pot unopened or raised?"
                    : step === 1
                      ? "Everyone before you folded. Choose an opening action using the practice guide."
                      : step === 2
                        ? "Choose this hand's action from earlier position."
                        : step === 3
                          ? "Same hand, later position. Would you open now?"
                          : step === 4
                            ? `Cutoff raised to ${raiseTo}; you have paid 0 this street. How many chips would calling cost?`
                            : step === 5
                              ? `Blinds are 5/10; the cutoff raised to ${raiseTo}. What is the minimum legal full re-raise total from the button?`
                              : "Everyone before you folded. Choose an opening action using the practice guide."}
                </p>
                {[1, 2, 3, 6].includes(step) && (
                  <details>
                    <summary>Show the guide for this hand</summary>
                    <p>
                      {hand}:{" "}
                      {baselineAction(chart, hand) === "raise"
                        ? "raise to 25"
                        : "fold"}{" "}
                      in the {players}-player {position} practice range.{" "}
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
                              : "Opening action"}
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
                          : "That follows the guide"
                        : raised || step === 0
                          ? "Recheck the situation"
                          : "Compare with the guide"}
                    </h3>
                    <p>{feedbackText}</p>
                    {[1, 3, 6].includes(step) && (
                      <>
                        <p className="quiet">
                          Practice size: 25 chips total (2.5 BB) for every hand
                          in the opening range.
                        </p>
                        <details>
                          <summary>Opening size details</summary>
                          <p>{sizingExplanation}</p>
                          <p>Raise to 25 means 25 total, not an extra 25.</p>
                        </details>
                      </>
                    )}
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
        <summary>Guide source and limits</summary>
        <p>
          Raise/fold guidance from{" "}
          {chart ? (
            <a href={chart.source.url}>PreflopR's authored opening ranges</a>
          ) : (
            "PreflopR's authored opening ranges"
          )}
          . This authored chart is not a solver or a guarantee of the best move.
          It covers unopened pots only; agreement is not a skill grade.
        </p>
        <p>
          Source stacks, rake and sizing are unspecified. This practice assumes
          100 big blinds, no rake and 2.5 BB for the whole opening range.
        </p>
      </details>
      <details className="panel">
        <summary>More practice and earlier lessons</summary>
        <p>River betting and all-in decisions.</p>
        <button className="secondary" onClick={onLibrary}>
          Open earlier exercises
        </button>
      </details>
    </div>
  );
}
