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
  const unscored = (
    status: "legacy" | "inconclusive",
    reason: string,
  ): DecisionStat => ({
    street: round.street,
    score: null,
    loss: null,
    status,
    reason,
  });
  // Separate intervals around two averages cannot establish the uncertainty of their difference.
  if (
    (round.analysisVersion !== 2 && round.analysisVersion !== 3) ||
    !round.comparisons
  )
    return unscored(
      "legacy",
      "This review predates paired action comparisons.",
    );
  const alternatives = round.values.filter((v) => v.key !== chosen.key);
  const comparisons = round.comparisons;
  if (!alternatives.length) return null;
  const valid =
    comparisons.length === alternatives.length &&
    alternatives.every((v) => {
      const matches = comparisons.filter((c) => c.key === v.key);
      if (matches.length !== 1) return false;
      const c = matches[0];
      return (
        Number.isFinite(c.difference) &&
        Number.isFinite(c.margin) &&
        c.margin >= 0 &&
        ((Number.isInteger(c.samples) && c.samples >= 100) ||
          (c.samples === 0 && c.margin === 0 && chosen.exact && v.exact))
      );
    });
  if (!valid || !Number.isFinite(round.pot) || round.pot < 0)
    return unscored(
      "inconclusive",
      "There is not enough paired simulation evidence to score this choice.",
    );
  const scale = Math.max(10, round.pot);
  const material = Math.max(10, round.pot * 0.1);
  const loss = Math.max(0, ...comparisons.map((c) => c.difference));
  const upperLoss = Math.max(
    0,
    ...comparisons.map((c) => c.difference + c.margin),
  );
  // Broad uncertainty must never improve a score. Near a good-looking choice,
  // withhold the score if sampling could still conceal a meaningful missed value.
  if (
    comparisons.some((c) => c.margin > material) ||
    (loss <= material && upperLoss > material)
  )
    return unscored(
      "inconclusive",
      "Sampling uncertainty still permits a materially different action assessment.",
    );
  return {
    street: round.street,
    loss,
    score: Math.max(0, 100 * (1 - loss / scale)),
    status: "scored",
    reason:
      "Estimated regret within the trainer's one-round opponent model; not a measure of real-world optimal play.",
  };
}
const isScored = (
  d: DecisionStat,
): d is DecisionStat & { score: number; loss: number } =>
  d.status === "scored" && d.score !== null && d.loss !== null;
const average = (items: DecisionStat[]) => {
  const scored = items.filter(isScored);
  return scored.length
    ? Math.round(scored.reduce((sum, d) => sum + d.score, 0) / scored.length)
    : null;
};
export function saveHandStats(db: Database.Database, state: TableState) {
  if (!state.complete) return;
  const view = state.rounds ?? [];
  const postflop = view.filter((r) => r.street !== "preflop");
  const scoringVersion = postflop.every(
    (r) =>
      (r.analysisVersion === 2 || r.analysisVersion === 3) &&
      Array.isArray(r.comparisons),
  )
    ? postflop.some((r) => r.analysisVersion === 2)
      ? 2
      : 3
    : 1;
  const hand: HandStat = {
    scoringVersion,
    handNumber: state.handNumber,
    profit: state.players[0].stack - 1000,
    completedAt: new Date().toISOString(),
    decisions: view
      .map(scoreDecision)
      .filter((d): d is DecisionStat => d !== null),
  };
  db.transaction(() => {
    const existing = db
      .prepare(
        "SELECT data FROM bot_hand_stats WHERE table_id=? AND hand_number=?",
      )
      .get(state.id, state.handNumber) as { data: string } | undefined;
    if (!existing) {
      db.prepare("INSERT INTO bot_hand_stats VALUES(?,?,?)").run(
        state.id,
        state.handNumber,
        JSON.stringify(hand),
      );
      return;
    }
    const previous = JSON.parse(existing.data) as HandStat;
    if (
      (previous.scoringVersion ?? 1) < scoringVersion &&
      scoringVersion >= 2 &&
      (view.some((r) => r.street !== "preflop") ||
        previous.decisions.length === 0)
    ) {
      // A refreshed review may replace obsolete grading, never the historical outcome/date.
      db.prepare(
        "UPDATE bot_hand_stats SET data=? WHERE table_id=? AND hand_number=?",
      ).run(
        JSON.stringify({
          ...previous,
          decisions: hand.decisions,
          scoringVersion,
        }),
        state.id,
        state.handNumber,
      );
    }
  })();
}
export function gameStats(db: Database.Database): GameStats[] {
  const rows = db
    .prepare(
      `SELECT t.id,g.started_at,n.number,
      json_extract(t.state,'$.revision') AS revision,
      json_array_length(t.state,'$.players') AS players,
      json_extract(t.state,'$.handNumber') AS hand_number,
      json_extract(t.state,'$.complete') AS complete
      FROM bot_tables t JOIN bot_games g ON g.table_id=t.id LEFT JOIN bot_game_numbers n ON n.table_id=t.id ORDER BY g.started_at DESC,t.rowid DESC`,
    )
    .all() as {
    id: string;
    revision: number;
    players: number;
    hand_number: number;
    complete: number;
    started_at: string;
    number: number | null;
  }[];
  const histories = new Map<string, HandStat[]>();
  for (const row of db
    .prepare(
      "SELECT table_id,data FROM bot_hand_stats ORDER BY hand_number DESC",
    )
    .all() as { table_id: string; data: string }[]) {
    const hands = histories.get(row.table_id) ?? [];
    hands.push(JSON.parse(row.data));
    histories.set(row.table_id, hands);
  }
  return rows.map((row) => {
    const hands = (histories.get(row.id) ?? []).map((hand) => ({
      ...hand,
      decisions: hand.decisions.map((d): DecisionStat =>
        d.status
          ? d
          : {
              ...d,
              status: "legacy",
              score: null,
              loss: null,
              reason: "This hand predates paired action comparisons.",
            },
      ),
    }));
    const decisions = hands.flatMap((h) => h.decisions);
    return {
      id: row.id,
      gameNumber: row.number ?? 0,
      revision: row.revision,
      startedAt: row.started_at,
      players: row.players,
      hands: hands.length,
      currentHand: row.hand_number,
      inProgress: !row.complete,
      profit: hands.reduce((sum, h) => sum + h.profit, 0),
      score: average(decisions),
      decisions: decisions.length,
      scoredDecisions: decisions.filter(isScored).length,
      unscoredDecisions: decisions.filter((d) => !isScored(d)).length,
      modelLoss: decisions.filter(isScored).reduce((sum, d) => sum + d.loss, 0),
      streets: ["flop", "turn", "river"].flatMap((street) => {
        const items = decisions.filter(
          (d) => d.street === street && isScored(d),
        );
        return items.length
          ? [{ street, score: average(items)!, decisions: items.length }]
          : [];
      }),
      history: hands.map((h) => ({ ...h, score: average(h.decisions) })),
    };
  });
}
