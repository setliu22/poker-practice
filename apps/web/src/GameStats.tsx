import type { GameStats as Stats } from "../../../packages/shared/src/table";
const chips = (value: number) => `${value >= 0 ? "+" : ""}${value}`;
export function GameStats({
  games,
  currentId,
  busy,
  onResume,
}: {
  games: Stats[];
  currentId?: string;
  busy: boolean;
  onResume: (id: string) => void;
}) {
  const current = games.find((g) => g.id === currentId);
  return (
    <section className="panel saved-games" aria-label="Games and stats">
      <h2>Games and stats</h2>
      <p className="quiet">Profit and scores update when a hand finishes.</p>
      {current && (
        <>
          <div className="game-metrics">
            <div>
              <span>Game profit</span>
              <strong>{chips(current.profit)} chips</strong>
            </div>
            <div>
              <span>Hands completed</span>
              <strong>{current.hands}</strong>
            </div>
            <div>
              <span>Decision score · model</span>
              <strong>
                {current.score === null ? "—" : `${current.score}/100`}
              </strong>
              <small>{current.decisions} postflop decisions</small>
            </div>
          </div>
          {current.currentHand >
            current.hands + (current.inProgress ? 1 : 0) && (
            <p className="quiet">
              Stats cover the recorded hands below. Earlier hands from before
              game tracking was added are unavailable.
            </p>
          )}
          {!!current.streets.length && (
            <p className="quiet">
              {current.streets
                .map((s) => `${s.street}: ${s.score}/100 (${s.decisions})`)
                .join(" · ")}
            </p>
          )}
          <details className="score-explainer">
            <summary>How is the score calculated?</summary>
            <p>
              Profit is the sum of completed hands’ chip gains and losses.
              Stacks reset to 1,000 each hand; profit carries across the game.
            </p>
            <p>
              The score compares each postflop decision with the best tested
              action using only your cards, the board, and estimated bot ranges
              at that moment. Winning or losing the hand does not change the
              score. Preflop and unfinished hands are excluded.
            </p>
            <p>
              For each decision: subtract both simulation error margins from the
              gap in expected chips, then divide the remaining gap by the pot
              (minimum 10 chips). Score = 100 × (1 − gap / pot), bounded from 0
              to 100. The game score averages these decisions.
            </p>
            <p>
              A score of 100 means no measurable loss against the tested
              alternatives. It does not mean perfect poker. The one-round model
              checks later streets through and assumes you call further raises;
              it can miss future betting costs, better sizes, and other
              strategies.
            </p>
          </details>
          {!!current.history.length && (
            <details>
              <summary>Completed hands</summary>
              <div className="game-hand-list">
                {current.history.map((h) => (
                  <div key={h.handNumber}>
                    <strong>Hand {h.handNumber}</strong>
                    <span>{chips(h.profit)} chips</span>
                    <span>
                      {h.score === null
                        ? "No postflop score"
                        : `${h.score}/100 · ${h.decisions.length} decisions`}
                    </span>
                  </div>
                ))}
              </div>
            </details>
          )}
        </>
      )}
      {!games.length && (
        <p className="quiet">
          Start a table to create a saved game. Each new table starts a separate
          profit total.
        </p>
      )}
      {!!games.length && (
        <details open={!current}>
          <summary>Saved games ({games.length})</summary>
          <div className="saved-game-list">
            {games.map((g, i) => (
              <div className="saved-game" key={g.id}>
                <div>
                  <strong>
                    Game {games.length - i} · {g.players} players
                    {g.id === currentId ? " · Current" : ""}
                  </strong>
                  <p className="quiet">
                    Started {new Date(g.startedAt).toLocaleString()} · {g.hands}{" "}
                    hands completed
                    {g.inProgress ? ` · Hand ${g.currentHand} in progress` : ""}
                  </p>
                  <p>
                    {chips(g.profit)} chips ·{" "}
                    {g.score === null
                      ? "No postflop score yet"
                      : `Decision score ${g.score}/100`}
                  </p>
                </div>
                <button
                  className="secondary"
                  disabled={busy || g.id === currentId}
                  onClick={() => onResume(g.id)}
                >
                  Open game
                </button>
              </div>
            ))}
          </div>
        </details>
      )}
    </section>
  );
}
