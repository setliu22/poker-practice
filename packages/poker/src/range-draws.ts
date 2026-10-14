import { best, deck, ranks, validateCards } from "./index";
import { normalizedRange } from "./range-summary";
import type { Combo } from "./showdown";
import type { RangeDrawDensity } from "../../shared/src/range-draws";

function openEnded(cards: string[], known: string[]): boolean {
  const values = new Set(cards.map((card) => ranks.indexOf(card[0]) + 2));
  const remainingRanks = new Set(
    deck
      .filter((card) => !known.includes(card))
      .map((card) => ranks.indexOf(card[0]) + 2),
  );
  // 2345 has ace and six endpoints; TJQK has nine and ace endpoints.
  // A234 and JQKA have just one endpoint, so they are not open-ended.
  for (let start = 2; start <= 10; start++) {
    if (
      ![start, start + 1, start + 2, start + 3].every((rank) =>
        values.has(rank),
      )
    )
      continue;
    const lower = start === 2 ? 14 : start - 1;
    const upper = start + 4;
    if (remainingRanks.has(lower) && remainingRanks.has(upper)) return true;
  }
  return false;
}

/**
 * Fraction of a legal opponent range with a four-card flush draw or ordinary
 * open-ended straight draw. This uses only the supplied candidate range, hero
 * blockers and visible board; it never consults a real opponent's hidden cards.
 */
export function rangeDrawDensity(
  hero: string[],
  board: string[],
  combos: Combo[],
): RangeDrawDensity | undefined {
  validateCards([...hero, ...board]);
  if (hero.length !== 2 || ![0, 3, 4, 5].includes(board.length))
    throw new Error("Use two hole cards and a legal Hold’em board.");
  const legal = normalizedRange(combos, [...hero, ...board]);
  // Undefined avoids implying that there is no drawing potential preflop, or
  // showing a river draw measure when no community cards remain to be dealt.
  if (![3, 4].includes(board.length)) return undefined;
  let any = 0,
    flushDraw = 0,
    openEndedStraightDraw = 0,
    both = 0;
  for (const combo of legal) {
    const cards = [...combo.cards, ...board];
    const made = best(cards);
    // Ordinary lower-category draws cannot improve an already stronger hand.
    const flush =
      made.category < 5 &&
      [..."cdhs"].some(
        (suit) => cards.filter((card) => card[1] === suit).length === 4,
      );
    const straight =
      made.category < 4 &&
      openEnded(cards, [...hero, ...board, ...combo.cards]);
    if (flush) flushDraw += combo.weight;
    if (straight) openEndedStraightDraw += combo.weight;
    if (flush || straight) any += combo.weight;
    if (flush && straight) both += combo.weight;
  }
  return {
    percent: any * 100,
    flushDraw: flushDraw * 100,
    openEndedStraightDraw: openEndedStraightDraw * 100,
    both: both * 100,
    note: "Weighted share of this opponent's modeled range with an ordinary four-card flush draw or open-ended straight draw. A hand with both counts once in the total. Improving does not guarantee winning, so these are not guaranteed winning outs. Gutshots, backdoor draws and special stronger draws such as straight-flush draws are not classified separately. This is one opponent's range before accounting for card collisions between different opponents' possible hands.",
  };
}
