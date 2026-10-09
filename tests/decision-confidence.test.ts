import { describe, expect, it } from "vitest";
import { scoreDecision, saveHandStats } from "../apps/api/src/game-stats";
import { openDatabase } from "../apps/api/src/database";
import { createTable } from "../packages/poker/src/table";
import type { DecisionReview, HandStat } from "../packages/shared/src/table";
function review(difference = 0, margin = 2): DecisionReview {
  return {
    analysisVersion: 2,
    street: "flop",
    pot: 100,
    chosenKey: "check",
    values: [
      { key: "check", chips: 0, margin: 30, exact: false },
      { key: "raise", chips: difference, margin: 30, exact: false },
    ],
    comparisons: [
      {
        key: "raise",
        difference,
        margin,
        samples: 640,
        clear: difference > margin,
      },
    ],
  } as DecisionReview;
}
describe("confidence-aware model scoring", () => {
  it("withholds noisy scores instead of rewarding uncertainty", () => {
    expect(scoreDecision(review(72.7, 52.7))).toMatchObject({
      status: "inconclusive",
      score: null,
      loss: null,
    });
    expect(scoreDecision(review(0, 52.7))).toMatchObject({
      status: "inconclusive",
      score: null,
    });
    expect(scoreDecision(review(8, 5))).toMatchObject({
      status: "inconclusive",
      score: null,
    });
  });
  it("uses paired regret without subtracting error bars from the penalty", () => {
    expect(scoreDecision(review(30, 5))).toMatchObject({
      status: "scored",
      score: 70,
      loss: 30,
    });
    expect(scoreDecision(review(-4, 2))).toMatchObject({
      status: "scored",
      score: 100,
      loss: 0,
    });
    expect(scoreDecision(review(200, 0))).toMatchObject({
      status: "scored",
      score: 0,
      loss: 200,
    });
  });
  it("leaves old, missing, duplicate, incomplete or low-sample comparisons unscored", () => {
    expect(
      scoreDecision({ ...review(), analysisVersion: undefined }),
    ).toMatchObject({ status: "legacy", score: null });
    for (const comparisons of [
      [],
      [review().comparisons![0], review().comparisons![0]],
      [{ ...review().comparisons![0], samples: 2 }],
      [{ ...review().comparisons![0], margin: NaN }],
    ]) {
      expect(scoreDecision({ ...review(), comparisons })).toMatchObject({
        status: "inconclusive",
        score: null,
      });
    }
  });
  it("permits analytic exact comparisons and ignores revealed cards", () => {
    const r = review(20, 0);
    r.values.forEach((v) => {
      v.exact = true;
    });
    r.comparisons![0].samples = 0;
    expect(scoreDecision(r)).toMatchObject({ status: "scored", score: 80 });
    expect(
      scoreDecision({ ...r, actualProbability: { win: 100 } as never }),
    ).toEqual(scoreDecision(r));
    expect(scoreDecision({ ...r, street: "preflop" })).toBeNull();
  });
  it("upgrades legacy grading once while preserving historical profit and completion date", () => {
    const db = openDatabase(":memory:");
    try {
      const state = createTable("upgrade", 2, 1);
      state.complete = true;
      db.prepare("INSERT INTO bot_tables VALUES(?,?)").run(
        state.id,
        JSON.stringify(state),
      );
      const old: HandStat = {
        handNumber: 1,
        completedAt: "2026-01-01T00:00:00Z",
        profit: 17,
        decisions: [{ street: "flop", score: 100, loss: 0 }],
      };
      db.prepare("INSERT INTO bot_hand_stats VALUES(?,?,?)").run(
        state.id,
        1,
        JSON.stringify(old),
      );
      state.rounds = [];
      saveHandStats(db, state);
      state.rounds = [{ ...review(), analysisVersion: undefined }];
      saveHandStats(db, state);
      const read = () =>
        JSON.parse(
          (
            db
              .prepare("SELECT data FROM bot_hand_stats WHERE table_id=?")
              .get(state.id) as { data: string }
          ).data,
        );
      expect(read()).toEqual(old);
      state.rounds = [review(30, 5)];
      saveHandStats(db, state);
      expect(read()).toMatchObject({
        completedAt: old.completedAt,
        profit: 17,
        scoringVersion: 2,
        decisions: [{ score: 70, status: "scored" }],
      });
      state.rounds = [review(0, 0)];
      saveHandStats(db, state);
      expect(read().decisions[0].score).toBe(70);
    } finally {
      db.close();
    }
  });
});
