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
                    <span>{formatChips(g.profit)}</span>
                  </span>
                  <span className="quiet">
                    {g.players} players · {g.hands}{" "}
                    {g.hands === 1 ? "hand" : "hands"}
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
                <div>
                  <span>Decision score · model</span>
                  <strong>
                    {current.score === null ? "—" : `${current.score}/100`}
                  </strong>
                  <small>
                    {current.scoredDecisions} scored ·{" "}
                    {current.unscoredDecisions} unscored
                  </small>
                </div>
              </div>
              <p className="quiet stats-caption">
                Completed hands only. Scores compare your postflop choices with
                tested alternatives under the bot model.
              </p>
              {current.currentHand >
                current.hands + (current.inProgress ? 1 : 0) && (
                <p className="quiet">
                  Earlier hands from before tracking was added are unavailable.
                  Profit starts with the first recorded hand.
                </p>
              )}
              {current.unscoredDecisions > 0 && (
                <p className="quiet">
                  Unscored choices had too much simulation uncertainty or used
                  older analysis. They do not raise or lower your score.
                </p>
              )}
              <div className="stats-charts">
                <StatsChart title="Profit over time" points={trends.profit} />
                <StatsChart
                  title="Decision score over time"
                  points={trends.score}
                  score
                />
              </div>
              {!!current.streets.length && (
                <div className="street-scores" aria-label="Scores by street">
                  {current.streets.map((s) => (
                    <div key={s.street}>
                      <span>{s.street}</span>
                      <strong>{s.score}/100</strong>
                      <small>{s.decisions} decisions</small>
                    </div>
                  ))}
                </div>
              )}
              <details className="score-explainer">
                <summary>About the decision score</summary>
                <p>
                  The score uses your cards, the board, and estimated bot ranges
                  when you acted. Winning or losing the hand does not change the
                  score. Preflop and unfinished hands are excluded.
                </p>
                <p>
                  We compare choices on the same sampled deals, or calculate
                  their returns exactly where possible. Each pot-sized expected
                  loss reduces the score from 100 toward 0. Wide or inconclusive
                  intervals stay unscored. Game scores average assessed
                  decisions; the graph skips hands without a score.
                </p>
                <p>
                  A 100 means no estimated loss against tested alternatives with
                  sufficiently narrow sampling uncertainty. It does not mean
                  perfect poker or a realistic opponent model. The model
                  simulates the current betting round, assumes you call further
                  raises, and checks later streets through. It can miss future
                  betting costs and better bet sizes.
                </p>
                <p>
                  Stacks reset to 1,000 each hand. Profit adds completed hand
                  gains and losses.
                </p>
                <p>
                  For a sampled comparison to receive a score, its error margin
                  must be no wider than 10 chips or 10% of the pot, whichever is
                  larger. A good-looking choice is also withheld if its interval
                  still allows a loss larger than that threshold. Score = 100 ×
                  (1 − estimated loss / pot), bounded from 0 to 100, with a
                  minimum 10-chip pot scale. This precision rule is a trainer
                  setting, not a poker law. Skipped decisions mean the score
                  covers only part of your play.
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
                          <th scope="col">Score</th>
                          <th scope="col">Completed</th>
                        </tr>
                      </thead>
                      <tbody>
                        {current.history.map((h) => (
                          <tr key={h.handNumber}>
                            <th scope="row">{h.handNumber}</th>
                            <td>{formatChips(h.profit)}</td>
                            <td>{h.score === null ? "—" : `${h.score}/100`}</td>
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
