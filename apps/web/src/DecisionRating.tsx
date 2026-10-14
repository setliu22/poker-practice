import type { ModelDecisionRating } from "../../../packages/shared/src/decision-rating";

export function DecisionRating({ rating }: { rating: ModelDecisionRating }) {
  return (
    <section
      className="move-facts model-rating"
      aria-label="Model agreement score"
    >
      <div className="model-rating-heading">
        <h3>Model agreement score</h3>
        <strong className="model-rating-number">
          {rating.score === null
            ? rating.status === "inconclusive"
              ? "Inconclusive"
              : "Not rated"
            : `${rating.status === "estimated" || (rating.regretBb !== null && Math.abs(rating.score - 100 / (1 + rating.regretBb)) > 1e-8) ? "≈ " : ""}${rating.score.toFixed(1)} / 100`}
        </strong>
      </div>
      <p className="quiet">
        Bot model estimate. A 100 does not mean perfect play.
      </p>
      {rating.score === null && (
        <p>
          {rating.status === "inconclusive"
            ? "The tested choices are too close to rate confidently."
            : "A reliable comparison is unavailable."}
        </p>
      )}
      <details className="model-details">
        <summary>How the score works</summary>
        <p>
          Uses your public betting situation and inferred opponent ranges.
          Winning, losing, and cards revealed afterward do not affect it.
        </p>
        {rating.score !== null && rating.regretBb !== null && (
          <p>
            {rating.regretBb === 0
              ? "Your choice matches the highest estimated return among the tested actions."
              : `The model estimates ${rating.regretBb < 0.01 ? "less than 0.01" : rating.regretBb.toFixed(2)} big blinds of missed value compared with its best tested choice.`}
            {rating.status === "estimated" && rating.scoreInterval && (
              <>
                {" "}
                Sampling range:{" "}
                <strong>
                  {rating.scoreInterval[0].toFixed(1)}–
                  {rating.scoreInterval[1].toFixed(1)} / 100
                </strong>
                .
              </>
            )}
          </p>
        )}
        {rating.score === null && (
          <p>
            {rating.status === "inconclusive"
              ? "The simulation cannot confidently separate your action from a better alternative."
              : "A reliable comparison is unavailable for this decision."}
          </p>
        )}
        <p className="quiet">
          A score against the app’s bot model, not a general poker-skill grade.
          A 100 does not mean perfect play.
        </p>
        <p>{rating.explanation}</p>
        <p>
          This is not a winning percentage. Sampling ranges do not include
          errors in the opponent model or its assumptions about later bets.
        </p>
      </details>
    </section>
  );
}
