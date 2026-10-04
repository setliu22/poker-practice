export type Card = string;
export const ranks = "23456789TJQKA";
export const deck: Card[] = [...ranks].flatMap((r) =>
  [..."cdhs"].map((s) => r + s),
);
export const names = [
  "High card",
  "One pair",
  "Two pair",
  "Three of a kind",
  "Straight",
  "Flush",
  "Full house",
  "Four of a kind",
  "Straight flush",
];
export function validateCards(cards: Card[], min = 0, max = 52) {
  if (
    cards.length < min ||
    cards.length > max ||
    cards.some((c) => !deck.includes(c)) ||
    new Set(cards).size !== cards.length
  )
    throw new Error("Cards must be valid, unique cards from the 52-card deck.");
}
export type Hand = {
  category: number;
  name: string;
  kickers: number[];
  cards: Card[];
};
export function compare(a: Hand, b: Hand): number {
  for (const [x, y] of [
    [a.category, b.category],
    ...a.kickers.map((x, i) => [x, b.kickers[i] ?? 0]),
  ])
    if (x !== y) return Math.sign(x - y);
  return 0;
}
export function five(cards: Card[]): Hand {
  validateCards(cards, 5, 5);
  const values = cards
    .map((c) => ranks.indexOf(c[0]) + 2)
    .sort((a, b) => b - a);
  const groups = [...new Set(values)]
    .map((v) => ({ v, n: values.filter((x) => x === v).length }))
    .sort((a, b) => b.n - a.n || b.v - a.v);
  const flush = cards.every((c) => c[1] === cards[0][1]);
  const unique = [...new Set(values)];
  const straight =
    unique.length === 5
      ? unique[0] - unique[4] === 4
        ? unique[0]
        : unique.join(",") === "14,5,4,3,2"
          ? 5
          : 0
      : 0;
  let category = 0,
    kickers = values;
  if (flush && straight) {
    category = 8;
    kickers = [straight];
  } else if (groups[0].n === 4) {
    category = 7;
    kickers = groups.map((g) => g.v);
  } else if (groups[0].n === 3 && groups[1].n === 2) {
    category = 6;
    kickers = groups.map((g) => g.v);
  } else if (flush) {
    category = 5;
  } else if (straight) {
    category = 4;
    kickers = [straight];
  } else if (groups[0].n === 3) {
    category = 3;
    kickers = groups.map((g) => g.v);
  } else if (groups[0].n === 2 && groups[1].n === 2) {
    category = 2;
    kickers = groups.map((g) => g.v);
  } else if (groups[0].n === 2) {
    category = 1;
    kickers = groups.map((g) => g.v);
  }
  return { category, name: names[category], kickers, cards: [...cards] };
}
export function best(cards: Card[]): Hand {
  validateCards(cards, 5, 7);
  let result: Hand | undefined;
  for (let a = 0; a < cards.length - 4; a++)
    for (let b = a + 1; b < cards.length - 3; b++)
      for (let c = b + 1; c < cards.length - 2; c++)
        for (let d = c + 1; d < cards.length - 1; d++)
          for (let e = d + 1; e < cards.length; e++) {
            const hand = five([
              cards[a],
              cards[b],
              cards[c],
              cards[d],
              cards[e],
            ]);
            if (!result || compare(hand, result) > 0) result = hand;
          }
  return result!;
}
export function potOdds(pot: number, bet: number, call: number): number {
  if (
    ![pot, bet, call].every(Number.isFinite) ||
    pot < 0 ||
    bet <= 0 ||
    call <= 0 ||
    bet !== call
  )
    throw new Error(
      "This heads-up exercise requires a positive bet and an equal call amount.",
    );
  return (call / (pot + bet + call)) * 100;
}
export function legalRange(
  hero: Card[],
  board: Card[],
  range: Card[][],
): Card[][] {
  validateCards([...hero, ...board], 6, 7);
  if (hero.length !== 2 || ![4, 5].includes(board.length))
    throw new Error("Use two hole cards and a turn or river board.");
  if (!range.length) throw new Error("Range must not be empty.");
  const keys = new Set<string>();
  const legal = range.filter((combo) => {
    validateCards(combo, 2, 2);
    const key = [...combo].sort().join("");
    if (keys.has(key)) throw new Error("Duplicate range combination.");
    keys.add(key);
    return !combo.some((c) => [...hero, ...board].includes(c));
  });
  if (!legal.length) throw new Error("All opponent combinations are blocked.");
  return legal;
}
export function equity(hero: Card[], board: Card[], range: Card[][]) {
  const legal = legalRange(hero, board, range);
  const rows = legal.map((combo) => {
    const rivers =
      board.length === 5
        ? [null]
        : deck.filter((c) => ![...hero, ...board, ...combo].includes(c));
    let wins = 0,
      ties = 0;
    for (const river of rivers) {
      const final = river ? [...board, river] : board;
      const outcome = compare(
        best([...hero, ...final]),
        best([...combo, ...final]),
      );
      if (outcome > 0) wins++;
      if (outcome === 0) ties++;
    }
    return {
      combo,
      wins,
      ties,
      total: rivers.length,
      equity: ((wins + ties / 2) / rivers.length) * 100,
    };
  });
  return {
    equity: rows.reduce((sum, r) => sum + r.equity, 0) / rows.length,
    rows,
    blocked: range.length - legal.length,
  };
}
export function strongerCategories(hero: Card[], board: Card[]): string[] {
  validateCards([...hero, ...board], 7, 7);
  const remaining = deck.filter((c) => ![...hero, ...board].includes(c));
  const mine = best([...hero, ...board]);
  const categories = new Set<number>();
  for (let i = 0; i < remaining.length; i++)
    for (let j = i + 1; j < remaining.length; j++) {
      const hand = best([...board, remaining[i], remaining[j]]);
      if (compare(hand, mine) > 0) categories.add(hand.category);
    }
  return [...categories].sort((a, b) => a - b).map((c) => names[c]);
}
export function random(seed: number) {
  let state = seed >>> 0;
  return () => {
    state += 0x6d2b79f5;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
export function deal(seed: number, count: number): Card[] {
  const cards = [...deck],
    rng = random(seed);
  for (let i = cards.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [cards[i], cards[j]] = [cards[j], cards[i]];
  }
  return cards.slice(0, count);
}
