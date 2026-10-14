import { describe, expect, it } from "vitest";
import {
  gameStats,
  saveHandStats,
  scoreDecision,
} from "../apps/api/src/game-stats";
import { openDatabase } from "../apps/api/src/database";
import { createTable } from "../packages/poker/src/table";
import type { DecisionReview } from "../packages/shared/src/table";

// Independent EV fixtures: +10 ±2 chips costs 1 BB of modeled value => score 50.
function round(difference: number, margin: number): DecisionReview {
  return {
    analysisVersion: 7,
    street: "river",
    chosenKey: "call",
    values: [
      { key: "call", chips: -10, margin: 3, exact: false, samples: 640 },
      {
        key: "fold",
        chips: -10 + difference,
        margin: 3,
        exact: false,
        samples: 640,
      },
    ],
    comparisons: [
      {
        key: "fold",
        difference,
        margin,
        samples: 640,
        clear: difference > margin,
      },
    ],
  } as DecisionReview;
}

describe("separate model agreement statistics", () => {
  it("keeps skill grading withheld while recording a qualified public-information rating", () => {
    expect(scoreDecision(round(10, 2))).toMatchObject({
      status: "model-only",
      score: null,
      loss: null,
      modelRating: {
        status: "estimated",
        score: 50,
        scoreInterval: [45.5, 55.6],
      },
    });
    expect(
      scoreDecision({
        ...round(10, 2),
        actualCards: [{ cards: ["As", "Ah"] }] as never,
      }),
    ).toEqual(scoreDecision(round(10, 2)));
    expect(scoreDecision(round(3, 10))?.modelRating).toMatchObject({
      status: "inconclusive",
      score: null,
    });
  });
  it("averages only rated decisions and preserves profit, date and scores on repeated saves", () => {
    const db = openDatabase(":memory:");
    try {
      const state = createTable("model-stats", 2, 1);
      state.complete = true;
      state.players[0].stack = 1070;
      state.rounds = [round(10, 2), round(-20, 2), round(3, 10)];
      db.prepare("INSERT INTO bot_tables VALUES(?,?)").run(
        state.id,
        JSON.stringify(state),
      );
      db.prepare("INSERT INTO bot_games VALUES(?,?)").run(
        state.id,
        "2026-01-01T00:00:00Z",
      );
      db.prepare("INSERT INTO bot_game_numbers(table_id) VALUES(?)").run(
        state.id,
      );
      saveHandStats(db, state);
      const [game] = gameStats(db);
      expect(game).toMatchObject({
        profit: 70,
        score: null,
        scoredDecisions: 0,
        modelRating: {
          score: 75,
          ratedDecisions: 2,
          inconclusiveDecisions: 1,
          unavailableDecisions: 0,
        },
      });
      expect(game.history[0].modelRatingVersion).toBe(1);
      expect(game.history[0].decisions[0].modelRating?.score).toBe(50);
      const before = db.prepare("SELECT data FROM bot_hand_stats").get();
      state.players[0].stack = 900;
      state.rounds.forEach((r) => {
        r.actualProbability = { win: 100 } as never;
      });
      saveHandStats(db, state);
      expect(db.prepare("SELECT data FROM bot_hand_stats").get()).toEqual(
        before,
      );
      expect(gameStats(db)[0].profit).toBe(70);
      // A shortened canonical review must not retain extra old ratings.
      state.rounds = state.rounds.slice(0, 1);
      saveHandStats(db, state);
      expect(gameStats(db)[0]).toMatchObject({
        profit: 70,
        modelRating: { score: 50, ratedDecisions: 1, inconclusiveDecisions: 0 },
      });
      expect(gameStats(db)[0].history[0].completedAt).toBe(
        game.history[0].completedAt,
      );
    } finally {
      db.close();
    }
  });
  it("never revives old skill grades as new model ratings without verified review data", () => {
    const db = openDatabase(":memory:");
    try {
      const state = createTable("old-grades", 2, 1);
      state.complete = true;
      db.prepare("INSERT INTO bot_tables VALUES(?,?)").run(
        state.id,
        JSON.stringify(state),
      );
      db.prepare("INSERT INTO bot_games VALUES(?,?)").run(
        state.id,
        "2026-01-01T00:00:00Z",
      );
      db.prepare("INSERT INTO bot_hand_stats VALUES(?,?,?)").run(
        state.id,
        1,
        JSON.stringify({
          handNumber: 1,
          profit: 50,
          completedAt: "2026-01-01T00:00:00Z",
          modelRatingVersion: 1,
          modelAnalysisVersion: 6,
          decisions: [
            {
              street: "river",
              score: 100,
              loss: 0,
              modelRating: { version: 1, score: 100 },
            },
          ],
        }),
      );
      const [game] = gameStats(db);
      expect(game.score).toBeNull();
      expect(game).not.toHaveProperty("modelRating");
      expect(game.history[0].decisions[0]).not.toHaveProperty("modelRating");
    } finally {
      db.close();
    }
  });
});
