import { useId, useRef, useState, type KeyboardEvent } from "react";
import type { RangeReview } from "../../../packages/shared/src/table";

/** A display of inferred range mass, never an opening-hand recommendation. */
export function RangeMatrix({
  cells,
  name,
}: {
  cells: NonNullable<RangeReview["matrix"]>;
  name: string;
}) {
  const id = useId();
  const [selected, setSelected] = useState(0);
  const buttons = useRef<(HTMLButtonElement | null)[]>([]);
  const current = cells[selected] ?? cells[0];
  const max = Math.max(...cells.map((cell) => cell.percent), 0.01);
  function navigate(event: KeyboardEvent<HTMLButtonElement>, index: number) {
    const row = Math.floor(index / 13);
    const column = index % 13;
    let next: number;
    switch (event.key) {
      case "ArrowRight":
        next = row * 13 + ((column + 1) % 13);
        break;
      case "ArrowLeft":
        next = row * 13 + ((column + 12) % 13);
        break;
      case "ArrowDown":
        next = ((row + 1) % 13) * 13 + column;
        break;
      case "ArrowUp":
        next = ((row + 12) % 13) * 13 + column;
        break;
      case "Home":
        next = event.ctrlKey ? 0 : row * 13;
        break;
      case "End":
        next = event.ctrlKey ? 168 : row * 13 + 12;
        break;
      default:
        return;
    }
    event.preventDefault();
    setSelected(next);
    buttons.current[next]?.focus();
  }
  if (!current) return null;
  return (
    <div className="range-matrix-block">
      <h4 id={`${id}-title`}>{name}’s estimated range</h4>
      <p id={`${id}-help`} className="quiet range-matrix-help">
        Pairs run along the diagonal; s means suited, o means offsuit. Brighter
        blue means more of the range’s weight. This is an inferred range, not a
        starting-hand strategy chart or a chance of winning.
      </p>
      <div className="range-matrix-scroll">
        <div
          className="range-matrix"
          role="grid"
          aria-labelledby={`${id}-title`}
          aria-describedby={`${id}-help`}
          aria-rowcount={13}
          aria-colcount={13}
        >
          {Array.from({ length: 13 }, (_, row) => (
            <div className="range-matrix-row" role="row" key={row}>
              {cells.slice(row * 13, row * 13 + 13).map((cell, column) => {
                const index = row * 13 + column;
                const blocked = cell.available === 0;
                const unsupported = !blocked && cell.combinations === 0;
                return (
                  <div
                    role="gridcell"
                    key={cell.hand}
                    aria-selected={selected === index}
                  >
                    <button
                      ref={(element) => {
                        buttons.current[index] = element;
                      }}
                      type="button"
                      className={`range-cell${blocked ? " range-cell-blocked" : ""}${unsupported ? " range-cell-empty" : ""}${selected === index ? " range-cell-selected" : ""}`}
                      style={
                        cell.percent > 0
                          ? {
                              backgroundColor: `rgba(75, 131, 219, ${0.12 + (cell.percent / max) * 0.65})`,
                            }
                          : undefined
                      }
                      tabIndex={selected === index ? 0 : -1}
                      aria-label={`${cell.hand}: ${cell.percent.toFixed(2)}% of range, ${cell.combinations} positive-weight combinations out of ${cell.available} available${blocked ? ", all blocked by known cards" : unsupported ? ", zero model weight" : ""}`}
                      aria-controls={`${id}-detail`}
                      onClick={() => setSelected(index)}
                      onKeyDown={(event) => navigate(event, index)}
                    >
                      <span>{cell.hand}</span>
                      {(blocked || unsupported) && (
                        <span className="range-cell-status" aria-hidden="true">
                          {blocked ? "×" : "—"}
                        </span>
                      )}
                    </button>
                  </div>
                );
              })}
            </div>
          ))}
        </div>
      </div>
      <div
        className="range-cell-detail"
        id={`${id}-detail`}
        aria-live="polite"
        aria-atomic="true"
      >
        <strong>
          {current.hand} · {current.percent.toFixed(2)}% of this range
        </strong>
        <span>
          {current.available === 0
            ? "All combinations are blocked by your cards or the visible board."
            : `${current.combinations} positive-weight combinations out of ${current.available} legal combinations after known-card blockers.${current.combinations === 0 ? " The model assigns these legal hands zero weight." : ""}`}
        </span>
      </div>
      <p className="quiet range-matrix-key">
        × All combinations blocked · — Zero model weight. Select a cell for
        details; use arrow keys to move. Cell percentages together total 100%.
      </p>
    </div>
  );
}
