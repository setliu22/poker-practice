import { deal, random, ranks, validateCards } from "./index";
import { createTable, type TableState } from "./table";
import type { PublicRead } from "./bot-policy";
import type { DealMode } from "../../shared/src/table";

// An authored exercise-selection pool, not a position-specific opening chart.
// Small pairs, suited aces and connectors can still be folds against aggression.
export function isEasyStartingHand(cards: string[]): boolean {
  validateCards(cards, 2, 2);
  const values = cards.map((card) => ranks.indexOf(card[0]) + 2);
  const high = Math.max(...values),
    low = Math.min(...values);
  const suited = cards[0][1] === cards[1][1];
  return (
    high === low ||
    low >= 10 ||
    (suited && high === 14) ||
    (suited && high - low === 1 && low >= 5)
  );
}

// Select using only the learner's starting cards. Opponent cards and the board
// are never inspected, scored, swapped or separately filtered.
export function selectPracticeSeed(seed: number, dealMode: DealMode): number {
  if (!Number.isInteger(seed) || seed < 0 || seed > 0xffffffff)
    throw new Error("Use an unsigned 32-bit integer deal seed.");
  if (dealMode === "random") return seed;
  if (dealMode !== "easy") throw new Error("Unknown deal mode.");
  const next = random(seed ^ 0x5f35721d);
  let candidate = seed;
  for (let attempt = 0; attempt < 10_000; attempt++) {
    if (isEasyStartingHand(deal(candidate, 2))) return candidate;
    candidate = Math.floor(next() * 4294967296);
  }
  throw new Error("Unable to select an Easy deal. Start a new table.");
}

export function createPracticeTable(
  id: string,
  count: number,
  seed: number,
  dealMode: DealMode = "random",
  dealer = 0,
  handNumber = 1,
  revision = 0,
  policyVersion = 2,
  reads: PublicRead[] = [],
): TableState {
  const state = createTable(
    id,
    count,
    selectPracticeSeed(seed, dealMode),
    dealer,
    handNumber,
    revision,
    policyVersion,
    reads,
  );
  state.dealMode = dealMode;
  return state;
}
