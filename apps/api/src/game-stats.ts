import type Database from "better-sqlite3";
import type { TableState } from "../../../packages/poker/src/table";
import { decisionRating } from "../../../packages/poker/src/decision-rating";
import type {
  DecisionReview,
  DecisionStat,
  GameStats,
  HandStat,
} from "../../../packages/shared/src/table";

const SCORING_VERSION = 4;
const MODEL_ONLY_REASON =
  "These chip estimates depend on unvalidated bot-response and continuation assumptions. They are not reliable measures of poker skill, even when sampling is precise or the arithmetic is exact.";

function modelOnlyDecision(street: string): DecisionStat {
  return {
    street,
    score: null,
    loss: null,
    status: "model-only",
    reason: MODEL_ONLY_REASON,
  };
}

// Revealed cards and precise arithmetic cannot validate strategic assumptions.
// Keep the model comparison in the review, but do not turn it into a skill score.
export function scoreDecision(round: DecisionReview): DecisionStat | null {
  if (!round.values.length) return null;
  const chosen = round.values.find((v) => v.key === round.chosenKey);
  if (!chosen) return null;
  return {
    ...modelOnlyDecision(round.street),
    ...(round.analysisVersion === 7
      ? { modelRating: decisionRating(round) }
      : {}),
  };
}
export function saveHandStats(db: Database.Database, state: TableState) {
  if (!state.complete) return;
  const view = state.rounds ?? [];
  const hand: HandStat = {
    scoringVersion: SCORING_VERSION,
    modelRatingVersion: 1,
    modelAnalysisVersion: 7,
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
      (previous.scoringVersion ?? 1) < SCORING_VERSION ||
      previous.decisions.some(
        (d) => d.status !== "model-only" || d.score !== null || d.loss !== null,
      ) ||
      (hand.decisions.length > 0 &&
        (previous.decisions.length !== hand.decisions.length ||
          (hand.decisions.some((d) => d.modelRating) &&
            previous.modelAnalysisVersion !== 7) ||
          hand.decisions.some(
            (d, i) =>
              JSON.stringify(d.modelRating) !==
              JSON.stringify(previous.decisions[i]?.modelRating),
          )))
    ) {
      // A refreshed review may replace obsolete grading, never the historical outcome/date.
      db.prepare(
        "UPDATE bot_hand_stats SET data=? WHERE table_id=? AND hand_number=?",
      ).run(
        JSON.stringify({
          ...previous,
          decisions: hand.decisions.length
            ? hand.decisions
            : previous.decisions.map((d) => modelOnlyDecision(d.street)),
          scoringVersion: SCORING_VERSION,
          modelRatingVersion: 1,
          modelAnalysisVersion: 7,
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
      json_extract(t.state,'$.replayOf') AS replay_of,
      json_array_length(t.state,'$.players') AS players,
      json_extract(t.state,'$.handNumber') AS hand_number,
      json_extract(t.state,'$.complete') AS complete
      FROM bot_tables t JOIN bot_games g ON g.table_id=t.id LEFT JOIN bot_game_numbers n ON n.table_id=t.id ORDER BY g.started_at DESC,t.rowid DESC`,
    )
    .all() as {
    id: string;
    revision: number;
    replay_of: string | null;
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
      scoringVersion: SCORING_VERSION,
      // Historical scores must be hidden even when their frames no longer exist.
      decisions: hand.decisions.map((d) => ({
        ...modelOnlyDecision(d.street),
        ...(hand.modelRatingVersion === 1 &&
        hand.modelAnalysisVersion === 7 &&
        d.modelRating?.version === 1
          ? { modelRating: d.modelRating }
          : {}),
      })),
    }));
    const decisions = hands.flatMap((h) => h.decisions);
    const ratings = decisions.flatMap((d) =>
      d.modelRating ? [d.modelRating] : [],
    );
    const rated = ratings.filter((r) => r.score !== null);
    return {
      id: row.id,
      gameNumber: row.number ?? 0,
      revision: row.revision,
      ...(row.replay_of ? { replayOf: JSON.parse(row.replay_of) } : {}),
      startedAt: row.started_at,
      players: row.players,
      hands: hands.length,
      currentHand: row.hand_number,
      inProgress: !row.complete,
      profit: hands.reduce((sum, h) => sum + h.profit, 0),
      score: null,
      decisions: decisions.length,
      scoredDecisions: 0,
      unscoredDecisions: decisions.length,
      modelLoss: 0,
      streets: [],
      history: hands.map((h) => ({ ...h, score: null })),
      ...(ratings.length
        ? {
            modelRating: {
              score: rated.length
                ? rated.reduce((sum, r) => sum + r.score!, 0) / rated.length
                : null,
              ratedDecisions: rated.length,
              inconclusiveDecisions: ratings.filter(
                (r) => r.status === "inconclusive",
              ).length,
              unavailableDecisions:
                decisions.length -
                rated.length -
                ratings.filter((r) => r.status === "inconclusive").length,
            },
          }
        : {}),
    };
  });
}
