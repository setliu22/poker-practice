import { best, deck, random, ranks, validateCards } from "./index";
import { shuffle } from "./showdown";

const suits = [..."cdhs"];
const straights = [
  "A2345",
  "23456",
  "34567",
  "45678",
  "56789",
  "6789T",
  "789TJ",
  "89TJQ",
  "9TJQK",
  "TJQKA",
];

function fiveForCategory(category: number, rng: () => number): string[] {
  const order = shuffle([...ranks], rng);
  const suit = () => suits[Math.floor(rng() * suits.length)];
  const copies = (rank: string, count: number) =>
    shuffle(suits, rng)
      .slice(0, count)
      .map((suit) => rank + suit);
  switch (category) {
    case 0:
      return order.slice(0, 5).map((rank) => rank + suit());
    case 1:
      return [
        ...copies(order[0], 2),
        ...order.slice(1, 4).map((rank) => rank + suit()),
      ];
    case 2:
      return [
        ...copies(order[0], 2),
        ...copies(order[1], 2),
        order[2] + suit(),
      ];
    case 3:
      return [
        ...copies(order[0], 3),
        ...order.slice(1, 3).map((rank) => rank + suit()),
      ];
    case 4:
      return [...straights[Math.floor(rng() * straights.length)]].map(
        (rank) => rank + suit(),
      );
    case 5: {
      const flushSuit = suit();
      return order.slice(0, 5).map((rank) => rank + flushSuit);
    }
    case 6:
      return [...copies(order[0], 3), ...copies(order[1], 2)];
    case 7:
      return [...copies(order[0], 4), order[1] + suit()];
    case 8: {
      const flushSuit = suit();
      return [...straights[Math.floor(rng() * straights.length)]].map(
        (rank) => rank + flushSuit,
      );
    }
    default:
      throw new Error("Unknown hand category.");
  }
}

// Educational sampling: the winning hand's category is selected evenly rather
// than appearing with its natural frequency in an unfiltered random deal.
// Cards, suits, ranks, board allocation and player assignment remain randomized.
// Return only cards: the selected category must stay hidden until submission.
export function balancedShowdown(seed: number): {
  hero: string[];
  villain: string[];
  board: string[];
} {
  if (!Number.isInteger(seed) || seed < 0 || seed > 4294967295)
    throw new Error("Use an unsigned 32-bit seed.");
  const rng = random(seed);
  // For uniform 32-bit seeds, these nine buckets differ by at most one seed.
  const category = seed % 9;
  for (let attempt = 0; attempt < 2000; attempt++) {
    const made = fiveForCategory(category, rng);
    const extra = shuffle(
      deck.filter((card) => !made.includes(card)),
      rng,
    ).slice(0, 2);
    const seven = shuffle([...made, ...extra], rng);
    if (best(seven).category !== category) continue;
    const hole = seven.slice(0, 2),
      board = seven.slice(2);
    const remaining = deck.filter((card) => !seven.includes(card));
    for (let opponentAttempt = 0; opponentAttempt < 100; opponentAttempt++) {
      const opponent = shuffle(remaining, rng).slice(0, 2);
      if (best([...opponent, ...board]).category > category) continue;
      const heroFirst = rng() < 0.5;
      const result = {
        hero: heroFirst ? hole : opponent,
        villain: heroFirst ? opponent : hole,
        board,
      };
      validateCards([...result.hero, ...result.villain, ...result.board], 9, 9);
      return result;
    }
  }
  throw new Error("Unable to generate a legal balanced showdown.");
}
