import { best, compare, deck, validateCards, potOdds } from "./index";
import {
  readAnswerSchema,
  type ReadQuestion,
  type ReadFeedback,
} from "../../shared/src/read-lesson";
import type { z } from "zod";
const hole = ["9h", "8h"],
  board = ["Ah", "Kh", "2c"];
export function updateRange(priors: number[], likelihoods: number[]) {
  if (
    !priors.length ||
    priors.length !== likelihoods.length ||
    priors.some((p) => !Number.isFinite(p) || p < 0) ||
    likelihoods.some((p) => !Number.isFinite(p) || p < 0 || p > 1)
  )
    throw new Error("Invalid range probabilities.");
  const sum = priors.reduce((a, b) => a + b, 0);
  if (Math.abs(sum - 1) > 1e-9)
    throw new Error("Prior probabilities must sum to one.");
  const masses = priors.map((p, i) => p * likelihoods[i]),
    evidence = masses.reduce((a, b) => a + b, 0);
  if (evidence === 0)
    throw new Error(
      "This action is impossible under the supplied assumptions.",
    );
  return masses.map((m) => m / evidence);
}
export function readQuestion(
  variant: number,
  id: string,
  completed: ReadQuestion["completed"] = {},
): ReadQuestion {
  if (variant >= 2 && variant <= 1001)
    return decisionQuestion(variant, id, completed);
  if (![0, 1].includes(variant)) throw new Error("Unknown read exercise.");
  return {
    id,
    variant,
    title:
      variant === 0 ? "Update your read" : "Same cards, different opponent",
    hole,
    board,
    candidates: ["4h", "9c", "Qh"],
    potBefore: 100,
    bet: 100,
    opponents: [
      {
        cards: ["Ac", "Qd"],
        label: "One pair · AQ",
        prior: 0.8,
        betLikelihood: variant === 0 ? 0.5 : 1,
      },
      {
        cards: ["Qh", "Jh"],
        label: "Higher flush draw · QJ",
        prior: 0.2,
        betLikelihood: variant === 0 ? 1 : 0.1,
      },
    ],
    assumptions: [
      "Heads-up no-limit Hold’em. You checked the flop. The opponent shoved their remaining 100 chips into a pot of 100. You have exactly 100 left; only call or fold is available.",
      "Before the shove, given your cards, this flop and earlier public history, this teaching range assigns 80% to AcQd and 20% to QhJh. They are alternatives, not cards known to be held.",
      "Bet frequencies mean the chance of this specific 100-chip shove, conditional on each hand and this situation. They are supplied teaching assumptions, not measured player statistics or universal poker behavior.",
      "No other hands in this deliberately narrow range, no rake, side pots, tournament payouts or run-it-twice. Calling guarantees both remaining board cards and showdown; no further bets.",
      "Turn-card questions are hypothetical previews, not cards actually dealt. The final call decision is still on the original flop.",
    ],
    completed,
  };
}
export function classifyTurn(
  hero: string[],
  flop: string[],
  opponent: string[],
  card: string,
) {
  validateCards([...hero, ...flop, ...opponent], 7, 7);
  validateCards([card], 1, 1);
  if ([...hero, ...flop, ...opponent].includes(card)) return "blocked" as const;
  const c = compare(
    best([...hero, ...flop, card]),
    best([...opponent, ...flop, card]),
  );
  return c > 0 ? "ahead" : c < 0 ? "behind" : "tie";
}
/** Exact weighted flop equity. Existing evaluator handles both hands; no sampled or hidden deal. */
export function weightedFlopEquity(
  hero: string[],
  flop: string[],
  range: { cards: string[]; weight: number }[],
) {
  validateCards([...hero, ...flop], 5, 5);
  if (
    hero.length !== 2 ||
    flop.length !== 3 ||
    !range.length ||
    range.some((r) => !Number.isFinite(r.weight) || r.weight < 0) ||
    Math.abs(range.reduce((s, r) => s + r.weight, 0) - 1) > 1e-9
  )
    throw new Error("Use a valid normalized flop range.");
  const keys = new Set<string>();
  const rows = range.map((r) => {
    validateCards([...hero, ...flop, ...r.cards], 7, 7);
    if (r.cards.length !== 2) throw new Error("Use two opponent cards.");
    const key = [...r.cards].sort().join("");
    if (keys.has(key)) throw new Error("Duplicate range combination.");
    keys.add(key);
    const remaining = deck.filter(
      (c) => ![...hero, ...flop, ...r.cards].includes(c),
    );
    let wins = 0,
      ties = 0,
      total = 0;
    for (let i = 0; i < remaining.length; i++)
      for (let j = i + 1; j < remaining.length; j++) {
        const final = [...flop, remaining[i], remaining[j]];
        const result = compare(
          best([...hero, ...final]),
          best([...r.cards, ...final]),
        );
        total++;
        if (result > 0) wins++;
        if (result === 0) ties++;
      }
    return {
      weight: r.weight,
      wins,
      ties,
      total,
      equity: (100 * (wins + ties / 2)) / total,
    };
  });
  return {
    rows,
    equity: rows.reduce((s, r) => s + r.weight * r.equity, 0),
    winPercent: rows.reduce(
      (s, r) => s + (100 * r.weight * r.wins) / r.total,
      0,
    ),
    tiePercent: rows.reduce(
      (s, r) => s + (100 * r.weight * r.ties) / r.total,
      0,
    ),
  };
}
let cached: ReturnType<typeof weightedFlopEquity> | undefined;
function matchupRows() {
  return (cached ??= weightedFlopEquity(hole, board, [
    { cards: ["Ac", "Qd"], weight: 0.5 },
    { cards: ["Qh", "Jh"], weight: 0.5 },
  ]));
}
export function gradeRead(
  variant: number,
  raw: z.infer<typeof readAnswerSchema>,
  suppliedQuestion?: ReadQuestion,
): ReadFeedback {
  const input = readAnswerSchema.parse(raw),
    q = suppliedQuestion ?? readQuestion(variant, "grade");
  if (
    variant >= 2 &&
    (input.step !== "decision" ||
      input.pricePercent === undefined ||
      !input.counterAction)
  )
    throw new Error("Choose both decisions and estimate the call price.");
  const weights = updateRange(
    q.opponents.map((o) => o.prior),
    q.opponents.map((o) => o.betLikelihood),
  );
  const drawPercent = weights[1] * 100;
  if (input.step === "range")
    return {
      step: input.step,
      drawPercent,
      errorPp: Math.abs(input.drawPercent - drawPercent),
      calculation: `(20% × ${q.opponents[1].betLikelihood * 100}%) / (80% × ${q.opponents[0].betLikelihood * 100}% + 20% × ${q.opponents[1].betLikelihood * 100}%) = ${drawPercent.toFixed(1)}%`,
      explanation: `After this shove, the higher flush draw has ${drawPercent.toFixed(1)}% of the modeled range. That is the chance they hold Q♥J♥ after seeing the bet, not anyone’s chance of winning. Count how many hands of each kind would shove, then find the draw’s share of those shoves. In real play you must estimate these betting tendencies; here they are supplied assumptions.`,
    };
  if (input.step === "cards") {
    const outcomes = q.candidates.flatMap((card) =>
      q.opponents.map((o) => {
        const result = classifyTurn(q.hole, q.board, o.cards, card);
        return {
          card,
          opponent: o.label,
          result,
          explanation:
            result === "blocked"
              ? "This card is already in this possible opponent hand, so this branch cannot deal it."
              : card === "4h" || card === "Qh"
                ? o.label.includes("AQ")
                  ? card === "Qh"
                    ? "Your completed flush beats their two pair, aces and queens, on this turn."
                    : "Your completed flush beats their pair on this turn."
                  : "Both complete a flush; their queen/jack hearts give them the higher flush."
                : o.label.includes("AQ")
                  ? "Your pair of nines is still below their pair of aces."
                  : "Your pair of nines beats their queen-high hand for now.",
        };
      }),
    );
    const correct = outcomes.filter(
      (o, i) => o.result === input.outcomes[i],
    ).length;
    return {
      step: input.step,
      correct: correct === outcomes.length,
      errorPp: (100 * (outcomes.length - correct)) / outcomes.length,
      outcomes,
      explanation: `${correct}/${outcomes.length} card predictions match. A heart is not automatically a winning out against this range. Ahead on the turn is not a guaranteed river win; the next step counts every legal two-card runout. If Qh were actually dealt, QhJh would be removed from the range.`,
    };
  }
  const rows = (variant >= 2 ? decisionEquity(q).rows : matchupRows().rows).map(
    (r, i) => ({
      ...r,
      label: q.opponents[i].label,
      weight: weights[i],
    }),
  );
  const equity = rows.reduce((s, r) => s + r.weight * r.equity, 0),
    winPercent = rows.reduce(
      (s, r) => s + (100 * r.weight * r.wins) / r.total,
      0,
    ),
    tiePercent = rows.reduce(
      (s, r) => s + (100 * r.weight * r.ties) / r.total,
      0,
    );
  const required = potOdds(q.potBefore, q.bet, q.bet);
  const callEv = (equity / 100) * (q.potBefore + 2 * q.bet) - q.bet;
  return {
    step: input.step,
    equity,
    winPercent,
    tiePercent,
    required,
    callEv,
    rows,
    errorPp:
      input.equityPercent === undefined
        ? undefined
        : Math.abs(input.equityPercent - equity),
    priceError:
      input.pricePercent === undefined
        ? undefined
        : Math.abs(input.pricePercent - required),
    counterRequired:
      q.counterBet === undefined
        ? undefined
        : potOdds(q.potBefore, q.counterBet, q.counterBet),
    counterEv:
      q.counterBet === undefined
        ? undefined
        : (equity / 100) * (q.potBefore + 2 * q.counterBet) - q.counterBet,
    counterCorrect:
      q.counterBet === undefined
        ? undefined
        : input.counterAction ===
          ((equity / 100) * (q.potBefore + 2 * q.counterBet) - q.counterBet > 0
            ? "call"
            : "fold"),
    actionCorrect: input.action === (callEv > 0 ? "call" : "fold"),
    reasonCorrect: variant >= 2 ? undefined : input.reason === "price",
    explanation: `${callEv > 0 ? "Call" : "Fold"} under this supplied range: your pot equity is ${equity.toFixed(1)}%; calling needs ${required.toFixed(1)}%. The final pot if you call is ${q.potBefore} already in the pot + ${q.bet} from their shove + ${q.bet} from your call = ${q.potBefore + 2 * q.bet} chips. Required pot share = cost to call ÷ final pot = ${q.bet} ÷ ${q.potBefore + 2 * q.bet} = ${required.toFixed(1)}%. Average net gain from calling = your expected fraction of the final pot × final pot − your new chips paid = ${(equity / 100).toFixed(4)} × ${q.potBefore + 2 * q.bet} − ${q.bet} = ${callEv.toFixed(1)} chips. Folding costs no additional chips, so its net gain from this decision is 0. This equity includes ties and every legal turn–river pair, including wins without a flush and losses after improving. The all-in prevents future betting, so the equity–price comparison settles this chip-EV decision. It would not settle an ordinary flop call with chips still behind.`,
  };
}

// Distinct hand structures; price and range weights vary reproducibly between attempts.
const decisionSpots = [
  {
    title: "A flush draw can be dominated",
    hole: ["9h", "8h"],
    board: ["Ah", "Kh", "2c"],
    hands: [
      ["Ac", "Qd"],
      ["Qh", "Jh"],
    ],
    coaching:
      "A heart improves your hand, but a higher heart draw can make a better flush. Include wins without a flush and losses after improving.",
  },
  {
    title: "Straight draw against a set",
    hole: ["9s", "8s"],
    board: ["7h", "6d", "2c"],
    hands: [
      ["7c", "7d"],
      ["Ac", "Ad"],
    ],
    coaching:
      "A five or ten completes your straight, but a set can still redraw to a full house by the river. Count final outcomes, not just cards that improve you.",
  },
  {
    title: "Overcards are conditional outs",
    hole: ["As", "Qh"],
    board: ["Jc", "8d", "3s"],
    hands: [
      ["Jh", "Ts"],
      ["8h", "8c"],
    ],
    coaching:
      "An ace or queen can beat one pair but does not beat a set. The value of pairing depends on which part of the range is present.",
  },
  {
    title: "Nut flush draw with overcards",
    hole: ["Ah", "Qh"],
    board: ["Jh", "7h", "2c"],
    hands: [
      ["Jc", "Td"],
      ["7c", "7d"],
    ],
    coaching:
      "Your heart draw is the highest flush draw, but a paired final board can give a set a full house. Pairing an overcard also helps differently against one pair and a set.",
  },
  {
    title: "Two overcards versus a bigger pair",
    hole: ["Ks", "Qs"],
    board: ["Jh", "6d", "2c"],
    hands: [
      ["Ac", "Ad"],
      ["Jc", "Td"],
    ],
    coaching:
      "Pairing a king or queen can beat jacks, while aces remain ahead. Do not count all overcards as clean outs against every hand.",
  },
  {
    title: "A pair and a flush draw",
    hole: ["Th", "9h"],
    board: ["Tc", "6h", "2h"],
    hands: [
      ["Ac", "Ad"],
      ["6c", "6d"],
    ],
    coaching:
      "You have more than one path to win: flushes, trips, and some two-pair runouts. A set can beat some improving runouts, so use showdown share rather than a raw out count.",
  },
];
const decisionCache = new Map<string, ReturnType<typeof weightedFlopEquity>>();
function decisionEquity(q: ReadQuestion) {
  const key = JSON.stringify([
    q.hole,
    q.board,
    q.opponents.map((o) => o.cards),
  ]);
  let result = decisionCache.get(key);
  if (!result) {
    result = weightedFlopEquity(
      q.hole,
      q.board,
      q.opponents.map((o) => ({
        cards: o.cards,
        weight: 1 / q.opponents.length,
      })),
    );
    if (decisionCache.size >= 128)
      decisionCache.delete(decisionCache.keys().next().value!);
    decisionCache.set(key, result);
  }
  return result;
}
function decisionQuestion(
  variant: number,
  id: string,
  completed: ReadQuestion["completed"],
): ReadQuestion {
  const seed = variant - 2,
    spot = decisionSpots[seed % decisionSpots.length];
  const firstWeight = [0.25, 0.5, 0.75][Math.floor(seed / 6) % 3];
  const q: ReadQuestion = {
    id,
    variant,
    title: spot.title,
    hole: spot.hole,
    board: spot.board,
    candidates: [],
    potBefore: 120,
    bet: 0,
    opponents: spot.hands.map((cards, i) => ({
      cards,
      label: cards.join(" "),
      prior: i === 0 ? firstWeight : 1 - firstWeight,
      betLikelihood: 1,
    })),
    assumptions: [
      "Heads-up flop. The opponent shoves; calling matches their bet and guarantees both remaining board cards, with no further betting.",
      "The displayed weighted combinations are the supplied range AFTER the shove. They are alternatives, not revealed cards. No need to infer betting frequencies.",
      "No rake, side pots or tournament payout effects. Earlier chips are already in the pot; folding has zero additional cost.",
    ],
    coaching: spot.coaching,
    completed,
  };
  const rows = decisionEquity(q).rows;
  const equity = rows.reduce(
    (sum, row, i) => sum + row.equity * q.opponents[i].prior,
    0,
  );
  const prices = [Math.max(5, equity - 8), Math.min(48, equity + 8)];
  const betFor = (percent: number) =>
    Math.max(
      1,
      Math.round(((percent / 100) * q.potBefore) / (1 - (2 * percent) / 100)),
    );
  const high = (seed + Math.floor(seed / 6)) % 2;
  q.bet = betFor(prices[high]);
  q.counterBet = betFor(
    seed % 3 === 2
      ? high
        ? Math.min(48, equity + 4)
        : Math.max(3, equity - 4)
      : prices[1 - high],
  );
  q.guide = rows.map((row, i) => ({
    cards: q.opponents[i].cards,
    equity: row.equity,
    weight: q.opponents[i].prior,
  }));
  return q;
}
