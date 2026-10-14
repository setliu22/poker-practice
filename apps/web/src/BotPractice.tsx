import { useEffect, useRef, useState, type CSSProperties } from "react";
import type {
  BotProfile,
  GameStats as Stats,
  LiveOdds,
  TableAction,
  TableView,
} from "../../../packages/shared/src/table";
import { BotProfileDialog } from "./BotProfileDialog";
import { DeleteGameDialog } from "./DeleteGameDialog";
import { GameStats, formatChips } from "./GameStats";
import { Cards } from "./Cards";
import { RoundReview } from "./RoundReview";
import { SolverChart } from "./SolverChart";
import { MoveRecommendation } from "./MoveRecommendation";
import type { MoveAdvice } from "../../../packages/shared/src/assistant";
import { StudyDialog } from "./StudyDialog";
import { DecisionAssistant } from "./DecisionAssistant";
import { LiveOddsDialog } from "./LiveOddsDialog";
import { PreflopGuideDialog } from "./PreflopGuide";
import type { PreflopGuide } from "../../../packages/shared/src/preflop";
import { positionName } from "../../../packages/shared/src/positions";

// Clockwise seats with the learner anchored at the bottom. Dense tables use
// wider spacing at the ends of the oval so small screens remain readable.
const seatPositions: Record<number, [number, number][]> = {
  2: [
    [50, 86],
    [50, 14],
  ],
  3: [
    [50, 86],
    [14, 28],
    [86, 28],
  ],
  4: [
    [50, 86],
    [14, 48],
    [50, 14],
    [86, 48],
  ],
  5: [
    [50, 86],
    [14, 67],
    [24, 22],
    [76, 22],
    [86, 67],
  ],
  6: [
    [50, 86],
    [14, 70],
    [14, 32],
    [50, 12],
    [86, 32],
    [86, 70],
  ],
  7: [
    [50, 86],
    [14, 74],
    [14, 43],
    [28, 14],
    [72, 14],
    [86, 43],
    [86, 74],
  ],
  8: [
    [50, 86],
    [14, 73],
    [14, 48],
    [20, 23],
    [50, 12],
    [80, 23],
    [86, 48],
    [86, 73],
  ],
  9: [
    [50, 86],
    [14, 75],
    [14, 53],
    [14, 31],
    [34, 12],
    [66, 12],
    [86, 31],
    [86, 53],
    [86, 75],
  ],
};
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
  const [study, setStudy] = useState<
    "assistant" | "review" | "history" | "solver" | null
  >(null);
  const [profile, setProfile] = useState<BotProfile | null>(null);
  const [odds, setOdds] = useState<LiveOdds | null>(null);
  const [oddsLoading, setOddsLoading] = useState(false);
  const [oddsError, setOddsError] = useState("");
  const [oddsOpen, setOddsOpen] = useState(false);
  const oddsRequest = useRef(0);
  const oddsController = useRef<AbortController | null>(null);
  const oddsButton = useRef<HTMLButtonElement>(null);
  const [guide, setGuide] = useState<PreflopGuide | null>(null);
  const [guideOpen, setGuideOpen] = useState(false);
  const [guideLoading, setGuideLoading] = useState(false);
  const [guideError, setGuideError] = useState("");
  const guideRequest = useRef(0);
  const guideController = useRef<AbortController | null>(null);
  const guideButton = useRef<HTMLButtonElement>(null);
  const [table, setTable] = useState<TableView | null>(null),
    [count, setCount] = useState(2),
    [dealMode, setDealMode] = useState<"random" | "easy">(() =>
      localStorage.getItem("poker-practice-deal-mode") === "easy"
        ? "easy"
        : "random",
    ),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(""),
    [raiseTo, setRaiseTo] = useState("");
  const [moveAdvice, setMoveAdvice] = useState<MoveAdvice | null>(null);
  const inFlight = useRef(false);
  const gamesNav = useRef<HTMLButtonElement>(null);
  const setupButton = useRef<HTMLButtonElement>(null);
  const summary = useRef<HTMLElement>(null),
    actionHeading = useRef<HTMLHeadingElement>(null);
  const previousComplete = useRef(false);
  function clearOdds() {
    ++oddsRequest.current;
    oddsController.current?.abort();
    oddsController.current = null;
    setOdds(null);
    setOddsError("");
    setOddsLoading(false);
    setOddsOpen(false);
  }
  function clearGuide() {
    ++guideRequest.current;
    guideController.current?.abort();
    guideController.current = null;
    setGuide(null);
    setGuideOpen(false);
    setGuideLoading(false);
    setGuideError("");
  }
  function clearHelp() {
    setStudy(null);
    clearOdds();
    clearGuide();
  }
  const save = (t: TableView, syncSettings = true) => {
    setMoveAdvice(null);
    clearHelp();
    setTable(t);
    setSelectedGameId(t.id);
    void refreshGames();
    if (syncSettings) {
      setCount(t.players.length);
      setDealMode(t.dealMode ?? "random");
      localStorage.setItem("poker-practice-deal-mode", t.dealMode ?? "random");
    }
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
  useEffect(
    () => () => {
      ++oddsRequest.current;
      oddsController.current?.abort();
      ++guideRequest.current;
      guideController.current?.abort();
    },
    [],
  );
  async function checkGuide() {
    if (
      !table ||
      table.complete ||
      !table.legal ||
      table.actor !== 0 ||
      busy ||
      guideLoading
    )
      return;
    if (guide) {
      setGuideOpen(true);
      return;
    }
    const snapshot = table;
    const sequence = ++guideRequest.current;
    const controller = new AbortController();
    guideController.current?.abort();
    guideController.current = controller;
    setGuideLoading(true);
    setGuideError("");
    setGuideOpen(true);
    try {
      const response = await fetch(`/api/tables/${snapshot.id}/guide`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ revision: snapshot.revision }),
        signal: controller.signal,
      });
      const result = await response.json();
      if (!response.ok)
        throw new Error(result.error ?? "Could not load the opening guide.");
      if (sequence !== guideRequest.current || controller.signal.aborted)
        return;
      setGuide(result as PreflopGuide);
    } catch (err) {
      if (sequence !== guideRequest.current || controller.signal.aborted)
        return;
      setGuideError((err as Error).message);
    } finally {
      if (sequence === guideRequest.current) {
        setGuideLoading(false);
        guideController.current = null;
      }
    }
  }
  async function checkOdds() {
    if (
      !table ||
      table.complete ||
      table.players[0].folded ||
      busy ||
      oddsLoading
    )
      return;
    if (odds) {
      setOddsOpen(true);
      return;
    }
    const snapshot = table;
    const sequence = ++oddsRequest.current;
    const controller = new AbortController();
    oddsController.current?.abort();
    oddsController.current = controller;
    setOdds(null);
    setOddsLoading(true);
    setOddsError("");
    try {
      const response = await fetch(`/api/tables/${snapshot.id}/odds`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ revision: snapshot.revision }),
        signal: controller.signal,
      });
      const result = await response.json();
      if (!response.ok)
        throw new Error(result.error ?? "Could not estimate your odds.");
      if (sequence !== oddsRequest.current) return;
      if (
        result.revision !== snapshot.revision ||
        result.handNumber !== snapshot.handNumber
      )
        throw new Error("The hand changed. Check your odds again.");
      setOdds(result as LiveOdds);
      setOddsOpen(true);
    } catch (err) {
      if (sequence !== oddsRequest.current || controller.signal.aborted) return;
      setOddsError((err as Error).message);
      setOddsOpen(true);
    } finally {
      if (sequence === oddsRequest.current) {
        setOddsLoading(false);
        oddsController.current = null;
      }
    }
  }
  async function resume(id: string) {
    if (inFlight.current) return;
    inFlight.current = true;
    clearHelp();
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
    clearHelp();
    setBusy(true);
    setError("");
    try {
      save(await request<TableView>("", { players: count, dealMode }));
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
    clearHelp();
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
      save(t, false);
    } catch (e) {
      setError((e as Error).message);
      try {
        save(await request<TableView>("/" + table.id), false);
      } catch {
        /* Keep the last visible state; stale revisions cannot apply twice. */
      }
    } finally {
      setBusy(false);
      inFlight.current = false;
    }
  }
  async function restartHand() {
    if (!table || inFlight.current) return;
    if (
      !window.confirm(
        "Restart this hand with the same cards, dealer and bots? This replaces this hand’s result; earlier hands stay saved. Knowing revealed cards can affect your replay decisions.",
      )
    )
      return;
    inFlight.current = true;
    clearHelp();
    setBusy(true);
    setError("");
    try {
      save(
        await request<TableView>(`/${table.id}/reset-hand`, {
          revision: table.revision,
          actionId: crypto.randomUUID(),
        }),
        false,
      );
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
      inFlight.current = false;
    }
  }
  async function replay() {
    if (!table?.complete || inFlight.current) return;
    inFlight.current = true;
    clearHelp();
    setBusy(true);
    setError("");
    try {
      save(
        await request<TableView>(`/${table.id}/replay`, {
          revision: table.revision,
          actionId: crypto.randomUUID(),
        }),
      );
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
      inFlight.current = false;
    }
  }
  function newGame() {
    if (inFlight.current) return;
    clearHelp();
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
        clearHelp();
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
      {guideOpen && (
        <PreflopGuideDialog
          guide={guide}
          error={guideError}
          loading={guideLoading}
          onClose={() => {
            if (guideLoading) clearGuide();
            else setGuideOpen(false);
            requestAnimationFrame(() => guideButton.current?.focus());
          }}
          onSolver={() => {
            setGuideOpen(false);
            setStudy("solver");
          }}
          onStudy={() => {
            setGuideOpen(false);
            setStudy("assistant");
          }}
          onRetry={() => void checkGuide()}
        />
      )}
      {oddsOpen && (
        <LiveOddsDialog
          odds={odds}
          error={oddsError}
          loading={oddsLoading}
          onClose={() => {
            if (oddsLoading) clearOdds();
            else setOddsOpen(false);
            requestAnimationFrame(() => oddsButton.current?.focus());
          }}
          onRetry={() => void checkOdds()}
        />
      )}
      {study && table && (
        <StudyDialog
          title={
            study === "solver"
              ? "Solver range chart"
              : study === "assistant"
                ? "Decision assistant"
                : study === "review"
                  ? "Hand review"
                  : "Hand history"
          }
          onClose={() => setStudy(null)}
        >
          {study === "assistant" &&
            !table.complete &&
            table.street === "preflop" &&
            table.legal && (
              <DecisionAssistant
                key={`${table.id}/${table.revision}`}
                table={table}
                recommendation={moveAdvice}
              />
            )}
          {study === "solver" && <SolverChart table={table} />}
          {study === "review" && (
            <>
              {table.complete && (
                <details>
                  <summary>Hand result and calculations</summary>
                  {table.review.map((r, i) => (
                    <div className="review-item" key={i}>
                      <h3>{r.title}</h3>
                      <p>{r.text}</p>
                    </div>
                  ))}
                </details>
              )}
              <RoundReview
                rounds={table.rounds ?? []}
                complete={table.complete}
              />
            </>
          )}
          {study === "history" && (
            <ol className="full-hand-history">
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
          )}
        </StudyDialog>
      )}
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
      <div className="page-heading bot-page-heading">
        <h1>Bot table</h1>
        {screen === "play" && (
          <div className="table-setup">
            <div className="table-setup-field">
              <label htmlFor="player-count">Players, including you</label>
              <select
                id="player-count"
                value={count}
                disabled={busy}
                aria-describedby={table ? "table-setup-note" : undefined}
                onChange={(e) => setCount(Number(e.target.value))}
              >
                {Array.from({ length: 8 }, (_, i) => i + 2).map((n) => (
                  <option key={n} value={n}>
                    {n} players · {n - 1} {n === 2 ? "bot" : "bots"}
                  </option>
                ))}
              </select>
            </div>
            <div className="table-setup-field">
              <label htmlFor="starting-hands">Starting hands</label>
              <select
                id="starting-hands"
                value={dealMode}
                disabled={busy}
                aria-describedby={table ? "table-setup-note" : undefined}
                onChange={(event) => {
                  const mode = event.target.value as "random" | "easy";
                  setDealMode(mode);
                  localStorage.setItem("poker-practice-deal-mode", mode);
                }}
              >
                <option value="random">Random deals</option>
                <option value="easy">Easy deals</option>
              </select>
            </div>
            <button
              ref={setupButton}
              className="secondary"
              disabled={busy}
              onClick={() => void start()}
            >
              {table ? "New table" : "Start table"}
            </button>
          </div>
        )}
      </div>
      {screen === "play" && table && (
        <p className="quiet table-setup-note" id="table-setup-note">
          These settings apply to New table. Your current game stays saved in
          Games; Deal next hand keeps its existing settings.
        </p>
      )}
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
      {screen === "play" && (table?.dealMode ?? dealMode) === "easy" && (
        <p className="easy-deal-note">
          <strong>Easy deals:</strong> pairs, two cards ten or higher, suited
          aces, and suited connectors from 65s. This filters your starting
          cards. Bots play normally; facing a raise can still make these hands a
          fold.
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
              {table?.replayOf && (
                <span className="pill">Replay · Hand {table.handNumber}</span>
              )}
              <span>{formatChips(currentGame.profit)} chips</span>
              <span>{currentGame.hands} hands</span>
              <button
                className="secondary"
                disabled={busy}
                onClick={() => void restartHand()}
              >
                Restart hand
              </button>
              {table?.street === "preflop" && !table.complete && (
                <button
                  className="secondary"
                  onClick={() => setStudy("assistant")}
                >
                  Decision assistant
                </button>
              )}
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
                    {table.replayOf ? "Replay · " : ""}Hand {table.handNumber} ·{" "}
                    {table.street}
                  </span>
                  <span className="quiet">{table.players.length} players</span>
                </div>
                <div
                  className="poker-table"
                  data-players={table.players.length}
                >
                  <div className="bot-board">
                    <h2>
                      Pot <span>{table.pot.toLocaleString()}</span>
                      <span className="sr-only"> chips</span>
                    </h2>
                    {table.board.length ? (
                      <Cards cards={table.board} />
                    ) : (
                      <p className="quiet">No community cards yet</p>
                    )}
                  </div>
                  <div className="bot-seats">
                    {table.players.map((p) => (
                      <section
                        key={p.seat}
                        style={
                          {
                            "--seat-left": `${seatPositions[table.players.length][p.seat][0]}%`,
                            "--seat-top": `${seatPositions[table.players.length][p.seat][1]}%`,
                          } as CSSProperties
                        }
                        className={`bot-seat ${p.seat === 0 ? "hero-seat" : ""} ${p.folded ? "folded-seat" : ""} ${table.actor === p.seat ? "acting-seat" : ""}`}
                        data-button-side={
                          p.seat === 0
                            ? "top"
                            : seatPositions[table.players.length][p.seat][1] <
                                25
                              ? "bottom"
                              : seatPositions[table.players.length][p.seat][0] <
                                  50
                                ? "right"
                                : "left"
                        }
                        aria-label={`${p.name}${p.folded ? ", folded" : ""}`}
                      >
                        {p.seat === table.dealer && (
                          <span
                            className="dealer-button"
                            role="img"
                            aria-label={`${p.name} · Dealer button`}
                            title="Dealer button"
                          >
                            D
                          </span>
                        )}
                        <div className="seat-heading">
                          <h3>{p.name}</h3>
                          {p.profile && (
                            <button
                              type="button"
                              className="seat-profile-button"
                              aria-label={`${p.name} playstyle`}
                              aria-haspopup="dialog"
                              title="View playstyle"
                              onClick={() => setProfile(p.profile!)}
                            >
                              <svg
                                viewBox="0 0 24 24"
                                width="16"
                                height="16"
                                aria-hidden="true"
                              >
                                <circle
                                  cx="5"
                                  cy="12"
                                  r="1.5"
                                  fill="currentColor"
                                />
                                <circle
                                  cx="12"
                                  cy="12"
                                  r="1.5"
                                  fill="currentColor"
                                />
                                <circle
                                  cx="19"
                                  cy="12"
                                  r="1.5"
                                  fill="currentColor"
                                />
                              </svg>
                            </button>
                          )}
                        </div>
                        <span className="position-badge">
                          {positionName(
                            p.seat,
                            table.dealer,
                            table.players.length,
                          )}
                        </span>
                        <p className="seat-stack">
                          {p.stack.toLocaleString()} chips
                        </p>
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
                        {p.seat === 0 && !p.folded && !table.complete && (
                          <button
                            ref={oddsButton}
                            type="button"
                            className="secondary check-odds-button"
                            disabled={busy || oddsLoading}
                            aria-haspopup="dialog"
                            onClick={() => void checkOdds()}
                          >
                            {oddsLoading
                              ? "Calculating odds…"
                              : "Check My Odds"}
                          </button>
                        )}
                        {p.seat === 0 && oddsLoading && !oddsOpen && (
                          <span className="odds-loading-status" role="status">
                            Estimating your showdown odds…
                          </span>
                        )}
                        <p className="seat-status">
                          {p.folded
                            ? "Folded"
                            : p.allIn && !table.complete
                              ? "All-in"
                              : table.complete
                                ? p.seat === 0
                                  ? (p.handName ?? "Hand complete")
                                  : `Net ${formatChips(p.stack - 1000)}`
                                : table.actor === p.seat
                                  ? "Your turn"
                                  : `Bet ${p.streetBet}`}
                        </p>
                        {table.complete && p.seat === 0 && p.payout > 0 && (
                          <p className="payout">
                            Net {p.stack - 1000 >= 0 ? "+" : ""}
                            {p.stack - 1000}
                          </p>
                        )}
                      </section>
                    ))}
                  </div>
                </div>
                {!table.complete && legal && (
                  <section className="table-actions" aria-label="Your actions">
                    <div className="table-action-heading">
                      <h2 ref={actionHeading} tabIndex={-1}>
                        Your turn
                      </h2>
                      {table.street === "preflop" && (
                        <button
                          ref={guideButton}
                          type="button"
                          className="secondary preflop-guide-button"
                          disabled={busy || guideLoading}
                          aria-haspopup="dialog"
                          onClick={() => void checkGuide()}
                        >
                          <svg
                            width="16"
                            height="16"
                            viewBox="0 0 16 16"
                            aria-hidden="true"
                          >
                            <rect
                              x="1.5"
                              y="1.5"
                              width="13"
                              height="13"
                              rx="2"
                              fill="none"
                              stroke="currentColor"
                            />
                            <path
                              d="M1.5 6h13M1.5 10h13M6 1.5v13M10 1.5v13"
                              fill="none"
                              stroke="currentColor"
                            />
                          </svg>
                          Preflop guide
                        </button>
                      )}
                    </div>
                    <MoveRecommendation
                      key={`${table.id}/${table.revision}`}
                      table={table}
                      onAdvice={setMoveAdvice}
                      onSize={(amount) => setRaiseTo(String(amount))}
                    />
                    <p className="quiet">
                      {legal.toCall
                        ? `Call ${legal.toCall} chips${legal.toCall === table.players[0].stack ? " (all-in)" : ""}. Current bet: ${table.currentBet}.`
                        : "No bet to call."}
                    </p>
                    <div className="table-action-buttons">
                      <button
                        className={`secondary${moveAdvice?.action === "fold" ? " recommended-action" : ""}`}
                        disabled={busy}
                        onClick={() => void submit("fold")}
                      >
                        Fold
                      </button>
                      {legal.canCheck ? (
                        <button
                          className={`primary${moveAdvice?.action === "check" ? " recommended-action" : ""}`}
                          disabled={busy}
                          onClick={() => void submit("check")}
                        >
                          Check
                        </button>
                      ) : (
                        <button
                          className={`primary${moveAdvice?.action === "call" ? " recommended-action" : ""}`}
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
                            className={`primary${moveAdvice?.action === "raise" && Number(raiseTo) === moveAdvice.amount ? " recommended-action" : ""}`}
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
                      <details className="bot-showdown">
                        <summary>Best five cards at showdown</summary>
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
                      </details>
                    )}

                    {table.review[0] && <p>{table.review[0].text}</p>}
                    <div className="hand-complete-actions">
                      <button
                        className="primary"
                        disabled={busy}
                        onClick={() => void submit()}
                      >
                        Deal next hand →
                      </button>
                      <button
                        className="secondary"
                        disabled={busy}
                        onClick={() => void replay()}
                      >
                        Replay this hand
                      </button>
                    </div>
                    <p className="quiet">
                      Next hand moves the button. Replay repeats this deal in a
                      separate saved game and keeps this result.
                    </p>
                  </section>
                )}
                <div className="table-study-tools">
                  <button
                    className="secondary"
                    onClick={() => setStudy("review")}
                  >
                    Review decisions
                    {table.rounds?.length ? ` (${table.rounds.length})` : ""}
                  </button>
                  <button
                    className="secondary"
                    onClick={() => setStudy("history")}
                  >
                    Hand history
                  </button>
                </div>
              </section>
              <aside className="panel hand-history">
                <h2>Recent actions</h2>
                <ol>
                  {table.history.slice(-3).map((entry, i) => (
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
