import { useEffect, useRef, useState } from "react";
import type {
  BotProfile,
  GameStats as Stats,
  TableAction,
  TableView,
} from "../../../packages/shared/src/table";
import { BotProfileDialog } from "./BotProfileDialog";
import { DeleteGameDialog } from "./DeleteGameDialog";
import { GameStats, formatChips } from "./GameStats";
import { Cards } from "./Cards";
import { RoundReview } from "./RoundReview";
async function request<T>(path: string, body?: unknown): Promise<T> {
  const response = await fetch(
    "/api/tables" + path,
    body === undefined
      ? undefined
      : {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
        },
  );
  const data = await response.json();
  if (!response.ok) throw new Error(data.error ?? "Request failed.");
  return data;
}
export function BotPractice() {
  const [screen, setScreen] = useState<"play" | "games">("play");
  const [selectedGameId, setSelectedGameId] = useState<string | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<Stats | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState("");
  const [gamesLoading, setGamesLoading] = useState(true);
  const [games, setGames] = useState<Stats[]>([]);
  const [gamesError, setGamesError] = useState("");
  const gamesRequest = useRef(0);
  async function refreshGames() {
    const sequence = ++gamesRequest.current;
    setGamesLoading(true);
    try {
      const response = await fetch("/api/games");
      if (!response.ok) throw new Error("Could not load game stats.");
      const nextGames: Stats[] = await response.json();
      if (sequence !== gamesRequest.current) return;
      setGames(nextGames);
      setGamesError("");
    } catch {
      if (sequence !== gamesRequest.current) return;
      setGamesError("Could not load game stats.");
    } finally {
      if (sequence === gamesRequest.current) setGamesLoading(false);
    }
  }
  const [profile, setProfile] = useState<BotProfile | null>(null);
  const [table, setTable] = useState<TableView | null>(null),
    [count, setCount] = useState(2),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(""),
    [raiseTo, setRaiseTo] = useState("");
  const inFlight = useRef(false);
  const gamesNav = useRef<HTMLButtonElement>(null);
  const setupButton = useRef<HTMLButtonElement>(null);
  const summary = useRef<HTMLElement>(null),
    actionHeading = useRef<HTMLHeadingElement>(null);
  const previousComplete = useRef(false);
  const save = (t: TableView) => {
    setTable(t);
    setSelectedGameId(t.id);
    void refreshGames();
    setCount(t.players.length);
    setRaiseTo(String(t.legal?.minRaiseTo ?? ""));
    localStorage.setItem("poker-practice-table", t.id);
  };
  useEffect(() => {
    let active = true;
    void refreshGames();
    const id = localStorage.getItem("poker-practice-table");
    if (id) {
      inFlight.current = true;
      setBusy(true);
      request<TableView>("/" + id)
        .then((t) => {
          if (active) save(t);
        })
        .catch((e) => {
          if (active) {
            setError(e.message);
            if (e.message.startsWith("Table not found"))
              localStorage.removeItem("poker-practice-table");
          }
        })
        .finally(() => {
          inFlight.current = false;
          if (active) setBusy(false);
        });
    }
    return () => {
      active = false;
    };
  }, []);
  useEffect(() => {
    if (table?.complete && !previousComplete.current) summary.current?.focus();
    if (table && !table.complete) actionHeading.current?.focus();
    previousComplete.current = !!table?.complete;
  }, [table]);
  async function resume(id: string) {
    if (inFlight.current) return;
    inFlight.current = true;
    setBusy(true);
    setError("");
    try {
      save(await request<TableView>("/" + id));
      setScreen("play");
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
      inFlight.current = false;
    }
  }
  async function start() {
    if (inFlight.current) return;
    inFlight.current = true;
    setBusy(true);
    setError("");
    try {
      save(await request<TableView>("", { players: count }));
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
      inFlight.current = false;
    }
  }
  async function submit(action?: TableAction) {
    if (!table || inFlight.current) return;
    inFlight.current = true;
    setBusy(true);
    setError("");
    try {
      const t = await request<TableView>(
        `/${table.id}/${action ? "actions" : "next"}`,
        {
          revision: table.revision,
          actionId: crypto.randomUUID(),
          ...(action
            ? {
                action,
                ...(action === "raise" ? { amount: Number(raiseTo) } : {}),
              }
            : {}),
        },
      );
      save(t);
    } catch (e) {
      setError((e as Error).message);
      try {
        save(await request<TableView>("/" + table.id));
      } catch {
        /* Keep the last visible state; stale revisions cannot apply twice. */
      }
    } finally {
      setBusy(false);
      inFlight.current = false;
    }
  }
  function newGame() {
    if (inFlight.current) return;
    setTable(null);
    setError("");
    setScreen("play");
    localStorage.removeItem("poker-practice-table");
    requestAnimationFrame(() => setupButton.current?.focus());
  }
  async function deleteGame() {
    if (!deleteTarget || inFlight.current) return;
    inFlight.current = true;
    setDeleting(true);
    setDeleteError("");
    try {
      const response = await fetch(`/api/games/${deleteTarget.id}`, {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ revision: deleteTarget.revision }),
      });
      if (!response.ok) {
        const result = await response.json();
        if (response.status === 409) await refreshGames();
        throw new Error(result.error ?? "Could not delete this game.");
      }
      ++gamesRequest.current; // Ignore any list response captured before deletion.
      setGames((games) => games.filter((g) => g.id !== deleteTarget.id));
      if (table?.id === deleteTarget.id) {
        setTable(null);
        localStorage.removeItem("poker-practice-table");
      }
      if (selectedGameId === deleteTarget.id) setSelectedGameId(null);
      setDeleteTarget(null);
      requestAnimationFrame(() => gamesNav.current?.focus());
      await refreshGames();
    } catch (err) {
      setDeleteError((err as Error).message);
    } finally {
      setDeleting(false);
      inFlight.current = false;
    }
  }
  const currentGame = games.find((g) => g.id === table?.id);
  const legal = table?.legal;
  const raiseValid =
    legal &&
    Number.isInteger(Number(raiseTo)) &&
    Number(raiseTo) >= legal.minRaiseTo &&
    Number(raiseTo) <= legal.maxRaiseTo;
  return (
    <>
      {deleteTarget && (
        <DeleteGameDialog
          game={deleteTarget}
          busy={deleting}
          error={deleteError}
          onCancel={() => {
            if (!deleting) setDeleteTarget(null);
          }}
          onDelete={() => void deleteGame()}
        />
      )}
      {profile && (
        <BotProfileDialog profile={profile} onClose={() => setProfile(null)} />
      )}
      <div className="page-heading">
        <h1>Bot table</h1>
        {screen === "play" && (
          <div className="table-setup">
            <label htmlFor="player-count">Players, including you</label>
            <select
              id="player-count"
              value={count}
              disabled={busy || (!!table && !table.complete)}
              onChange={(e) => setCount(Number(e.target.value))}
            >
              {Array.from({ length: 8 }, (_, i) => i + 2).map((n) => (
                <option key={n} value={n}>
                  {n} players · {n - 1} {n === 2 ? "bot" : "bots"}
                </option>
              ))}
            </select>
            <button
              ref={setupButton}
              className="secondary"
              disabled={busy || (!!table && !table.complete)}
              onClick={() => void start()}
            >
              {table ? "New table" : "Start table"}
            </button>
          </div>
        )}
      </div>
      <nav className="bot-view-nav" aria-label="Bot table views">
        <button
          className={screen === "play" ? "selected" : ""}
          aria-current={screen === "play" ? "page" : undefined}
          onClick={() => setScreen("play")}
        >
          Play
        </button>
        <button
          ref={gamesNav}
          className={screen === "games" ? "selected" : ""}
          aria-current={screen === "games" ? "page" : undefined}
          onClick={() => setScreen("games")}
        >
          Games
        </button>
      </nav>
      {screen === "play" && (
        <p className="table-rules">
          No-limit Hold’em · Blinds 5 / 10 · 1,000 chips per player, reset each
          hand · No rake
        </p>
      )}
      {error && (
        <p role="alert" className="error">
          {error}
        </p>
      )}
      {busy && (
        <p role="status" className="quiet">
          Updating table…
        </p>
      )}
      {gamesError && (
        <p role="alert" className="error">
          {gamesError}{" "}
          <button className="secondary" onClick={() => void refreshGames()}>
            Retry
          </button>
        </p>
      )}
      {screen === "games" ? (
        <>
          {gamesLoading && !games.length ? (
            <p role="status" className="quiet">
              Loading games…
            </p>
          ) : gamesError && !games.length ? null : (
            <GameStats
              games={games}
              currentId={table?.id}
              selectedId={selectedGameId}
              busy={busy || deleting}
              onSelect={setSelectedGameId}
              onResume={(id) => void resume(id)}
              onDelete={(game) => {
                setDeleteError("");
                setDeleteTarget(game);
              }}
              onNew={newGame}
            />
          )}
        </>
      ) : (
        <>
          {currentGame && (
            <div className="active-game-strip" aria-label="Current game stats">
              <strong>Game {currentGame.gameNumber}</strong>
              <span>{formatChips(currentGame.profit)} chips</span>
              <span>{currentGame.hands} hands</span>
              <button
                className="secondary"
                onClick={() => {
                  setSelectedGameId(currentGame.id);
                  setScreen("games");
                }}
              >
                View stats
              </button>
            </div>
          )}
          {!table ? (
            <section className="panel">
              <h2>Play against local bots</h2>
              <p>
                Choose 2–9 players above to start. Games save automatically;
                reopen them from Games.
              </p>
              <p className="quiet">
                Open a bot’s Playstyle button for its tendencies. Cards are
                revealed after the hand.
              </p>
            </section>
          ) : (
            <div className="bot-layout">
              <section
                className="panel bot-game"
                aria-label="Poker table"
                aria-busy={busy}
              >
                <div className="exercise-top">
                  <span className="pill">
                    Hand {table.handNumber} · {table.street}
                  </span>
                  <span className="quiet">{table.players.length} players</span>
                </div>
                <div className="bot-board">
                  <h2>Pot: {table.pot} chips</h2>
                  {table.board.length ? (
                    <Cards cards={table.board} />
                  ) : (
                    <p className="quiet">
                      Preflop · community cards have not been dealt
                    </p>
                  )}
                </div>
                <div className="bot-seats">
                  {table.players.map((p) => (
                    <section
                      key={p.seat}
                      className={`bot-seat ${p.seat === 0 ? "hero-seat" : ""} ${p.folded ? "folded-seat" : ""} ${table.actor === p.seat ? "acting-seat" : ""}`}
                      aria-label={`${p.name}${p.folded ? ", folded" : ""}`}
                    >
                      <div className="seat-heading">
                        <h3>{p.name}</h3>
                        {p.seat === table.dealer && (
                          <span className="dealer-badge" title="Dealer button">
                            D<span className="sr-only"> · Dealer</span>
                          </span>
                        )}
                      </div>
                      <p className="quiet">
                        {p.style === "Human" ? "Your seat" : p.style} ·{" "}
                        {p.stack} chips
                      </p>
                      {p.profile && (
                        <button
                          type="button"
                          className="secondary playstyle-button"
                          aria-label={`${p.name} playstyle`}
                          aria-haspopup="dialog"
                          onClick={() => setProfile(p.profile!)}
                        >
                          Playstyle
                        </button>
                      )}
                      {p.hole ? (
                        <Cards cards={p.hole} small={p.seat !== 0} />
                      ) : (
                        <div
                          className="hidden-cards"
                          aria-label="Hole cards hidden"
                        >
                          <span />
                          <span />
                        </div>
                      )}
                      <p className="seat-status">
                        {p.folded
                          ? "Folded"
                          : p.allIn && !table.complete
                            ? "All-in"
                            : table.complete
                              ? (p.handName ?? "Hand complete")
                              : table.actor === p.seat
                                ? "Your turn"
                                : `Bet this street: ${p.streetBet}`}
                      </p>
                      {table.complete && p.payout > 0 && (
                        <p className="payout">
                          Received {p.payout} · Net{" "}
                          {p.stack - 1000 >= 0 ? "+" : ""}
                          {p.stack - 1000}
                        </p>
                      )}
                    </section>
                  ))}
                </div>
                {!table.complete && legal && (
                  <section className="table-actions" aria-label="Your actions">
                    <h2 ref={actionHeading} tabIndex={-1}>
                      Your turn
                    </h2>
                    <p className="quiet">
                      {legal.toCall
                        ? `Call ${legal.toCall} chips${legal.toCall === table.players[0].stack ? " (all-in)" : ""}. Current bet: ${table.currentBet}.`
                        : "No bet to call."}
                    </p>
                    <div className="table-action-buttons">
                      <button
                        className="secondary"
                        disabled={busy}
                        onClick={() => void submit("fold")}
                      >
                        Fold
                      </button>
                      {legal.canCheck ? (
                        <button
                          className="primary"
                          disabled={busy}
                          onClick={() => void submit("check")}
                        >
                          Check
                        </button>
                      ) : (
                        <button
                          className="primary"
                          disabled={busy}
                          onClick={() => void submit("call")}
                        >
                          Call {legal.toCall}
                        </button>
                      )}
                    </div>
                    {legal.canRaise && (
                      <form
                        onSubmit={(e) => {
                          e.preventDefault();
                          if (raiseValid) void submit("raise");
                        }}
                        className="raise-controls"
                      >
                        <label htmlFor="raise-to">
                          {table.currentBet ? "Raise to" : "Bet"} (total chips
                          this street)
                        </label>
                        <div>
                          <input
                            id="raise-to"
                            type="number"
                            inputMode="numeric"
                            min={legal.minRaiseTo}
                            max={legal.maxRaiseTo}
                            step="1"
                            required
                            value={raiseTo}
                            disabled={busy}
                            onChange={(e) => setRaiseTo(e.target.value)}
                          />
                          <button
                            className="primary"
                            type="submit"
                            disabled={busy || !raiseValid}
                          >
                            {table.currentBet ? "Raise" : "Bet"}
                          </button>
                          <button
                            type="button"
                            className="secondary"
                            disabled={busy}
                            onClick={() => setRaiseTo(String(legal.maxRaiseTo))}
                          >
                            Set all-in
                          </button>
                        </div>
                        <small className="quiet">
                          Minimum {legal.minRaiseTo} · Maximum{" "}
                          {legal.maxRaiseTo}. “Set all-in” fills the amount;
                          submit to bet.
                        </small>
                      </form>
                    )}
                  </section>
                )}
                {table.complete && (
                  <section
                    className="table-review"
                    ref={summary}
                    tabIndex={-1}
                    aria-label="Hand feedback"
                  >
                    <h2>Hand complete</h2>
                    {table.players.some((p) => p.bestFive) && (
                      <div className="bot-showdown">
                        <h3>Best five cards at showdown</h3>
                        {table.players
                          .filter((p) => p.bestFive)
                          .map((p) => (
                            <div className="showdown-row" key={p.seat}>
                              <div>
                                <strong>
                                  {p.name} · {p.handName}
                                </strong>
                                <span className="quiet">
                                  Received {p.payout} chips
                                </span>
                              </div>
                              <Cards cards={p.bestFive!} small />
                            </div>
                          ))}
                      </div>
                    )}

                    {table.review.map((r, i) => (
                      <div key={i} className="review-item">
                        <p className="eyebrow">
                          {r.kind === "exact"
                            ? "CALCULATED RESULT"
                            : "BOT ASSUMPTIONS"}
                        </p>
                        <h3>{r.title}</h3>
                        <p>{r.text}</p>
                      </div>
                    ))}
                    <button
                      className="primary"
                      disabled={busy}
                      onClick={() => void submit()}
                    >
                      Deal next hand →
                    </button>
                    <p className="quiet">
                      The dealer rotates. Everyone starts the next hand with
                      1,000 chips.
                    </p>
                  </section>
                )}
                <RoundReview
                  rounds={table.rounds ?? []}
                  complete={table.complete}
                />
              </section>
              <aside className="panel hand-history">
                <h2>Hand history</h2>
                <ol>
                  {table.history.map((entry, i) => (
                    <li key={i}>
                      <span className="quiet">
                        {entry.street} ·{" "}
                        {entry.seat === null
                          ? "Table"
                          : table.players[entry.seat].name}
                      </span>
                      <span>{entry.text}</span>
                    </li>
                  ))}
                </ol>
              </aside>
            </div>
          )}
        </>
      )}
    </>
  );
}
