import { best, compare, deck, ranks, validateCards } from "./index";
import type { Combo } from "./showdown";
import type { RangeMatrixCell } from "../../shared/src/table";

export const rangeRanks = [...ranks].reverse().join("");

// Standard 13 × 13 order: pairs on the diagonal, suited above it,
// and offsuit below it. A cell's mass is not a winning probability.
export function startingHandClass(cards: string[]): string {
  validateCards(cards, 2, 2);
  const ordered = [...cards].sort(
    (a, b) => ranks.indexOf(b[0]) - ranks.indexOf(a[0]),
  );
  const label = ordered.map((card) => card[0]).join("");
  return ordered[0][0] === ordered[1][0]
    ? label
    : label + (ordered[0][1] === ordered[1][1] ? "s" : "o");
}

export function normalizedRange(combos: Combo[], known: string[]): Combo[] {
  validateCards(known);
  const seen = new Set<string>();
  const legal: Combo[] = [];
  for (const combo of combos) {
    validateCards(combo.cards, 2, 2);
    if (!Number.isFinite(combo.weight) || combo.weight < 0)
      throw new Error("Range weights must be finite and nonnegative.");
    const key = [...combo.cards].sort().join("");
    if (seen.has(key)) throw new Error("Duplicate range combination.");
    seen.add(key);
    if (combo.weight > 0 && !combo.cards.some((card) => known.includes(card)))
      legal.push({ cards: [...combo.cards], weight: combo.weight });
  }
  const mass = legal.reduce((sum, combo) => sum + combo.weight, 0);
  if (!(mass > 0) || !Number.isFinite(mass))
    throw new Error("The range needs at least one legal positive-weight hand.");
  return legal.map((combo) => ({ ...combo, weight: combo.weight / mass }));
}

export function rangeMatrix(
  combos: Combo[],
  known: string[],
): RangeMatrixCell[] {
  const legal = normalizedRange(combos, known);
  const cells = [...rangeRanks].flatMap((row, rowIndex) =>
    [...rangeRanks].map((column, columnIndex) => ({
      hand:
        rowIndex === columnIndex
          ? row + column
          : rowIndex < columnIndex
            ? row + column + "s"
            : column + row + "o",
      combinations: 0,
      available: 0,
      percent: 0,
    })),
  );
  const byHand = new Map(cells.map((cell) => [cell.hand, cell]));
  const remaining = deck.filter((card) => !known.includes(card));
  for (let a = 0; a < remaining.length; a++)
    for (let b = a + 1; b < remaining.length; b++)
      byHand.get(startingHandClass([remaining[a], remaining[b]]))!.available++;
  for (const combo of legal) {
    const cell = byHand.get(startingHandClass(combo.cards))!;
    cell.combinations++;
    cell.percent += 100 * combo.weight;
  }
  return cells;
}

// Compare the hands already made on the visible board, without drawing future
// cards. This is a marginal one-opponent matchup, not multiway showdown equity.
export function rangeMadeMatchup(
  hero: string[],
  board: string[],
  combos: Combo[],
): { ahead: number; tied: number; behind: number } | undefined {
  validateCards([...hero, ...board]);
  if (hero.length !== 2 || ![0, 3, 4, 5].includes(board.length))
    throw new Error("Use two hole cards and a legal Hold’em board.");
  const legal = normalizedRange(combos, [...hero, ...board]);
  if (!board.length) return undefined;
  const hand = best([...hero, ...board]);
  const result = { ahead: 0, tied: 0, behind: 0 };
  for (const combo of legal) {
    const comparison = compare(hand, best([...combo.cards, ...board]));
    const key = comparison > 0 ? "ahead" : comparison < 0 ? "behind" : "tied";
    result[key] += 100 * combo.weight;
  }
  return result;
}
