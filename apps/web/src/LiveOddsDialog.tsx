import { useEffect, useRef } from "react";
import type { LiveOdds } from "../../../packages/shared/src/table";

export function LiveOddsDialog({
  odds,
  error,
  loading,
  onClose,
  onRetry,
}: {
  odds: LiveOdds | null;
  error: string;
  loading: boolean;
  onClose: () => void;
  onRetry: () => void;
}) {
  const ref = useRef<HTMLDialogElement>(null);

  useEffect(() => {
    const dialog = ref.current!;
    dialog.showModal();
    return () => dialog.close();
  }, []);

  return (
    <dialog
      ref={ref}
      className="bot-profile-dialog live-odds-dialog"
      aria-labelledby="live-odds-title"
      onClose={onClose}
      onClick={(event) => {
        const dialog = ref.current;
        if (event.target !== dialog || !dialog) return;
        const bounds = dialog.getBoundingClientRect();
        if (
          event.clientX < bounds.left ||
          event.clientX > bounds.right ||
          event.clientY < bounds.top ||
          event.clientY > bounds.bottom
        ) {
          dialog.close();
        }
      }}
    >
      <section
        id="live-odds"
        aria-label="Your live odds"
        aria-live="polite"
        aria-busy={loading}
      >
        <div className="profile-heading live-odds-heading">
          <div>
            <h2 id="live-odds-title">Your showdown odds</h2>
            {odds && (
              <span className="pill">
                {odds.exact ? "Enumerated under model" : "Approximate"}
              </span>
            )}
          </div>
          <button
            type="button"
            className="secondary"
            onClick={() => ref.current?.close()}
            autoFocus
          >
            Close
          </button>
        </div>

        {loading && <p role="status">Estimating your showdown odds…</p>}

        {error && (
          <div className="odds-error">
            <p role="alert" className="error">
              {error}
            </p>
            <button
              type="button"
              className="primary"
              disabled={loading}
              onClick={onRetry}
            >
              {loading ? "Calculating odds…" : "Try again"}
            </button>
          </div>
        )}

        {odds && (
          <>
            <p className="quiet">
              {odds.opponents} {odds.opponents === 1 ? "opponent" : "opponents"}{" "}
              still competing
              {" · "}
              {odds.source === "inferred-ranges"
                ? "Ranges inferred from public actions"
                : "Random legal opponent hands"}
            </p>
            <div className="odds-grid live-odds-grid">
              {(
                [
                  ["Win outright", "win"],
                  ["Tie for first", "tie"],
                  ["Expected pot share", "share"],
                ] as const
              ).map(([label, key]) => (
                <div key={key}>
                  <strong>{odds[key].toFixed(1)}%</strong>
                  <span>{label}</span>
                  {!odds.exact && (
                    <small>
                      95% sampling interval {odds.intervals[key][0].toFixed(1)}–
                      {odds.intervals[key][1].toFixed(1)}%
                    </small>
                  )}
                </div>
              ))}
            </div>
            <p>
              This assumes everyone still in the hand reaches showdown. Pot
              share includes ties. It does not predict folds or recommend
              calling or raising.
            </p>
            <details className="model-details">
              <summary>What this estimate means</summary>
              <p>{odds.note}</p>
              <p>
                Only your cards, the board already dealt, and public actions are
                used. The model may not match real opponents.{" "}
                {odds.exact
                  ? "Enumeration removes sampling error; it does not make the opponent model certain."
                  : `${odds.samples.toLocaleString()} simulations. The intervals measure sampling uncertainty, not errors in the opponent model.`}
              </p>
            </details>
          </>
        )}
      </section>
    </dialog>
  );
}
