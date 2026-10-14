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
describe("model estimates are not poker-skill scores", () => {
  it.each([
    [72.7, 52.7],
    [0, 52.7],
    [8, 5],
    [30, 5],
    [-4, 2],
    [200, 0],
  ])(
    "withholds skill grading for model difference %s ± %s",
    (difference, margin) => {
      expect(scoreDecision(review(difference, margin))).toMatchObject({
        status: "model-only",
        score: null,
        loss: null,
        reason: expect.stringContaining("unvalidated bot-response"),
      });
    },
  );
  it("does not let older or malformed comparisons revive a skill score", () => {
    expect(
      scoreDecision({ ...review(), analysisVersion: undefined }),
    ).toMatchObject({ status: "model-only", score: null });
    for (const comparisons of [
      [],
      [review().comparisons![0], review().comparisons![0]],
      [{ ...review().comparisons![0], samples: 2 }],
      [{ ...review().comparisons![0], margin: NaN }],
    ]) {
      expect(scoreDecision({ ...review(), comparisons })).toMatchObject({
        status: "model-only",
        score: null,
      });
    }
  });
  it("withholds even exact model comparisons and ignores revealed cards", () => {
    const r = review(20, 0);
    r.values.forEach((v) => {
      v.exact = true;
    });
    r.comparisons![0].samples = 0;
    expect(scoreDecision(r)).toMatchObject({
      status: "model-only",
      score: null,
      loss: null,
    });
    expect(
      scoreDecision({ ...r, actualProbability: { win: 100 } as never }),
    ).toEqual(scoreDecision(r));
    expect(scoreDecision({ ...r, street: "preflop" })).toMatchObject({
      status: "model-only",
      score: null,
    });
  });
  it("retires legacy grading without needing review frames or changing profit and date", () => {
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
      const read = () =>
        JSON.parse(
          (
            db
              .prepare("SELECT data FROM bot_hand_stats WHERE table_id=?")
              .get(state.id) as { data: string }
          ).data,
        );
      expect(read()).toMatchObject({
        completedAt: old.completedAt,
        profit: 17,
        scoringVersion: 4,
        decisions: [
          { street: "flop", score: null, loss: null, status: "model-only" },
        ],
      });
      const upgraded = read();
      state.rounds = [review(30, 5)];
      saveHandStats(db, state);
      expect(read()).toEqual(upgraded);
      state.rounds = [review(0, 0)];
      saveHandStats(db, state);
      expect(read()).toEqual(upgraded);
    } finally {
      db.close();
    }
  });
  it("uses available review frames when retiring previously scored comparisons", () => {
    const db = openDatabase(":memory:");
    try {
      const state = createTable("paired-upgrade", 2, 1);
      state.complete = true;
      state.rounds = [review(30, 0), { ...review(0, 0), street: "river" }];
      db.prepare("INSERT INTO bot_tables VALUES(?,?)").run(
        state.id,
        JSON.stringify(state),
      );
      db.prepare("INSERT INTO bot_hand_stats VALUES(?,?,?)").run(
        state.id,
        1,
        JSON.stringify({
          scoringVersion: 3,
          handNumber: 1,
          profit: -20,
          completedAt: "2026-01-02T00:00:00Z",
          decisions: [
            { street: "flop", score: 100, loss: 0, status: "scored" },
          ],
        }),
      );
      saveHandStats(db, state);
      const saved = JSON.parse(
        (
          db
            .prepare("SELECT data FROM bot_hand_stats WHERE table_id=?")
            .get(state.id) as { data: string }
        ).data,
      );
      expect(saved).toMatchObject({
        scoringVersion: 4,
        profit: -20,
        completedAt: "2026-01-02T00:00:00Z",
        decisions: [
          { street: "flop", score: null, loss: null, status: "model-only" },
          { street: "river", score: null, loss: null, status: "model-only" },
        ],
      });
    } finally {
      db.close();
    }
  });
});
