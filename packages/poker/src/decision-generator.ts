import { deck } from "./index";
import { weightedFlopEquity } from "./read-lesson";
import type { ReadQuestion } from "../../shared/src/read-lesson";
export const decisionSkills = [
  "flush-dominance",
  "conditional-overcards",
  "straight-redraws",
  "pair-and-draw",
] as const;
export type DecisionSkill = (typeof decisionSkills)[number];
export type RecentDecision = {
  skill: DecisionSkill;
  actionCorrect?: boolean;
  counterCorrect?: boolean;
  priceError?: number;
  errorPp?: number;
};
export function selectDecisionSkill(seed: number, recent: RecentDecision[]) {
  const scores = decisionSkills.map(
    (skill) =>
      1 +
      recent
        .filter((row) => row.skill === skill)
        .reduce(
          (score, row) =>
            score +
            (row.actionCorrect === false || row.counterCorrect === false
              ? 3
              : 0) +
            ((row.priceError ?? 0) > 5 ? 1 : 0) +
            ((row.errorPp ?? 0) > 8 ? 1 : 0),
          0,
        ),
  );
  let ticket = ((seed >>> 0) / 4294967296) * scores.reduce((a, b) => a + b, 0);
  let index = 0;
  while (index < scores.length - 1 && ticket >= scores[index])
    ticket -= scores[index++];
  const skill = decisionSkills[index],
    reviewed = scores[index] > 1;
  return {
    skill,
    selectionReason: reviewed
      ? "Extra practice in this skill because recent attempts included a missed decision or an estimate error above the review threshold."
      : "Fresh practice selected across the draw skills. Range weights are supplied exercise assumptions.",
  };
}
/** Construct fresh ranks and boards, with exact ranges; no authored deal library. */
export function generateDecision(
  seed: number,
  skill: DecisionSkill,
  id: string,
  selectionReason = "Fresh generated practice.",
): ReadQuestion {
  let state = seed >>> 0;
  const random = () => {
    state += 0x6d2b79f5;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  const shuffled = <T>(items: T[]) =>
    [...items]
      .map((value) => ({ value, key: random() }))
      .sort((a, b) => a.key - b.key)
      .map((row) => row.value);
  const ranks = "23456789TJQKA",
    suits = shuffled(["c", "d", "h", "s"]);
  const picked = shuffled([...ranks])
    .slice(0, 6)
    .sort((a, b) => ranks.indexOf(a) - ranks.indexOf(b));
  const [a, b, c, d, e, f] = picked;
  let hole: string[],
    board: string[],
    hands: string[][],
    title: string,
    coaching: string;
  const available = (rank: string, used: string[], count: number) =>
    shuffled(
      deck.filter((card) => card[0] === rank && !used.includes(card)),
    ).slice(0, count);
  if (skill === "flush-dominance") {
    hole = [a + suits[0], b + suits[0]];
    board = [e + suits[0], f + suits[0], c + suits[1]];
    hands = [
      [...available(f, [...hole, ...board], 1), d + suits[2]],
      [c + suits[0], d + suits[0]],
    ];
    title = "When a flush draw is dominated";
    coaching =
      "A card of your draw suit can complete a better flush for the higher suited combination. Against the pair, your flush is a different path to win. Count final wins and redraws, not just improving cards.";
  } else if (skill === "conditional-overcards") {
    hole = [e + suits[0], f + suits[1]];
    board = [d + suits[2], b + suits[0], a + suits[3]];
    hands = [
      [...available(d, [...hole, ...board], 1), c + suits[1]],
      available(b, [...hole, ...board], 2),
    ];
    title = "Which overcards are clean outs?";
    coaching =
      "Pairing an overcard can beat the one-pair combination, but does not by itself beat the set. Straight runouts and redraws also count in the final share.";
  } else if (skill === "straight-redraws") {
    const base = 1 + Math.floor(random() * 7);
    const sequence = ranks.slice(base, base + 4).split("");
    const outside = shuffled(
      [...ranks].filter(
        (rank) =>
          !sequence.includes(rank) &&
          rank !== ranks[base - 1] &&
          rank !== ranks[base + 4] &&
          rank !== ranks[Math.min(12, base + 5)],
      ),
    )[0];
    hole = [sequence[2] + suits[0], sequence[3] + suits[1]];
    board = [
      sequence[0] + suits[2],
      sequence[1] + suits[3],
      outside + suits[0],
    ];
    hands = [
      available(sequence[0], [...hole, ...board], 2),
      [
        ranks[Math.min(12, base + 5)] + suits[2],
        ranks[Math.min(12, base + 5)] + suits[3],
      ],
    ];
    title = "A straight draw faces redraws";
    coaching =
      "Completing a straight can put you ahead, but a set can redraw to a full house. Count showdown outcomes through both remaining cards rather than treating a turn improvement as a guaranteed win.";
  } else {
    hole = [d + suits[0], c + suits[0]];
    board = [d + suits[1], a + suits[0], b + suits[0]];
    hands = [
      [f + suits[2], f + suits[3]],
      available(a, [...hole, ...board], 2),
    ];
    title = "A pair has several drawing paths";
    coaching =
      "Flushes, trips and some two-pair runouts can improve your pair. Their value differs against an overpair and a set; the set can also redraw after you improve.";
  }
  const weight = (25 + Math.floor(random() * 51)) / 100;
  const potBefore = [60, 80, 100, 120, 160, 200][Math.floor(random() * 6)];
  const exact = weightedFlopEquity(
    hole,
    board,
    hands.map((cards) => ({ cards, weight: 0.5 })),
  );
  const equity =
    exact.rows[0].equity * weight + exact.rows[1].equity * (1 - weight);
  const threshold = (offset: number) =>
    Math.max(2, Math.min(47, equity + offset));
  const betFor = (percent: number) =>
    Math.max(
      1,
      Math.round(((percent / 100) * potBefore) / (1 - (2 * percent) / 100)),
    );
  const expensive = random() < 0.5;
  const offset = expensive ? 7 : -7;
  const bet = betFor(threshold(offset));
  let counterBet = betFor(threshold(random() < 0.35 ? offset / 2 : -offset));
  if (counterBet === bet)
    counterBet = bet > 1 ? Math.max(1, Math.floor(bet * 0.6)) : 2;
  return {
    id,
    variant: 1002,
    generatorVersion: 1,
    seed,
    skill,
    selectionReason,
    title,
    hole,
    board,
    candidates: [],
    potBefore,
    bet,
    counterBet,
    opponents: hands.map((cards, i) => ({
      cards,
      label: cards.join(" "),
      prior: i === 0 ? weight : 1 - weight,
      betLikelihood: 1,
    })),
    guide: exact.rows.map((row, i) => ({
      cards: hands[i],
      equity: row.equity,
      weight: i === 0 ? weight : 1 - weight,
    })),
    coaching,
    assumptions: [
      "Fresh legal cards generated for the selected draw skill. The displayed combinations and weights are an artificial teaching range after the shove, not inferred opponent behavior.",
      "Heads-up flop all-in: both players can match the displayed amount, no further betting, rake, side pots or tournament payouts.",
      "For the changed-price comparison, keep the cards, supplied range and starting pot fixed; both stacks change to match the new amount.",
    ],
    completed: {},
  };
}
