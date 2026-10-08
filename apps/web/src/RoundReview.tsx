import type {
  DecisionReview,
  ProbabilityReview,
} from "../../../packages/shared/src/table";
import { Cards } from "./Cards";
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
            <strong>{Number(value).toFixed(1)}%</strong>
            <span>{label}</span>
          </div>
        ))}
      </div>
      <p className="quiet">
        {odds.note} Pot share includes your portion of ties.
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
        Review each action using the cards and pot at that moment.{" "}
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
              <Odds
                odds={r.rangeProbability}
                title="Against the estimated ranges"
              />
              <div className="review-verdict">
                <h3>{r.verdict}</h3>
                <p>{r.explanation}</p>
              </div>
              <div className="value-scroll">
                <table className="action-values">
                  <caption>Expected net chips from this decision</caption>
                  <thead>
                    <tr>
                      <th>Action</th>
                      <th>Average chips</th>
                      <th>Simulation uncertainty</th>
                    </tr>
                  </thead>
                  <tbody>
                    {r.values.map((v) => (
                      <tr
                        key={v.key}
                        className={v.key === r.chosenKey ? "chosen-action" : ""}
                      >
                        <th>
                          {v.label}
                          {v.key === r.chosenKey ? " · You chose this" : ""}
                        </th>
                        <td>
                          {v.chips >= 0 ? "+" : ""}
                          {v.chips.toFixed(1)}
                        </td>
                        <td>
                          {v.exact ? "Exact" : `± ${v.margin.toFixed(1)} chips`}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <p className="quiet">
                Uncertainty is an approximate 95% sampling interval, not a
                measure of how realistic the model is.
              </p>
              <details className="model-details">
                <summary>How this comparison works</summary>
                <p>{r.model}</p>
                <p>
                  Fold is zero because chips already committed cannot be
                  recovered by folding. A positive number means an average gain
                  relative to your stack at this decision. Side pots and split
                  pots are settled separately.
                </p>
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
                    bets. Otherwise use the model above; raw equity alone cannot
                    grade the call.
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
                    In the simulation, everyone folded during this betting round{" "}
                    {r.values
                      .find((v) => v.key === "raise")
                      ?.allFold.toFixed(1)}
                    % of the time. A draw can also win when called; the chip
                    comparison includes those outcomes.
                  </p>
                </div>
              )}
              <details className="range-details">
                <summary>Opponent ranges · what could they have?</summary>
                <p>
                  A range is a set of hands an opponent could hold, with a
                  probability for each. {r.rangeNote}
                </p>
                {r.opponents.map((p) => (
                  <section key={p.seat} className="range-player">
                    <h3>
                      {p.name} · {p.style}
                    </h3>
                    <p>
                      {p.combinations} possible two-card combinations after
                      blockers and observed actions.
                    </p>
                    <div className="range-groups">
                      {p.groups.map((g) => (
                        <span key={g.name}>
                          {g.name} <strong>{g.percent.toFixed(1)}%</strong>
                        </span>
                      ))}
                    </div>
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
          information. Tight bots fold more marginal hands, loose bots call
          more, and aggressive bots bet and bluff more. Range weights come from
          those same rules, not a solver or a human population model.
        </p>
      </details>
    </section>
  );
}
