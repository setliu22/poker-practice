import { useId } from "react";
import type { RangeDrawDensity } from "../../../packages/shared/src/range-draws";

export function DrawDensity({
  density,
  name,
}: {
  density: RangeDrawDensity;
  name: string;
}) {
  const id = useId();
  return (
    <section className="draw-density" aria-labelledby={`${id}-title`}>
      <p id={`${id}-title`} className="draw-density-total">
        <strong>Draw density: {density.percent.toFixed(1)}%</strong> of {name}’s
        estimated range
      </p>
      <details className="draw-density-details">
        <summary>What counts as a draw?</summary>
        <dl>
          <div>
            <dt>Flush draws</dt>
            <dd>{density.flushDraw.toFixed(1)}%</dd>
          </div>
          <div>
            <dt>Open-ended straight draws</dt>
            <dd>{density.openEndedStraightDraw.toFixed(1)}%</dd>
          </div>
          <div>
            <dt>Hands with both draws</dt>
            <dd>{density.both.toFixed(1)}%</dd>
          </div>
        </dl>
        <p className="quiet">
          Hands with both draws are counted once in the combined density. Only
          flush draws and open-ended straight draws are included; other draws,
          such as gutshots, are excluded.
        </p>
        <p className="quiet">{density.note}</p>
        <p className="quiet">
          Percentages use the estimated range’s hand weights, not a simple count
          of combinations. A draw can improve without winning. This is not a
          winning probability or a count of guaranteed winning outs.
        </p>
      </details>
    </section>
  );
}
