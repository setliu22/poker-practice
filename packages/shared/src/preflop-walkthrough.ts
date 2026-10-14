import type { OpeningChart } from "./preflop";
export const walkthroughSeats = [
  "Lojack",
  "Hijack",
  "Cutoff",
  "Button",
  "Small blind",
  "Big blind",
];
export function walkthroughChart(charts: OpeningChart[], position: string) {
  return charts.find(
    (chart) => chart.players === 6 && chart.position === position,
  );
}
export function baselineAction(chart: OpeningChart, hand: string) {
  const cell = chart.cells.find((cell) => cell.hand === hand);
  if (!cell) throw new Error("Hand is not in this opening baseline.");
  return cell.action;
}
export function cardsForHand(hand: string, seed: number): string[] {
  const suits = ["c", "d", "h", "s"],
    suit = seed % 4;
  return [
    hand[0] + suits[suit],
    hand[1] + suits[hand.endsWith("s") ? suit : (suit + 1) % 4],
  ];
}
export function preflopTransfer(charts: OpeningChart[], seed: number) {
  const positions = walkthroughSeats.slice(0, 4);
  const position = positions[(seed >>> 2) % positions.length];
  const chart = walkthroughChart(charts, position);
  if (!chart)
    throw new Error("The six-player opening baseline is unavailable.");
  const action = seed % 2 === 0 ? "raise" : "fold";
  const hands = chart.cells.filter((cell) => cell.action === action);
  const hand = hands[(seed >>> 4) % hands.length].hand;
  return {
    position,
    chart,
    hand,
    hole: cardsForHand(hand, seed >>> 8),
    action,
  };
}
/** BTN has posted zero. A raise from10 to25 adds15, so minimum next raise-to40. */
export const raisedPotExample = {
  raiseTo: 25,
  heroPosted: 0,
  callCost: 25,
  minimumRaiseTo: 40,
};
