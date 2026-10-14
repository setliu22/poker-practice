import type {
  DecisionReview,
  ProbabilityReview,
} from "../../../packages/shared/src/table";
import { useId, useState } from "react";
import { Cards } from "./Cards";
import { RangeMatrix } from "./RangeMatrix";
import { MoveFacts } from "./MoveFacts";
import { DecisionRating } from "./DecisionRating";
import { DrawDensity } from "./DrawDensity";
import { PreflopGuidePanel } from "./PreflopGuide";

function ResponsePreview({ review }: { review: DecisionReview }) {
  const id = useId();
  const [key, setKey] = useState(
    review.responsePreviews?.find((item) => item.key === review.chosenKey)
      ?.key ??
      review.responsePreviews?.[0]?.key ??
      "",
  );
  const previews = review.responsePreviews ?? [];
  const preview = previews.find((item) => item.key === key) ?? previews[0];
  if (!preview) return null;
  return (
    <section className="response-preview" aria-labelledby={`${id}-title`}>
      <h3 id={`${id}-title`}>How the opponent may respond</h3>
      <label className="response-size-label" htmlFor={`${id}-size`}>
        Compare bet sizes
      </label>
      <select
        id={`${id}-size`}
        value={preview.key}
        onChange={(event) => setKey(event.target.value)}
      >
        {previews.map((item) => (
          <option key={item.key} value={item.key}>
            {item.label}
          </option>
        ))}
      </select>
      <p className="quiet">
        Heads-up estimates for the opponent’s immediate response to this bet,
        averaged over their inferred range. These are bot-model assumptions, not
        guaranteed reactions or a recommendation to bet.
      </p>
      <div className="response-outcomes">
        {(
          [
            ["Fold", preview.fold, preview.foldExamples],
            ["Call", preview.call, preview.callExamples],
            ["Re-raise", preview.raise, preview.raiseExamples],
          ] as const
        ).map(([label, percent, examples]) => (
          <section
            className="response-outcome"
            key={label}
            aria-label={`${label} response`}
          >
            <h4>
              <span>{label}</span>
              <strong>{percent.toFixed(1)}%</strong>
            </h4>
            {examples.length ? (
              <div className="response-hand-examples">
                {examples.map((example) => (
                  <div key={example.cards.join()}>
                    <Cards cards={example.cards} small />
                    <span>{example.percent.toFixed(2)}% joint weight</span>
                  </div>
                ))}
              </div>
            ) : (
              <p className="quiet">No positive-weight examples.</p>
            )}
          </section>
        ))}
      </div>
      <p className="quiet response-footnote">
        Fold, call, and re-raise total 100%. Each example’s joint weight is the
        chance of that exact hand and that response together; examples show only
        part of the range. No later betting or folds are counted here.
      </p>
    </section>
  );
}
function Odds({ odds, title }: { odds: ProbabilityReview; title: string }) {
  return (
    <section className="odds-block">
      <h4>{title}</h4>
      <div className="odds-grid">
        {[
          ["Win outright", odds.win],
          ["Tie for first", odds.tie],
          ["Lose", odds.lose],
          ["Expected pot share", odds.share],
        ].map(([label, value]) => (
          <div key={label}>
            <strong>
              {!odds.exact && "≈ "}
              {Number(value).toFixed(1)}%
            </strong>
            <span>{label}</span>
          </div>
        ))}
      </div>
      <p className="quiet">
        {odds.note} Pot share includes your portion of ties. These showdown odds
        do not predict folds or recommend an action.
      </p>
    </section>
  );
}
export function RoundReview({
  rounds,
  complete,
}: {
  rounds: DecisionReview[];
  complete: boolean;
}) {
  return (
    <section className="round-reviews" aria-label="Decision reviews">
      <h2>Decision reviews</h2>
      <p className="quiet">
        Estimates use the cards, public actions, and pot at each decision. They
        compare behavior under a bot model, not optimal poker strategy.{" "}
        {complete
          ? "All hole cards are now revealed for study."
          : "Actual bot cards stay hidden until the hand ends."}
      </p>
      {rounds.length === 0 ? (
        <p>Your first action will appear here.</p>
      ) : (
        rounds.map((r, i) => (
          <details
            className="decision-review"
            key={r.id}
            open={i === rounds.length - 1}
          >
            <summary>
              <span className="pill">{r.street}</span>
              <strong>{r.action}</strong>
              <span className="quiet">Pot {r.pot}</span>
            </summary>
            <div className="decision-body">
              <div className="review-cards">
                <div>
                  <h3>Your cards · {r.hand}</h3>
                  <Cards cards={r.hero} small />
                </div>
                <div>
                  <h3>Board at this decision</h3>
                  {r.board.length ? (
                    <Cards cards={r.board} small />
                  ) : (
                    <p className="quiet">Preflop — no board yet</p>
                  )}
                </div>
              </div>
              <MoveFacts review={r} />
              {r.modelRating && <DecisionRating rating={r.modelRating} />}
              {r.preflopGuide && <PreflopGuidePanel guide={r.preflopGuide} />}
              <Odds
                odds={r.rangeProbability}
                title="Against the estimated ranges"
              />
              <div className="review-verdict">
                <h3>{r.verdict}</h3>
                <p>{r.explanation}</p>
              </div>
              <details className="model-details advanced-comparison">
                <summary>Advanced: modeled action comparison</summary>
                <div className="value-scroll">
                  <table className="action-values">
                    <caption>
                      Modeled average net chips from this decision
                    </caption>
                    <thead>
                      <tr>
                        <th>Action</th>
                        <th>Expected chips</th>
                        <th>Difference vs your choice</th>
                      </tr>
                    </thead>
                    <tbody>
                      {r.values.map((v) => {
                        const comparison = r.comparisons?.find(
                          (c) => c.key === v.key,
                        );
                        return (
                          <tr
                            key={v.key}
                            className={
                              v.key === r.chosenKey ? "chosen-action" : ""
                            }
                          >
                            <th>
                              {v.label}
                              {v.key === r.chosenKey ? " · You chose this" : ""}
                            </th>
                            <td>
                              {v.chips >= 0 ? "+" : ""}
                              {v.chips.toFixed(1)}
                              <small className="value-precision">
                                {v.exact
                                  ? "Fully enumerated under model"
                                  : `± ${v.margin.toFixed(1)} sampling`}
                              </small>
                            </td>
                            <td>
                              {comparison ? (
                                <>
                                  {comparison.difference >= 0 ? "+" : ""}
                                  {comparison.difference.toFixed(1)}
                                  {comparison.samples
                                    ? ` ± ${comparison.margin.toFixed(1)}`
                                    : ""}
                                  <small className="value-precision">
                                    {comparison.samples
                                      ? "Paired sampling interval"
                                      : "Fully enumerated under model"}
                                  </small>
                                </>
                              ) : v.key === r.chosenKey ? (
                                "Baseline"
                              ) : (
                                "Unavailable"
                              )}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
                <p className="quiet">
                  Positive differences favor the alternative. Intervals measure
                  sampling noise only; they do not measure how realistic the
                  bots are. Full enumeration removes sampling error; it does not
                  establish the best action against real players.
                </p>
                <details className="model-details">
                  <summary>How this comparison works</summary>
                  <p>{r.model}</p>
                  <p>
                    Fold is zero because chips already committed cannot be
                    recovered by folding. A positive number means an average
                    gain relative to your stack at this decision. Side pots and
                    split pots are settled separately.
                  </p>
                </details>
              </details>
              {r.callThreshold !== null && (
                <div className="math-note">
                  <h3>Call price</h3>
                  <p>
                    Call {r.call} into {r.pot}: {r.call} ÷ ({r.pot} + {r.call})
                    ={" "}
                    <strong>
                      {r.callThreshold.toFixed(1)}% required pot share
                    </strong>
                    .
                  </p>
                  <p className="quiet">
                    This threshold applies directly when this call closes the
                    action, you can win the whole pot, and there are no future
                    bets. Future betting and other players’ responses can change
                    the decision; raw equity alone cannot grade the call.
                  </p>
                </div>
              )}
              {r.bluffThreshold !== null && (
                <div className="math-note">
                  <h3>If this were a pure bluff</h3>
                  <p>
                    Risk {r.risk} to win {r.pot}. Everyone must fold more than{" "}
                    <strong>{r.bluffThreshold.toFixed(1)}%</strong> of the time
                    to profit if you always lose when called.
                  </p>
                  <p className="quiet">
                    By the end of the modeled hand after the{" "}
                    {r.values
                      .find((v) => v.key === "raise")
                      ?.label.toLowerCase()}{" "}
                    candidate, every opponent folded{" "}
                    {r.values
                      .find((v) => v.key === "raise")
                      ?.allFold.toFixed(1)}
                    % of the time. Opponents may call first and fold later, so
                    this is not the immediate fold rate required by the
                    pure-bluff calculation above. Calls and later bets can
                    change the chips won or lost.
                  </p>
                </div>
              )}
              <ResponsePreview review={r} />
              <details className="range-details">
                <summary>Opponent ranges · what could they have?</summary>
                <p>
                  A range is a set of hands an opponent could hold, with a
                  probability for each. {r.rangeNote}
                </p>
                <p className="quiet">
                  Snapshot: {r.street}, {r.board.length} community cards. Only
                  opponents still competing at this decision are listed. A later
                  fold does not change this earlier snapshot.
                </p>
                {r.opponents.map((p) => (
                  <section key={p.seat} className="range-player">
                    <h3>
                      {p.name} · {p.style}
                    </h3>
                    {p.drawDensity && (
                      <DrawDensity density={p.drawDensity} name={p.name} />
                    )}
                    <p>
                      {p.combinations} legal two-card combinations with positive
                      model weight after blockers and observed actions. They are
                      not equally likely.
                    </p>
                    <div className="range-groups">
                      {p.groups.map((g) => (
                        <span key={g.name}>
                          {g.name} <strong>{g.percent.toFixed(1)}%</strong>
                        </span>
                      ))}
                    </div>
                    {p.matchup && (
                      <div className="range-matchup">
                        <h4>Compare hands on this board</h4>
                        <p>
                          Your current made hand is ahead of{" "}
                          <strong>{p.matchup.ahead.toFixed(1)}%</strong> of this
                          range, tied with{" "}
                          <strong>{p.matchup.tied.toFixed(1)}%</strong>, and
                          behind <strong>{p.matchup.behind.toFixed(1)}%</strong>
                          .
                        </p>
                        <p className="quiet">
                          This compares the cards already dealt, not winning
                          odds after future cards. It does not say which hands
                          will call a bet.
                        </p>
                      </div>
                    )}
                    {p.matrix && <RangeMatrix cells={p.matrix} name={p.name} />}
                    <h4>Examples with the highest weights</h4>
                    <p className="quiet">
                      These examples are only part of the range. The percentage
                      is the weight of this exact combination.
                    </p>
                    <div className="range-examples">
                      {p.examples.map((c) => (
                        <div key={c.cards.join()}>
                          <Cards cards={c.cards} small />
                          <span>{c.weight.toFixed(2)}%</span>
                        </div>
                      ))}
                    </div>
                  </section>
                ))}
              </details>
              {r.actualProbability && (
                <section className="actual-review">
                  <h3>What the bots actually held</h3>
                  <div className="range-examples">
                    {r.actualCards?.map((p) => (
                      <div key={p.seat}>
                        <strong>
                          {p.name}
                          {p.folded ? " · Already folded" : ""}
                        </strong>
                        <span className="quiet">{p.hand}</span>
                        <Cards cards={p.cards} small />
                      </div>
                    ))}
                  </div>
                  <Odds
                    odds={r.actualProbability}
                    title="Against the actual cards"
                  />
                  <p className="quiet">
                    A replay from this decision, with every dealt hole card
                    known and future community cards unknown. Folded opponents
                    are excluded from the contest, but their cards are removed
                    from the deck. This hindsight calculation does not establish
                    whether your action was good.
                  </p>
                </section>
              )}
            </div>
          </details>
        ))
      )}
      <details className="model-details">
        <summary>Bot policy</summary>
        <p>
          These original rule-based bots use their own cards and public
          information. Named opponents use position, stack depth, board texture,
          draws, earlier actions, and distinct playstyle tendencies. Remy also
          adapts gradually to public actions across hands at this table. Older
          saved hands retain their original policy until the next deal. Range
          weights come from those same rules, not a solver or a human population
          model.
        </p>
      </details>
    </section>
  );
}
