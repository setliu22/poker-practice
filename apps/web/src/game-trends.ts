import type { GameStats } from "../../../packages/shared/src/table";
export type TrendPoint = {
  hand: number;
  time: number;
  value: number;
  decisions: number;
};
export function gameTrends(history: GameStats["history"]) {
  const hands = [...history].sort((a, b) => a.handNumber - b.handNumber);
  let profit = 0;
  const gains: TrendPoint[] = [],
    scores: TrendPoint[] = [];
  for (const hand of hands) {
    profit += hand.profit;
    const point = {
      hand: hand.handNumber,
      time: Date.parse(hand.completedAt),
      decisions: hand.decisions.filter((d) => d.status === "scored").length,
    };
    gains.push({ ...point, value: profit });
    if (hand.score !== null) scores.push({ ...point, value: hand.score });
  }
  return { profit: gains, score: scores };
}
