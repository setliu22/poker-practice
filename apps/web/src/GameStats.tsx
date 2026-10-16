import { useState } from "react";
import type { GameStats as Stats } from "../../../packages/shared/src/table";
import { gameTrends } from "./game-trends";
import { StatsChart } from "./StatsChart";
export const formatChips = (value: number) =>
  `${value >= 0 ? "+" : ""}${value}`;
export function GameStats({
  games,
  currentId,
  selectedId,
  busy,
  onSelect,
  onResume,
  onDelete,
  onNew,
}: {
  games: Stats[];
  currentId?: string;
  selectedId: string | null;
  busy: boolean;
  onSelect: (id: string) => void;
  onResume: (id: string) => void;
  onDelete: (game: Stats) => void;
  onNew: () => void;
}) {
  const [filter, setFilter] = useState<"all" | "played">("all");
  const [limit, setLimit] = useState(10);
  const current =
    games.find((g) => g.id === (selectedId ?? currentId)) ?? games[0];
  const filtered =
    filter === "played" ? games.filter((g) => g.hands > 0) : games;
  const trends = gameTrends(current?.history ?? []);
  return (
    <section className="game-library" aria-label="Games and stats">
      <div className="library-heading">
        <div>
          <h2>Your games</h2>
          <p className="quiet">
            {games.length} saved · {games.reduce((sum, g) => sum + g.hands, 0)}{" "}
            hands recorded
          </p>
        </div>
        <button className="primary" disabled={busy} onClick={onNew}>
          New game
        </button>
      </div>
      {!games.length ? (
        <div className="panel library-empty">
          <h3>No saved games</h3>
          <p>
            Start a game to track your chip profit and review your decisions.
          </p>
          <button className="secondary" disabled={busy} onClick={onNew}>
            Set up a game
          </button>
        </div>
      ) : (
        <div className="game-library-grid">
          <aside className="panel games-list" aria-label="Saved games">
            <label htmlFor="game-filter">Show</label>
            <select
              id="game-filter"
              value={filter}
              onChange={(e) => {
                setFilter(e.target.value as "all" | "played");
                setLimit(10);
              }}
            >
              <option value="all">All games</option>
              <option value="played">With completed hands</option>
            </select>
            <div className="game-list-items">
              {filtered.slice(0, limit).map((g) => (
                <button
                  className={`game-list-item ${g.id === current?.id ? "selected" : ""}`}
                  key={g.id}
                  aria-label={`View Game ${g.gameNumber} stats`}
                  aria-pressed={g.id === current?.id}
                  onClick={() => onSelect(g.id)}
                  disabled={busy}
                >
                  <span className="game-list-title">
                    Game {g.gameNumber}
                    <span>{formatChips(g.profit)} chips</span>
                  </span>
                  <span className="quiet">
                    {g.players} players · {g.hands}{" "}
                    {g.hands === 1 ? "hand" : "hands"}
                    {g.replayOf
                      ? ` · Replay of hand ${g.replayOf.handNumber}`
                      : ""}
                    {g.branchOf
                      ? ` · Branch of hand ${g.branchOf.handNumber}, decision ${g.branchOf.sequence}`
                      : ""}
                    {g.id === currentId ? " · At table" : ""}
                  </span>
                  <time className="quiet" dateTime={g.startedAt}>
                    {new Date(g.startedAt).toLocaleString(undefined, {
                      month: "short",
                      day: "numeric",
                      hour: "2-digit",
                      minute: "2-digit",
                    })}
                  </time>
                </button>
              ))}
            </div>
            {!filtered.length && (
              <p className="quiet">No games match this filter.</p>
            )}
            {filtered.length > limit && (
              <button
                className="secondary"
                onClick={() => setLimit((n) => n + 10)}
              >
                Show more games
              </button>
            )}
          </aside>
          {current && (
            <section
              className="panel game-detail"
              aria-label={`Game ${current.gameNumber} stats`}
            >
              <div className="game-detail-heading">
                <div>
                  <h2>Game {current.gameNumber}</h2>
                  {current.replayOf && (
                    <p className="quiet">
                      Replay of hand {current.replayOf.handNumber} · original
                      result kept separately
                    </p>
                  )}
                  {current.branchOf && (
                    <p className="quiet">
                      Practice branch of hand {current.branchOf.handNumber},
                      decision {current.branchOf.sequence} · original result
                      kept separately
                    </p>
                  )}
                  <p className="quiet">
                    {current.players} players ·{" "}
                    {current.inProgress
                      ? `Hand ${current.currentHand} in progress`
                      : `Hand ${current.currentHand} finished`}
                  </p>
                </div>
                <div className="game-management">
                  <button
                    className="primary"
                    disabled={busy}
                    onClick={() => onResume(current.id)}
                  >
                    {current.inProgress ? "Resume game" : "Back to table"}
                  </button>
                  <button
                    className="secondary delete-game-button"
                    disabled={busy}
                    onClick={() => onDelete(current)}
                  >
                    Delete game
                  </button>
                </div>
              </div>
              <div className="game-metrics">
                <div>
                  <span>Profit</span>
                  <strong>{formatChips(current.profit)} chips</strong>
                </div>
                <div>
                  <span>Hands completed</span>
                  <strong>{current.hands}</strong>
                </div>
              </div>
              <p className="quiet stats-caption">
                Completed hands only. Poker skill is not scored.
              </p>
              {!current.replayOf &&
                !current.branchOf &&
                current.currentHand >
                  current.hands + (current.inProgress ? 1 : 0) && (
                  <p className="quiet">
                    Earlier hands from before tracking was added are
                    unavailable. Profit starts with the first recorded hand.
                  </p>
                )}
              <details className="model-details">
                <summary>Decision stats · Bot model</summary>
                <p>{current.decisions} decisions reviewed.</p>
                {current.modelRating && (
                  <>
                    <p>
                      Bot model agreement:{" "}
                      <strong>
                        {current.modelRating.score === null
                          ? current.modelRating.inconclusiveDecisions > 0
                            ? "Inconclusive"
                            : "Not rated"
                          : `${current.modelRating.score.toFixed(1)} / 100`}
                      </strong>
                      .
                    </p>
                    <p className="quiet model-rating-coverage">
                      Model agreement averages{" "}
                      {current.modelRating.ratedDecisions} rated decisions.{" "}
                      {current.modelRating.inconclusiveDecisions} inconclusive
                      and {current.modelRating.unavailableDecisions} unrated
                      decisions are excluded. This uses information available at
                      each move, not the hand’s result, and measures agreement
                      with the bot model rather than general strategy.
                    </p>
                  </>
                )}
              </details>
              <details className="model-details profit-chart-details">
                <summary>Profit chart</summary>
                <div className="stats-charts">
                  <StatsChart title="Profit over time" points={trends.profit} />
                </div>
              </details>
              <details className="score-explainer">
                <summary>About the estimates</summary>
                <p>
                  Decision reviews compare estimated chip returns under the
                  stated bot rules and continuation assumptions. These estimates
                  are not validated poker lessons or skill grades. Smaller
                  sampling errors and exact arithmetic do not establish that the
                  opponent model is realistic. The new model-agreement score
                  uses a disclosed display scale and excludes inconclusive
                  comparisons. Earlier poker-skill scores remain hidden.
                </p>
                <p>
                  Showdown odds estimate wins and ties against possible hands.
                  They do not predict folds or automatically recommend calling
                  or raising. Winning one hand does not prove that its decisions
                  were good.
                </p>
                <p>
                  Stacks reset to 1,000 each hand. Profit adds completed hand
                  gains and losses.
                </p>
              </details>
              {!!current.history.length && (
                <details>
                  <summary>Hand results ({current.hands})</summary>
                  <div className="hand-results-scroll">
                    <table className="hand-results">
                      <thead>
                        <tr>
                          <th scope="col">Hand</th>
                          <th scope="col">Profit</th>
                          <th scope="col">Completed</th>
                        </tr>
                      </thead>
                      <tbody>
                        {current.history.map((h) => (
                          <tr key={h.handNumber}>
                            <th scope="row">{h.handNumber}</th>
                            <td>{formatChips(h.profit)}</td>
                            <td>
                              <time dateTime={h.completedAt}>
                                {new Date(h.completedAt).toLocaleString(
                                  undefined,
                                  {
                                    month: "short",
                                    day: "numeric",
                                    hour: "2-digit",
                                    minute: "2-digit",
                                  },
                                )}
                              </time>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </details>
              )}
            </section>
          )}
        </div>
      )}
    </section>
  );
}
