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
          <dt>Still competing</dt>
          <dd>
            {context.opponents}{" "}
            {context.opponents === 1 ? "opponent" : "opponents"}
          </dd>
        </div>
        <div>
          <dt>Pot before your action</dt>
          <dd>{review.pot.toLocaleString()} chips</dd>
        </div>
        <div>
          <dt>Your remaining stack</dt>
          <dd>{context.stack.toLocaleString()} chips</dd>
        </div>
      </dl>
      {context.observations.map((text) => (
        <p key={text}>{text}</p>
      ))}
      {context.bestFive && (
        <div className="move-best-five">
          <h4>Your best five · {review.hand}</h4>
          <Cards cards={context.bestFive} small />
        </div>
      )}
      {review.callThreshold !== null && (
        <p className="move-price">
          Call <strong>{review.call} chips</strong> for a price of{" "}
          <strong>{review.callThreshold.toFixed(1)}% pot share</strong>.
          {context.closingCall
            ? " This call closes betting."
            : " This price alone does not settle the decision."}
        </p>
      )}
      <p className="quiet">{context.callReason}</p>
      <p className="move-takeaway">
        <strong>Takeaway: </strong>
        {context.takeaway}
      </p>
    </section>
  );
}
