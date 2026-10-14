import type { DecisionReview } from "../../../packages/shared/src/table";
import { Cards } from "./Cards";

export function MoveFacts({ review }: { review: DecisionReview }) {
  const context = review.context;
  if (!context) return null;
  return (
    <section className="move-facts" aria-label="Decision facts">
      <h3>What you faced</h3>
      <dl className="move-facts-grid">
        <div>
          <dt>Position</dt>
          <dd>{context.position}</dd>
        </div>
        <div>
          <dt>Opponents</dt>
          <dd>
            {context.opponents}{" "}
            {context.opponents === 1 ? "opponent" : "opponents"}
          </dd>
        </div>
        <div>
          <dt>Pot</dt>
          <dd>{review.pot.toLocaleString()} chips</dd>
        </div>
        <div>
          <dt>Your stack</dt>
          <dd>{context.stack.toLocaleString()} chips</dd>
        </div>
      </dl>
      {review.callThreshold !== null && (
        <p className="move-price">
          Call <strong>{review.call} chips</strong> for a price of{" "}
          <strong>{review.callThreshold.toFixed(1)}% pot share</strong>.
          {context.closingCall ? " Closes betting for one eligible pot." : ""}
        </p>
      )}
      {review.call > 0 && !context.closingCall && (
        <p className="quiet">{context.callReason}</p>
      )}
      <p className="move-takeaway">
        <strong>Takeaway: </strong>
        {context.takeaway}
      </p>
      <details className="model-details decision-observations">
        <summary>Hand details</summary>
        {context.observations.map((text) => (
          <p key={text}>{text}</p>
        ))}
        {context.bestFive && (
          <div className="move-best-five">
            <h4>Your best five · {review.hand}</h4>
            <Cards cards={context.bestFive} small />
          </div>
        )}
      </details>
    </section>
  );
}
