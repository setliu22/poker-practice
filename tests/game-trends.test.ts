import { expect, it } from "vitest";
import { gameTrends } from "../apps/web/src/game-trends";
import type { GameStats } from "../packages/shared/src/table";
it("plots chronological cumulative profit and individual hand scores without inventing unscored values", () => {
  const history: GameStats["history"] = [
    {
      handNumber: 3,
      profit: 15,
      completedAt: "2026-10-08T12:03:00Z",
      score: 80,
      decisions: [{ street: "turn", score: 80, loss: 2 }],
    },
    {
      handNumber: 2,
      profit: -20,
      completedAt: "2026-10-08T12:02:00Z",
      score: null,
      decisions: [],
    },
    {
      handNumber: 1,
      profit: 10,
      completedAt: "2026-10-08T12:01:00Z",
      score: 100,
      decisions: [{ street: "flop", score: 100, loss: 0 }],
    },
  ];
  const result = gameTrends(history);
  expect(result.profit.map((p) => [p.hand, p.value])).toEqual([
    [1, 10],
    [2, -10],
    [3, 5],
  ]);
  expect(result.score.map((p) => [p.hand, p.value])).toEqual([
    [1, 100],
    [3, 80],
  ]);
  expect(result.profit[0].time).toBe(Date.UTC(2026, 9, 8, 12, 1));
  expect(history[0].handNumber).toBe(3);
  expect(gameTrends([])).toEqual({ profit: [], score: [] });
});
