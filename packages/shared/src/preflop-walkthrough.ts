import type { OpeningChart } from "./preflop";

export type WalkthroughPlayers = 6 | 9;

export const walkthroughSeats = [
  "Lojack",
  "Hijack",
  "Cutoff",
  "Button",
  "Small blind",
  "Big blind",
];
/** Public preflop action order, including the two blinds after the button. */
export function walkthroughSeatsFor(players: WalkthroughPlayers): string[] {
  if (players !== 6 && players !== 9)
    throw new Error(
      "Walkthroughs require directly provided six- or nine-player charts.",
    );
  return players === 6
    ? [...walkthroughSeats]
    : [
        "Under the gun",
        "Under the gun + 1",
        "Under the gun + 2",
        ...walkthroughSeats,
      ];
}

export function walkthroughChart(
  charts: OpeningChart[],
  position: string,
  players: WalkthroughPlayers = 6,
) {
  walkthroughSeatsFor(players);
  return charts.find(
    (chart) => chart.players === players && chart.position === position,
  );
}
export function baselineAction(chart: OpeningChart, hand: string) {
  const cell = chart.cells.find((cell) => cell.hand === hand);
  if (!cell) throw new Error("Hand is not in this opening baseline.");
  return cell.action;
}
export function cardsForHand(hand: string, seed: number): string[] {
  const ranks = "AKQJT98765432";
  const first = ranks.indexOf(hand[0]),
    second = ranks.indexOf(hand[1]);
  if (
    first < 0 ||
    second < 0 ||
    first > second ||
    (first === second
      ? hand.length !== 2
      : hand.length !== 3 || !["s", "o"].includes(hand[2]))
  )
    throw new Error(
      "Use a canonical pair, suited or offsuit starting-hand class.",
    );
  assertSeed(seed);
  const suits = ["c", "d", "h", "s"],
    suit = seed % 4;
  return [
    hand[0] + suits[suit],
    hand[1] + suits[hand.endsWith("s") ? suit : (suit + 1) % 4],
  ];
}
export function preflopTransfer(
  charts: OpeningChart[],
  seed: number,
  players: WalkthroughPlayers = 6,
) {
  assertSeed(seed);
  const positions = walkthroughSeatsFor(players).slice(0, -2);
  const position = positions[(seed >>> 2) % positions.length];
  const chart = walkthroughChart(charts, position, players);
  if (!chart)
    throw new Error(`The ${players}-player opening baseline is unavailable.`);
  const action = seed % 2 === 0 ? "raise" : "fold";
  const hands = chart.cells.filter((cell) => cell.action === action);
  if (!hands.length)
    throw new Error(`The opening baseline has no ${action} hands.`);
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

function assertSeed(seed: number) {
  if (!Number.isInteger(seed) || seed < 0 || seed > 0xffffffff)
    throw new Error("The walkthrough seed must be an unsigned 32-bit integer.");
}

/** A local uint32 PRNG; every selection uses the full seed, including high bits. */
function randomForSeed(seed: number) {
  let state = seed;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let mixed = Math.imul(state ^ (state >>> 15), state | 1);
    mixed ^= mixed + Math.imul(mixed ^ (mixed >>> 7), mixed | 61);
    return ((mixed ^ (mixed >>> 14)) >>> 0) / 0x100000000;
  };
}

/**
 * Scene generation changes hands/context, never the chart's opening-size assumption.
 * Raised-pot hands illustrate arithmetic only, with no strategic answer implied.
 */
export function generateWalkthrough(
  charts: OpeningChart[],
  seed: number,
  players: WalkthroughPlayers,
) {
  assertSeed(seed);
  const seats = walkthroughSeatsFor(players);
  const positions = seats.slice(0, -2);
  const matching = positions.map((position) => {
    const chart = walkthroughChart(charts, position, players);
    if (!chart)
      throw new Error(`The ${players}-player opening baseline is incomplete.`);
    return chart;
  });
  const random = randomForSeed(seed);
  const pick = <T>(values: T[]): T => {
    if (!values.length)
      throw new Error("The opening baseline has no matching hands.");
    return values[Math.floor(random() * values.length)];
  };
  const button = matching[matching.length - 1];
  const openingAction = random() < 0.5 ? "raise" : "fold";
  const openingHand = pick(
    button.cells.filter((cell) => cell.action === openingAction),
  ).hand;
  // The two position lessons share this one hand and its exact cards.
  const early = pick(matching.slice(0, -1));
  const earlyFolds = new Set(
    early.cells
      .filter((cell) => cell.action === "fold")
      .map((cell) => cell.hand),
  );
  const contrastHand = pick(
    button.cells.filter(
      (cell) => cell.action === "raise" && earlyFolds.has(cell.hand),
    ),
  ).hand;
  const raisedHand = pick([
    "AA",
    "KK",
    "QQ",
    "JJ",
    "TT",
    "99",
    "88",
    "77",
    "66",
    "55",
    "44",
    "33",
    "22",
    "AKs",
    "AKo",
    "AQs",
    "AQo",
    "AJs",
    "AJo",
    "ATs",
    "ATo",
    "KQs",
    "KQo",
    "KJs",
    "KJo",
    "KTs",
    "KTo",
    "QJs",
    "QJo",
    "QTs",
    "QTo",
    "JTs",
    "JTo",
  ]);
  const raiseTo = pick([20, 25, 30, 40]);
  const hole = (hand: string) =>
    cardsForHand(hand, Math.floor(random() * 0x100000000));
  return {
    players,
    seats,
    opening: { hand: openingHand, hole: hole(openingHand) },
    contrast: {
      hand: contrastHand,
      hole: hole(contrastHand),
      earlyPosition: early.position,
    },
    raised: {
      hand: raisedHand,
      hole: hole(raisedHand),
      raiseTo,
      heroPosted: 0 as const,
      callCost: raiseTo,
      minimumRaiseTo: raiseTo + (raiseTo - 10),
      potChips: raiseTo + 5 + 10,
    },
    // Repeat prevention tracks substantive scenes, excluding seed and card suits.
    fingerprint: [
      players,
      openingHand,
      early.position,
      contrastHand,
      raisedHand,
      raiseTo,
    ].join("|"),
  };
}
