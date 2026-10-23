import {
  deck,
  equity,
  legalRange,
  potOdds,
  random,
  type Card,
} from "../../../packages/poker/src/index.js";
import { openingCharts } from "../../../packages/poker/src/preflop-charts.js";
import {
  learningPathAnswerSchema,
  learningPathQuestionSchema,
  type LearningPathAnswer,
  type LearningPathQuestion,
} from "../../../packages/shared/src/learning-path.js";
import type { LessonDefinition } from "./learning-path-content.js";

export const LEARNING_PATH_GENERATOR_VERSION = "2.0.0";
export const LEARNING_PATH_TEMPLATE_VERSION = "1";
const contentVersion = "2";
const choiceTolerance = 0.1;

type ChoiceDefinition = Extract<LearningPathAnswer, { kind: "choice" }>;
type PercentDefinition = Extract<LearningPathAnswer, { kind: "percent" }>;
type QuestionDefinition = {
  question: LearningPathQuestion;
  correctAnswer: LearningPathAnswer;
  gradingRule:
    | { kind: "choice-equality" }
    | { kind: "percent-tolerance"; tolerance: number };
  explanation: string;
  takeaway: string;
};
type Rng = () => number;
type RiverScenario = { hero: Card[]; board: Card[]; range: Card[][] };
type TurnDrawScenario = RiverScenario;

const strategyLessons = {
  "strategy-preflop": {
    skillId: "strategy-preflop",
    title: "Position and opening baselines",
    concept:
      "Use position and a stated opening baseline to frame a preflop decision.",
    intro:
      "Read the exact table size, position and hand before using a chart. These authored raise-or-fold baselines are reference points, not solved strategy or a grade of general poker skill.",
  },
  "strategy-equity": {
    skillId: "strategy-equity",
    title: "Pot price and range equity",
    concept:
      "Compare the price of a call with your share against a supplied range.",
    intro:
      "The arithmetic can be exact while an opponent range remains an assumption. For an all-in call with no rake, compare your equity against the displayed range with the share required by the price.",
  },
  "strategy-postflop": {
    skillId: "strategy-postflop",
    title: "Draws, equity and call prices",
    concept:
      "Separate draw-completion probability from equity and the price of continuing.",
    intro:
      "A card that completes a draw is not automatically a winning out. Use the visible cards for draw-completion counts, then use the supplied range and call price for the decision.",
  },
  "strategy-ranges": {
    skillId: "strategy-ranges",
    title: "Read ranges and card blockers",
    concept:
      "Remove impossible combinations before evaluating a supplied range.",
    intro:
      "A range is a set of possible hands, not one known opponent hand. Your cards and the board block combinations that contain a visible card; equity is conditional on the remaining combinations and their stated weights.",
  },
  "strategy-betting": {
    skillId: "strategy-betting",
    title: "Bet sizing and value",
    concept:
      "Compare bet and check chip value under explicit response frequencies.",
    intro:
      "These river models show the fold frequency, calling range and pot size. They omit future action and raises so you can compare the stated bet and check outcomes exactly.",
  },
} as const;

type StrategyContentId = keyof typeof strategyLessons;
const generatedLessonCache = new Map<string, LessonDefinition>();

function stableHash(value: string): number {
  let hash = 2166136261;
  for (const character of value) {
    hash ^= character.charCodeAt(0);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

function rngFor(contentId: string, seed: number): Rng {
  return random((seed ^ stableHash(contentId)) >>> 0);
}

function integer(rng: Rng, maxExclusive: number): number {
  return Math.floor(rng() * maxExclusive);
}

function choose<T>(rng: Rng, values: readonly T[]): T {
  if (values.length === 0) throw new Error("Cannot choose from an empty set.");
  return values[integer(rng, values.length)]!;
}

function shuffled<T>(rng: Rng, values: readonly T[]): T[] {
  const result = [...values];
  for (let index = result.length - 1; index > 0; index--) {
    const other = integer(rng, index + 1);
    [result[index], result[other]] = [result[other]!, result[index]!];
  }
  return result;
}

function assertCardSet(cards: readonly Card[]): void {
  if (
    cards.some((card) => !deck.includes(card)) ||
    new Set(cards).size !== cards.length
  ) {
    throw new Error("Generated scenario contains invalid or colliding cards.");
  }
}

function cardScenario(rng: Rng): RiverScenario {
  const cards = shuffled(rng, deck);
  const hero = cards.slice(0, 2);
  const board = cards.slice(2, 7);
  const range = [cards.slice(7, 9), cards.slice(9, 11)];
  assertCardSet([...hero, ...board, ...range.flat()]);
  legalRange(hero, board, range);
  return { hero, board, range };
}

function valueBetScenario(rng: Rng): {
  scenario: RiverScenario;
  equity: number;
} {
  for (let attempt = 0; attempt < 128; attempt++) {
    const scenario = cardScenario(rng);
    const share = equity(scenario.hero, scenario.board, scenario.range).equity;
    if (share > 50) return { scenario, equity: share / 100 };
  }
  throw new Error(
    "Could not generate a river range that calls with worse hands on average.",
  );
}

function formatRange(range: readonly Card[][]): string {
  return range.map((combo) => combo.join(" ")).join(" / ");
}

function riverFacts(scenario: RiverScenario): string {
  assertCardSet([...scenario.hero, ...scenario.board]);
  if (scenario.hero.length !== 2 || scenario.board.length !== 5)
    throw new Error(
      "River scenario requires two private cards and five board cards.",
    );
  legalRange(scenario.hero, scenario.board, scenario.range);
  return `Hero: ${scenario.hero.join(" ")}. Board: ${scenario.board.join(" ")}. Range: ${formatRange(scenario.range)}.`;
}

function turnFacts(scenario: TurnDrawScenario): string {
  assertCardSet([...scenario.hero, ...scenario.board]);
  if (scenario.hero.length !== 2 || scenario.board.length !== 4)
    throw new Error(
      "Turn scenario requires two private cards and four board cards.",
    );
  legalRange(scenario.hero, scenario.board, scenario.range);
  return `Hero: ${scenario.hero.join(" ")}. Board: ${scenario.board.join(" ")}. Range: ${formatRange(scenario.range)}.`;
}

function turnCardFacts(scenario: TurnDrawScenario): string {
  assertCardSet([...scenario.hero, ...scenario.board]);
  if (scenario.hero.length !== 2 || scenario.board.length !== 4)
    throw new Error(
      "Turn scenario requires two private cards and four board cards.",
    );
  return `Hero: ${scenario.hero.join(" ")}. Board: ${scenario.board.join(" ")}.`;
}

function turnDrawScenario(rng: Rng): TurnDrawScenario {
  const suit = choose(rng, [..."cdhs"]);
  const suited = shuffled(
    rng,
    deck.filter((card) => card[1] === suit),
  ).slice(0, 4);
  const offsuit = shuffled(
    rng,
    deck.filter((card) => card[1] !== suit),
  ).slice(0, 2);
  const hero = suited.slice(0, 2);
  const board = [...suited.slice(2), ...offsuit];
  assertCardSet([...hero, ...board]);
  const rangeCards = shuffled(
    rng,
    deck.filter((card) => ![...hero, ...board].includes(card)),
  ).slice(0, 4);
  const range = [rangeCards.slice(0, 2), rangeCards.slice(2, 4)];
  legalRange(hero, board, range);
  if (hero.concat(board).filter((card) => card[1] === suit).length !== 4)
    throw new Error("Generated turn scenario is not a four-card flush draw.");
  return { hero, board, range };
}

function blockerScenario(rng: Rng): RiverScenario {
  const cards = shuffled(rng, deck);
  const hero = cards.slice(0, 2);
  const board = cards.slice(2, 7);
  const available = cards.slice(7);
  // One listed combination is deliberately impossible because it contains a
  // visible hero card. The remaining entries are legal and are never altered.
  const range = [
    [hero[0]!, available[0]!],
    available.slice(1, 3),
    available.slice(3, 5),
    available.slice(5, 7),
  ];
  assertCardSet([...hero, ...board]);
  if (
    new Set(range.map((combo) => [...combo].sort().join(""))).size !==
    range.length
  )
    throw new Error("Generated range contains duplicate combinations.");
  legalRange(hero, board, range);
  return { hero, board, range };
}

function price(rng: Rng, equityPercent: number): { pot: number; bet: number } {
  const candidates = shuffled(rng, [
    [20, 5],
    [20, 10],
    [30, 10],
    [30, 20],
    [40, 10],
    [40, 20],
    [50, 25],
    [60, 15],
    [60, 30],
    [80, 20],
    [80, 40],
  ] as const);
  const result = candidates.find(
    ([pot, bet]) => Math.abs(equityPercent - potOdds(pot, bet, bet)) > 0.25,
  );
  if (!result)
    throw new Error("Generated call price has no unique best action.");
  return { pot: result[0], bet: result[1] };
}

function choiceQuestion(
  skillId: string,
  id: string,
  title: string,
  prompt: string,
  choices: readonly [string, string][],
  answer: string,
  assumptions: readonly string[],
  explanation: string,
  takeaway: string,
  isTransfer: boolean,
): QuestionDefinition {
  return {
    question: {
      id,
      title,
      prompt,
      skillId,
      answerKind: "choice",
      choices: choices.map(([choiceId, label]) => ({ id: choiceId, label })),
      assumptions: [...assumptions],
      isTransfer,
    },
    correctAnswer: {
      kind: "choice",
      choiceId: answer,
    } satisfies ChoiceDefinition,
    gradingRule: { kind: "choice-equality" },
    explanation,
    takeaway,
  };
}

function percentQuestion(
  skillId: string,
  id: string,
  title: string,
  prompt: string,
  answer: number,
  assumptions: readonly string[],
  explanation: string,
  takeaway: string,
  isTransfer: boolean,
): QuestionDefinition {
  return {
    question: {
      id,
      title,
      prompt,
      skillId,
      answerKind: "percent",
      unitLabel: "Percent (within 0.1 percentage point)",
      assumptions: [...assumptions],
      isTransfer,
    },
    correctAnswer: {
      kind: "percent",
      value: answer,
    } satisfies PercentDefinition,
    gradingRule: { kind: "percent-tolerance", tolerance: choiceTolerance },
    explanation,
    takeaway,
  };
}

const preflopAssumptions = [
  "Use the displayed table size, position and starting-hand class. The pot is unopened, all earlier players folded, and the stacks are 100 big blinds.",
  "These are the local authored PreflopR raise-or-fold opening baselines for blinds 5/10, no antes and no rake. The chart is illustrative, not proof of optimal play.",
];
const riverAssumptions = [
  "Heads-up river decision; no rake, side pots or future betting. Pot is measured before the opponent's all-in bet; your call matches that bet.",
  "The displayed opponent combinations are equally weighted. Equity uses the best five-card hand and gives ties half the pot.",
  "The answer is conditional on this supplied range and price, not a claim about an actual opponent or universal strategy.",
];
const priceOnlyAssumptions = [
  "Heads-up chip arithmetic with no rake, side pots or future betting. The pot is measured before the opponent's bet, and your call matches that bet.",
  "Break-even share is the call cost divided by the final pot after your call. This arithmetic alone does not determine whether a call is profitable against an opponent range.",
];
const drawAssumptions = [
  "This is a turn decision with one river card to come. Use only the two displayed private cards and four visible board cards.",
  "Draw-completion counts use the 46 cards unseen from your perspective. A card completing the flush is not automatically a winning out.",
  "Range equity uses the displayed equally weighted opponent combinations and excludes cards in each combination from that river's possible cards.",
  "The all-in call has no future betting, rake or side pots; the answer is conditional on the stated range and price.",
];
const drawCountAssumptions = [
  "This is a turn decision with one river card to come. Use only the two displayed private cards and four visible board cards.",
  "The 46 cards unseen from your perspective include cards that may be in an opponent's unknown hand; this exercise counts flush-completing cards, not verified winning outs.",
  "A card completing the flush is not automatically a winning card against every opponent hand.",
];
const rangeAssumptions = [
  "Each listed opponent combination has equal weight. Remove combinations that contain a visible hero or board card before evaluating the range.",
  "The displayed river is complete. Equity uses the best five-card hand and gives ties half the pot.",
  "Any call comparison is an all-in river decision with no rake, side pots or future betting; it is conditional on this supplied range.",
];
const bettingAssumptions = [
  "This is a river chip-EV model with no rake, tournament effects or side pots. The pot is the amount already in the middle.",
  "When you bet, the opponent folds at the displayed frequency and otherwise calls from the equally weighted range shown; there are no raises.",
  "If called, the hand goes to showdown with no further betting. If you check, the same range reaches showdown without a bet.",
  "Bet EV is fold frequency × current pot plus call frequency × (equity × final pot − bet). Check EV is equity × current pot. The best action is conditional on these assumptions.",
];

function makePreflopLesson(
  contentId: StrategyContentId,
  rng: Rng,
): LessonDefinition {
  const definition = strategyLessons[contentId];
  const charts = shuffled(rng, openingCharts);
  const build = (
    id: string,
    chartIndex: number,
    isTransfer: boolean,
  ): QuestionDefinition => {
    const chart = charts[chartIndex % charts.length]!;
    const hand = choose(rng, chart.cells);
    const answer = hand.action;
    return choiceQuestion(
      definition.skillId,
      id,
      "Apply the opening baseline",
      `At a ${chart.players}-player chart, position: ${chart.position}; hand class: ${hand.hand}. Everyone before you folds in an unopened pot. What action does the local baseline list?`,
      [
        ["raise", "Raise according to this baseline"],
        ["fold", "Fold according to this baseline"],
      ],
      answer,
      [...chart.assumptions, ...preflopAssumptions],
      `The displayed ${chart.players}-player ${chart.position} chart lists ${hand.hand} as ${answer}. The chart gives a stated reference action; it does not model all opponent responses.`,
      "Use a chart only when its table size, position and unopened-pot assumptions match.",
      isTransfer,
    );
  };
  const core = [0, 1, 2].map((index) =>
    build(`open-baseline-${index + 1}`, index, false),
  );
  const transfers = [3, 4].map((index) =>
    build(`open-transfer-${index - 2}`, index, true),
  );
  return lesson(contentId, definition, core, shuffled(rng, transfers));
}

function makeEquityLesson(
  contentId: StrategyContentId,
  rng: Rng,
): LessonDefinition {
  const definition = strategyLessons[contentId];
  const priceQuestion = (id: string, transfer: boolean): QuestionDefinition => {
    const pot = choose(rng, [20, 30, 40, 50, 60, 80, 100]);
    const bet = choose(rng, [5, 10, 15, 20, 25, 30, 40]);
    const answer = potOdds(pot, bet, bet);
    return percentQuestion(
      definition.skillId,
      id,
      "Price of the call",
      `Pot before bet: ${pot} chips; bet/call: ${bet} chips. What percentage of the final pot must your call win on average to break even?`,
      answer,
      priceOnlyAssumptions,
      `The final pot is ${pot} + ${bet} + ${bet} = ${pot + 2 * bet}. The call costs ${bet}, so its break-even share is ${bet} / ${pot + 2 * bet} = ${answer.toFixed(2)}%.`,
      "Divide the new call cost by the final pot, including your call.",
      transfer,
    );
  };
  const equityQuestion = (
    id: string,
    transfer: boolean,
  ): QuestionDefinition => {
    const scenario = cardScenario(rng);
    const answer = equity(scenario.hero, scenario.board, scenario.range).equity;
    return percentQuestion(
      definition.skillId,
      id,
      "Share against this range",
      `${riverFacts(scenario)} Each combination has equal weight. What is your river equity percentage?`,
      answer,
      riverAssumptions,
      `The local evaluator compares the best five-card hand against each displayed combination. Ties contribute half; their equally weighted pot shares average to ${answer.toFixed(2)}%.`,
      "Equity is pot share against the displayed range, including ties.",
      transfer,
    );
  };
  const callQuestion = (id: string, transfer: boolean): QuestionDefinition => {
    const scenario = cardScenario(rng);
    const share = equity(scenario.hero, scenario.board, scenario.range).equity;
    const { pot, bet } = price(rng, share);
    const threshold = potOdds(pot, bet, bet);
    const answer = share > threshold ? "call" : "fold";
    return choiceQuestion(
      definition.skillId,
      id,
      "Compare equity with the price",
      `${riverFacts(scenario)} Pot before bet: ${pot} chips; bet/call: ${bet} chips. Under the all-in assumptions, what is the higher chip-EV choice?`,
      [
        ["call", "Call under this range and price"],
        ["fold", "Fold under this range and price"],
      ],
      answer,
      riverAssumptions,
      `Your equity is ${share.toFixed(2)}%; this price requires ${threshold.toFixed(2)}%. Calling has positive chip EV only when the supplied-range equity exceeds the required share.`,
      "Compare range equity with the final-pot share required by this call.",
      transfer,
    );
  };
  return lesson(
    contentId,
    definition,
    [
      priceQuestion("call-price-1", false),
      equityQuestion("range-equity-1", false),
      callQuestion("all-in-call-1", false),
    ],
    shuffled(rng, [
      priceQuestion("call-price-transfer-1", true),
      callQuestion("all-in-call-transfer-1", true),
    ]),
  );
}

function makePostflopLesson(
  contentId: StrategyContentId,
  rng: Rng,
): LessonDefinition {
  const definition = strategyLessons[contentId];
  const outsQuestion = (id: string, transfer: boolean): QuestionDefinition => {
    const scenario = turnDrawScenario(rng);
    const suit = scenario.hero
      .concat(scenario.board)
      .find(
        (card) =>
          scenario.hero
            .concat(scenario.board)
            .filter((candidate) => candidate[1] === card[1]).length === 4,
      )![1];
    const outs =
      13 -
      scenario.hero.concat(scenario.board).filter((card) => card[1] === suit)
        .length;
    const choices = [outs - 1, outs, outs + 1].map(
      (count) => [`outs-${count}`, `${count} cards`] as [string, string],
    );
    return choiceQuestion(
      definition.skillId,
      id,
      "Count the flush-completing cards",
      `${turnCardFacts(scenario)} How many of the 46 cards unseen from your perspective complete the flush on the river?`,
      choices,
      `outs-${outs}`,
      drawCountAssumptions,
      `There are 13 cards of that suit and four are visible, leaving ${outs} flush-completing cards among the 46 unseen cards. This counts completion, not whether the river wins the pot.`,
      "Separate cards that complete a draw from cards that guarantee a win.",
      transfer,
    );
  };
  const equityQuestion = (
    id: string,
    transfer: boolean,
  ): QuestionDefinition => {
    const scenario = turnDrawScenario(rng);
    const answer = equity(scenario.hero, scenario.board, scenario.range).equity;
    return percentQuestion(
      definition.skillId,
      id,
      "Equity with one card to come",
      `${turnFacts(scenario)} What is your equity against the displayed range on the turn?`,
      answer,
      drawAssumptions,
      `The evaluator checks each legal river separately for each equally weighted opponent combination. The result is ${answer.toFixed(2)}% pot share, including ties.`,
      "A draw-completion rate and range equity answer different questions.",
      transfer,
    );
  };
  const callQuestion = (id: string, transfer: boolean): QuestionDefinition => {
    const scenario = turnDrawScenario(rng);
    const share = equity(scenario.hero, scenario.board, scenario.range).equity;
    const { pot, bet } = price(rng, share);
    const required = potOdds(pot, bet, bet);
    return choiceQuestion(
      definition.skillId,
      id,
      "Price the turn draw",
      `${turnFacts(scenario)} Pot before bet: ${pot} chips; bet/call: ${bet} chips. With one card to come, should you call the all-in against this range?`,
      [
        ["call", "Call under this range and price"],
        ["fold", "Fold under this range and price"],
      ],
      share > required ? "call" : "fold",
      drawAssumptions,
      `The displayed range gives ${share.toFixed(2)}% equity and the price requires ${required.toFixed(2)}%. The comparison includes all river outcomes, not only flush-completing cards.`,
      "Use range equity, not raw draw outs, to compare with an all-in call price.",
      transfer,
    );
  };
  return lesson(
    contentId,
    definition,
    [
      outsQuestion("draw-outs-1", false),
      equityQuestion("draw-equity-1", false),
      callQuestion("draw-call-1", false),
    ],
    shuffled(rng, [
      outsQuestion("draw-outs-transfer-1", true),
      callQuestion("draw-call-transfer-1", true),
    ]),
  );
}

function makeRangeLesson(
  contentId: StrategyContentId,
  rng: Rng,
): LessonDefinition {
  const definition = strategyLessons[contentId];
  const blockers = (id: string, transfer: boolean): QuestionDefinition => {
    const scenario = blockerScenario(rng);
    const count = legalRange(
      scenario.hero,
      scenario.board,
      scenario.range,
    ).length;
    const options = [
      ...new Set([count - 1, count, count + 1].filter((value) => value > 0)),
    ].sort((a, b) => a - b);
    const choices = options.map(
      (value) =>
        [`remain-${value}`, `${value} combinations remain`] as [string, string],
    );
    return choiceQuestion(
      definition.skillId,
      id,
      "Remove blocked combinations",
      `${riverFacts(scenario)} How many combinations remain possible after removing hands containing a visible card?`,
      choices,
      `remain-${count}`,
      rangeAssumptions,
      `There are ${scenario.range.length} listed combinations. ${scenario.range.length - count} contain a visible card and cannot be held, leaving ${count} possible combinations.`,
      "Remove impossible combinations before evaluating range strength.",
      transfer,
    );
  };
  const equityQuestion = (
    id: string,
    transfer: boolean,
  ): QuestionDefinition => {
    const scenario = blockerScenario(rng);
    const answer = equity(scenario.hero, scenario.board, scenario.range).equity;
    return percentQuestion(
      definition.skillId,
      id,
      "Read the unblocked range",
      `${riverFacts(scenario)} After blocked combinations are removed, what is your river equity against the remaining equally weighted range?`,
      answer,
      rangeAssumptions,
      `The evaluator removes combinations sharing a visible card, then averages pot share across the remaining combinations. Your equity is ${answer.toFixed(2)}%.`,
      "Blockers change which combinations can still exist in the opponent range.",
      transfer,
    );
  };
  const callQuestion = (id: string): QuestionDefinition => {
    const scenario = blockerScenario(rng);
    const share = equity(scenario.hero, scenario.board, scenario.range).equity;
    const { pot, bet } = price(rng, share);
    const required = potOdds(pot, bet, bet);
    return choiceQuestion(
      definition.skillId,
      id,
      "Compare price after blockers",
      `${riverFacts(scenario)} Pot before bet: ${pot} chips; bet/call: ${bet} chips. Once impossible combinations are removed, what is the higher chip-EV all-in choice?`,
      [
        ["call", "Call under this range and price"],
        ["fold", "Fold under this range and price"],
      ],
      share > required ? "call" : "fold",
      rangeAssumptions,
      `After blocker removal, equity is ${share.toFixed(2)}% and the price requires ${required.toFixed(2)}%. Compare the two using the remaining equally weighted combinations.`,
      "Do not count combinations your cards make impossible.",
      false,
    );
  };
  return lesson(
    contentId,
    definition,
    [
      blockers("blocked-combos-1", false),
      equityQuestion("blocked-equity-1", false),
      callQuestion("blocked-call-1"),
    ],
    shuffled(rng, [
      blockers("blocked-combos-transfer-1", true),
      equityQuestion("blocked-equity-transfer-1", true),
    ]),
  );
}

function makeBettingLesson(
  contentId: StrategyContentId,
  rng: Rng,
): LessonDefinition {
  const definition = strategyLessons[contentId];
  const betQuestion = (id: string, transfer: boolean): QuestionDefinition => {
    const { scenario, equity: share } = valueBetScenario(rng);
    const candidates = shuffled(
      rng,
      [20, 30, 40, 50, 60, 80, 100].flatMap((potSize) =>
        [10, 15, 20, 25, 30, 40].flatMap((betSize) =>
          [20, 30, 40, 50, 60, 70, 80].map(
            (foldFrequency) => [potSize, betSize, foldFrequency] as const,
          ),
        ),
      ),
    );
    const selected = candidates.find(([potSize, betSize, foldFrequency]) => {
      const fold = foldFrequency / 100;
      const betValue =
        fold * potSize +
        (1 - fold) * (share * (potSize + 2 * betSize) - betSize);
      return Math.abs(betValue - share * potSize) >= 0.01;
    });
    if (!selected)
      throw new Error("Could not generate a unique bet-EV comparison.");
    const [pot, bet, foldPct] = selected;
    const foldFrequency = foldPct / 100;
    const betEv =
      foldFrequency * pot +
      (1 - foldFrequency) * (share * (pot + 2 * bet) - bet);
    const checkEv = share * pot;
    if (Math.abs(betEv - checkEv) < 0.01)
      throw new Error(
        "Generated bet has no unique best action under the stated model.",
      );
    const answer = betEv > checkEv ? "bet" : "check";
    return choiceQuestion(
      definition.skillId,
      id,
      "Compare bet and check value",
      `${riverFacts(scenario)} Pot: ${pot} chips; bet: ${bet} chips; fold frequency: ${foldPct}%. If you bet, the opponent folds this often and otherwise calls from the displayed range. What has higher expected chip value: bet or check?`,
      [
        ["bet", `Bet ${bet} chips`],
        ["check", "Check"],
      ],
      answer,
      bettingAssumptions,
      `Against the displayed range, your share is ${share * 100}%. Bet EV is ${betEv.toFixed(2)} chips and check EV is ${checkEv.toFixed(2)} chips. Under this model, ${answer} has the higher expected chip value.`,
      "Bet value depends on both response frequency and the range that continues.",
      transfer,
    );
  };
  return lesson(
    contentId,
    definition,
    [
      betQuestion("bet-ev-1", false),
      betQuestion("bet-ev-2", false),
      betQuestion("bet-ev-3", false),
    ],
    shuffled(rng, [
      betQuestion("bet-ev-transfer-1", true),
      betQuestion("bet-ev-transfer-2", true),
    ]),
  );
}

function lesson(
  contentId: StrategyContentId,
  definition: (typeof strategyLessons)[StrategyContentId],
  coreQuestions: QuestionDefinition[],
  transferQuestions: QuestionDefinition[],
): LessonDefinition {
  const all = [...coreQuestions, ...transferQuestions];
  if (new Set(all.map((item) => item.question.id)).size !== all.length)
    throw new Error("Generated lesson has duplicate question IDs.");
  for (const item of all) {
    learningPathQuestionSchema.parse(item.question);
    learningPathAnswerSchema.parse(item.correctAnswer);
    if (item.question.answerKind === "choice") {
      const choiceIds = item.question.choices?.map((choice) => choice.id) ?? [];
      if (
        new Set(choiceIds).size !== choiceIds.length ||
        choiceIds.filter(
          (choiceId) =>
            item.correctAnswer.kind === "choice" &&
            choiceId === item.correctAnswer.choiceId,
        ).length !== 1
      ) {
        throw new Error(
          "Generated choice question lacks exactly one best answer.",
        );
      }
    } else if (
      item.correctAnswer.kind !== "percent" ||
      !Number.isFinite(item.correctAnswer.value) ||
      item.correctAnswer.value < 0 ||
      item.correctAnswer.value > 100
    ) {
      throw new Error(
        "Generated percentage answer is outside its valid range.",
      );
    }
    if (item.question.skillId !== definition.skillId)
      throw new Error(
        "Generated question is attached to the wrong strategy skill.",
      );
  }
  return {
    contentId,
    contentVersion,
    title: definition.title,
    skillId: definition.skillId,
    concept: definition.concept,
    intro: definition.intro,
    coreQuestions,
    transferQuestions,
  };
}

/** Build a deterministic strategy lesson; answer keys remain server-side. */
export function generateVersion2Lesson(
  contentId: string,
  exerciseSeed: number,
): LessonDefinition | undefined {
  if (
    !Number.isInteger(exerciseSeed) ||
    exerciseSeed < 0 ||
    exerciseSeed > 4294967295
  ) {
    throw new Error("Exercise seed must be an unsigned 32-bit integer.");
  }
  if (!(contentId in strategyLessons)) return undefined;
  const id = contentId as StrategyContentId;
  const cacheKey = `${id}:${exerciseSeed}`;
  const cached = generatedLessonCache.get(cacheKey);
  if (cached) {
    generatedLessonCache.delete(cacheKey);
    generatedLessonCache.set(cacheKey, cached);
    return structuredClone(cached);
  }
  const rng = rngFor(id, exerciseSeed);
  let generated: LessonDefinition;
  switch (id) {
    case "strategy-preflop":
      generated = makePreflopLesson(id, rng);
      break;
    case "strategy-equity":
      generated = makeEquityLesson(id, rng);
      break;
    case "strategy-postflop":
      generated = makePostflopLesson(id, rng);
      break;
    case "strategy-ranges":
      generated = makeRangeLesson(id, rng);
      break;
    case "strategy-betting":
      generated = makeBettingLesson(id, rng);
      break;
  }
  generatedLessonCache.set(cacheKey, generated!);
  if (generatedLessonCache.size > 64)
    generatedLessonCache.delete(generatedLessonCache.keys().next().value!);
  return structuredClone(generated!);
}
