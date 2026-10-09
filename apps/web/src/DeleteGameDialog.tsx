import { useEffect, useRef } from "react";
import type { GameStats } from "../../../packages/shared/src/table";
export function DeleteGameDialog({
  game,
  busy,
  error,
  onCancel,
  onDelete,
}: {
  game: GameStats;
  busy: boolean;
  error: string;
  onCancel: () => void;
  onDelete: () => void;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const el = ref.current!;
    el.showModal();
    return () => el.close();
  }, []);
  return (
    <dialog
      className="bot-profile-dialog delete-game-dialog"
      ref={ref}
      aria-labelledby="delete-game-title"
      aria-describedby="delete-game-description"
      onCancel={(e) => {
        if (busy) e.preventDefault();
      }}
      onClose={onCancel}
    >
      <h2 id="delete-game-title">Delete Game {game.gameNumber}?</h2>
      <p id="delete-game-description">
        This removes the game, its saved hand, and all {game.hands} completed
        hand records. It cannot be undone.
      </p>
      {game.inProgress && (
        <p className="quiet">Hand {game.currentHand} is still in progress.</p>
      )}
      {error && (
        <p role="alert" className="error">
          {error}
        </p>
      )}
      <div className="dialog-actions">
        <button
          className="secondary"
          autoFocus
          disabled={busy}
          onClick={onCancel}
        >
          Cancel
        </button>
        <button className="danger" disabled={busy} onClick={onDelete}>
          {busy ? "Deleting…" : "Delete game"}
        </button>
      </div>
    </dialog>
  );
}
