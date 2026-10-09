import type Database from "better-sqlite3";
import type { TableState } from "../../../packages/poker/src/table";
import type {
  DecisionReview,
  DecisionStat,
  GameStats,
  HandStat,
} from "../../../packages/shared/src/table";

// Only information available when acting contributes. Actual revealed cards never grade a decision.
export function scoreDecision(round: DecisionReview): DecisionStat | null {
  if (round.street === "preflop" || !round.values.length) return null;
  const chosen = round.values.find((v) => v.key === round.chosenKey);
  if (!chosen) return null;
  const best = round.values.reduce((a, b) => (a.chips > b.chips ? a : b));
  const loss = Math.max(
    0,
    best.chips - chosen.chips - best.margin - chosen.margin,
  );
  return {
    street: round.street,
    loss,
    score: Math.max(0, 100 * (1 - loss / Math.max(10, round.pot))),
  };
}
const average = (items: DecisionStat[]) =>
  items.length
    ? Math.round(items.reduce((sum, d) => sum + d.score, 0) / items.length)
    : null;
export function saveHandStats(db: Database.Database, state: TableState) {
  if (!state.complete) return;
  const view = state.rounds ?? [];
  const hand: HandStat = {
    handNumber: state.handNumber,
    profit: state.players[0].stack - 1000,
    completedAt: new Date().toISOString(),
    decisions: view
      .map(scoreDecision)
      .filter((d): d is DecisionStat => d !== null),
  };
  db.prepare("INSERT OR IGNORE INTO bot_hand_stats VALUES(?,?,?)").run(
    state.id,
    state.handNumber,
    JSON.stringify(hand),
  );
}
export function gameStats(db: Database.Database): GameStats[] {
  const rows = db
    .prepare(
      "SELECT t.id,t.state,g.started_at FROM bot_tables t JOIN bot_games g ON g.table_id=t.id ORDER BY g.started_at DESC,t.rowid DESC",
    )
    .all() as { id: string; state: string; started_at: string }[];
  return rows.map((row) => {
    const state: TableState = JSON.parse(row.state);
    const hands = (
      db
        .prepare(
          "SELECT data FROM bot_hand_stats WHERE table_id=? ORDER BY hand_number DESC",
        )
        .all(row.id) as { data: string }[]
    ).map((r) => JSON.parse(r.data) as HandStat);
    const decisions = hands.flatMap((h) => h.decisions);
    return {
      id: row.id,
      startedAt: row.started_at,
      players: state.players.length,
      hands: hands.length,
      currentHand: state.handNumber,
      inProgress: !state.complete,
      profit: hands.reduce((sum, h) => sum + h.profit, 0),
      score: average(decisions),
      decisions: decisions.length,
      modelLoss: decisions.reduce((sum, d) => sum + d.loss, 0),
      streets: ["flop", "turn", "river"].flatMap((street) => {
        const items = decisions.filter((d) => d.street === street);
        return items.length
          ? [{ street, score: average(items)!, decisions: items.length }]
          : [];
      }),
      history: hands.map((h) => ({ ...h, score: average(h.decisions) })),
    };
  });
}
