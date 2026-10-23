import { createHash } from "node:crypto";
import { best, equity, potOdds } from "../../../packages/poker/src/index.js";
import { openingCharts } from "../../../packages/poker/src/preflop-charts.js";
import {
  learningPathAnswerSchema,
  learningPathQuestionSchema,
  type LearningPathAnswer,
  type LearningPathCatalog,
  type LearningPathFeedback,
  type LearningPathQuestion,
} from "../../../packages/shared/src/learning-path.js";
import {
  LEARNING_PATH_GENERATOR_VERSION,
  LEARNING_PATH_TEMPLATE_VERSION,
  generateVersion2Lesson,
} from "./learning-path-generated.js";

// Answer keys and grading rules stay on the server. Only getPublicQuestion is
// suitable for an unanswered question response.
type QuestionDefinition = {
  question: LearningPathQuestion;
  correctAnswer: LearningPathAnswer;
  gradingRule:
    | { kind: "choice-equality" }
    | { kind: "percent-tolerance"; tolerance: number };
  explanation: string;
  takeaway: string;
};
export type LessonDefinition = {
  contentId: string;
  contentVersion: string;
  title: string;
  skillId: string;
  concept: string;
  intro: string;
  coreQuestions: QuestionDefinition[];
  transferQuestions: QuestionDefinition[];
};

const contentVersion = "1";
function choiceQuestion(
  id: string,
  title: string,
  prompt: string,
  choices: [string, string][],
  correctChoice: string,
  explanation: string,
  takeaway: string,
  isTransfer = false,
): QuestionDefinition {
  return {
    question: {
      id,
      title,
      prompt,
      skillId: "legal-actions",
      answerKind: "choice",
      choices: choices.map(([id, label]) => ({ id, label })),
      assumptions: [
        "Standard no-limit Texas Hold’em rules; chip amounts are totals for the current betting round.",
        "Players have enough chips for the listed actions, and action is open to the player described.",
        "These are rules questions, not claims about the most profitable strategy.",
      ],
      isTransfer,
    },
    correctAnswer: { kind: "choice", choiceId: correctChoice },
    gradingRule: { kind: "choice-equality" },
    explanation,
    takeaway,
  };
}

const firstLesson: LessonDefinition = {
  contentId: "table-flow",
  contentVersion,
  title: "Table flow and legal actions",
  skillId: "legal-actions",
  concept: "Know what you can do when it is your turn.",
  intro:
    "In Texas Hold’em, each player receives two private cards. Betting happens before the flop, on the three-card flop, on the one-card turn and on the one-card river. When you face no extra cost, you can check. Facing a bet, you can fold, call or make a legal raise. This lesson practices the rules before strategy.",
  coreQuestions: [
    choiceQuestion(
      "free-check",
      "No bet to match",
      "On the flop, everyone before you checks. Which action lets you stay in the hand without adding chips?",
      [
        ["check", "Check"],
        ["call", "Call"],
        ["fold", "Fold"],
      ],
      "check",
      "Checking passes the action without adding chips when there is no bet to match. Folding gives up the hand; calling matches an outstanding bet.",
      "When nothing is owed, checking keeps you in the hand for no extra chips.",
    ),
    choiceQuestion(
      "facing-bet",
      "Match a bet",
      "On the turn, an opponent bets 10 chips. You have put in 0 this round. Which action matches the 10 and keeps you in the hand without raising?",
      [
        ["check", "Check"],
        ["call", "Call 10"],
        ["fold", "Fold"],
      ],
      "call",
      "Calling adds the 10 chips needed to match the bet. You cannot check while facing an unmatched bet.",
      "A call matches the current bet; a check is available only when nothing more is owed.",
    ),
    choiceQuestion(
      "minimum-raise",
      "A full raise",
      "On the flop, A bets 10 and B raises to 20 total. You have not acted. What is the smallest legal full raise total?",
      [
        ["raise-to-25", "25 total"],
        ["raise-to-30", "30 total"],
        ["raise-to-40", "40 total"],
      ],
      "raise-to-30",
      "B raised the total from 10 to 20, an increase of 10. A full raise must add at least that last full increase: 20 + 10 = 30 total.",
      "The minimum full raise adds at least the size of the last full bet or raise increase.",
    ),
    choiceQuestion(
      "next-street",
      "After preflop betting",
      "At least two players remain. Preflop, all other remaining players call the big blind, then the big blind checks. The betting round is complete and no one is all-in. What comes next?",
      [
        ["flop", "Deal the three-card flop"],
        ["turn", "Deal the one-card turn"],
        ["showdown", "Immediately compare hands"],
      ],
      "flop",
      "After the callers, the big blind still has the option to raise. Here the big blind checks, completing preflop betting. The flop then reveals three community cards and another betting round follows.",
      "The street order is preflop, flop, turn, river, then showdown if needed.",
    ),
  ],
  transferQuestions: [
    choiceQuestion(
      "transfer-free",
      "A new river situation",
      "On the river, your opponent checks to you. You owe no chips. Which action keeps you in the hand without adding chips?",
      [
        ["call", "Call"],
        ["check", "Check"],
        ["fold", "Fold"],
      ],
      "check",
      "The street changed, but the rule did not: with no unmatched bet, checking keeps you in the hand without adding chips.",
      "Use the amount owed to distinguish checking from calling, on every street.",
      true,
    ),
    choiceQuestion(
      "transfer-facing-bet",
      "A new flop situation",
      "On the flop, an opponent bets 15 chips and you have put in 0 this round. Which set contains your legal action types?",
      [
        ["check-call", "Check or call"],
        ["fold-call-raise", "Fold, call, or make a legal raise"],
        ["check-only", "Check only"],
      ],
      "fold-call-raise",
      "You face an unmatched bet, so checking is unavailable. You may fold, call the 15, or make a legal raise because the action is open and stacks are sufficient.",
      "Facing a bet means choosing among folding, calling and any legal raise.",
      true,
    ),
  ],
};

// Each lesson owns one catalog skill so event-derived missed-skill reviews can
// resolve every answer back to the same lesson without a second routing table.
function lessonQuestion(
  skillId: string,
  assumptions: string[],
  id: string,
  title: string,
  prompt: string,
  choices: [string, string][],
  correctChoice: string,
  explanation: string,
  takeaway: string,
  isTransfer = false,
): QuestionDefinition {
  const item = choiceQuestion(
    id,
    title,
    prompt,
    choices,
    correctChoice,
    explanation,
    takeaway,
    isTransfer,
  );
  item.question.skillId = skillId;
  item.question.assumptions = [...assumptions];
  return item;
}
function percentQuestion(
  skillId: string,
  assumptions: string[],
  id: string,
  title: string,
  prompt: string,
  value: number,
  explanation: string,
  takeaway: string,
  isTransfer = false,
): QuestionDefinition {
  return {
    question: {
      id,
      title,
      prompt,
      skillId,
      assumptions: [...assumptions],
      answerKind: "percent",
      unitLabel: "Percent (within 0.1 percentage point)",
      isTransfer,
    },
    correctAnswer: { kind: "percent", value },
    gradingRule: { kind: "percent-tolerance", tolerance: 0.1 },
    explanation,
    takeaway,
  };
}
const rankingAssumptions = [
  "Standard Texas Hold’em: make the best five-card hand from your two cards and the five community cards; using both private cards is optional.",
  "Cards are written rank then suit: c clubs, d diamonds, h hearts, s spades; T means ten.",
  "Every card in the scenario is explicitly supplied for this exercise. There is no live opponent hand or future runout to inspect.",
];
const rankingChoice = lessonQuestion.bind(
  null,
  "hand-rankings",
  rankingAssumptions,
);
const rankingLesson: LessonDefinition = {
  contentId: "hand-rankings",
  contentVersion,
  title: "Build the best five-card hand",
  skillId: "hand-rankings",
  concept: "Compare five-card hands, including kickers and shared boards.",
  intro:
    "From weakest to strongest: high card, pair, two pair, three of a kind, straight, flush, full house, four of a kind, straight flush. Use any five of your seven available cards. If categories match, compare the relevant ranks and then kickers. Identical best five cards tie; suits never break a tie.",
  coreQuestions: [
    rankingChoice(
      "two-pair",
      "Count both pairs",
      "Your cards are Ac Ad. The river board is Kc 7d 7s 2h 3c. What is your best hand category?",
      [
        ["pair", "One pair"],
        ["two-pair", "Two pair"],
        ["trips", "Three of a kind"],
      ],
      best(["Ac", "Ad", "Kc", "7d", "7s", "2h", "3c"])
        .name.toLowerCase()
        .replaceAll(" ", "-"),
      "Aces and sevens make two pair, with the king as the fifth card. The board pair counts alongside your private pair.",
      "Use all available cards to find the best five, not just your private cards.",
    ),
    rankingChoice(
      "flush-straight",
      "Compare categories",
      "At showdown one player has Ah Jh 8h 5h 2h (a flush). Another has 9c 8d 7s 6c 5d (a straight). Which category wins?",
      [
        ["straight", "Straight"],
        ["flush", "Flush"],
        ["tie", "Tie"],
      ],
      "flush",
      "A flush ranks above a straight, regardless of the straight's high card.",
      "Compare hand categories before comparing kickers.",
    ),
    rankingChoice(
      "board-tie",
      "The board can play",
      "The river board is As Ks Qs Js Ts. Your cards are 2c 3d; the other player's supplied cards are Ah Ad. Who wins?",
      [
        ["aces", "The private aces win"],
        ["you", "You win"],
        ["tie", "Tie: both play the board"],
      ],
      "tie",
      "The board is an ace-high straight flush, the strongest possible five cards. Both players use those same five cards and split the pot.",
      "Private cards only matter when they improve the best five-card hand.",
    ),
  ],
  transferQuestions: [
    rankingChoice(
      "transfer-full-house",
      "A paired board",
      "Your cards are Qc Qd. The river board is Qh 8s 8c 2d 3s. What is your best hand category?",
      [
        ["trips", "Three of a kind"],
        ["full-house", "Full house"],
        ["two-pair", "Two pair"],
      ],
      "full-house",
      "Three queens plus two eights form a full house, which ranks above a flush.",
      "A full house combines three of one rank with two of another.",
      true,
    ),
    rankingChoice(
      "transfer-kicker",
      "Same pair, different kicker",
      "The river board is Qc 7d 4s 2h 9c. One player has Qd As; the other's supplied cards are Qh Kd. Which hand wins?",
      [
        ["ace-kicker", "Queens with an ace kicker"],
        ["king-kicker", "Queens with a king kicker"],
        ["tie", "Tie"],
      ],
      "ace-kicker",
      "Both have one pair of queens. The ace kicker outranks the king; compare the highest differing kicker after the pair.",
      "Equal pairs can still differ in their remaining best-five kickers.",
      true,
    ),
  ],
};
const buttonChart = openingCharts.find(
  (chart) => chart.players === 6 && chart.position === "Button",
)!;
const openingAssumptions = [
  ...buttonChart.assumptions,
  "The opening questions ask you to read an authored PreflopR baseline. Chart agreement is not proven optimal play or a measure of general poker skill.",
];
const openingChoice = lessonQuestion.bind(
  null,
  "position-opening",
  openingAssumptions,
);
const chartAction = (hand: string) =>
  buttonChart.cells.find((cell) => cell.hand === hand)!.action;
const openingLesson: LessonDefinition = {
  contentId: "position-opening",
  contentVersion,
  title: "Position and opening baselines",
  skillId: "position-opening",
  concept: "Use position and context before consulting an opening chart.",
  intro:
    "At tables of three or more players, preflop action starts left of the big blind. After the flop, action starts left of the button among remaining players; the button acts last if still in. Acting later lets you observe earlier actions. Our local charts are authored raise-or-fold baselines for unopened pots. They are examples to read and discuss, not solved strategy or skill scores.",
  coreQuestions: [
    openingChoice(
      "button-position",
      "Who acts last?",
      "At a six-player table, the button remains in the hand after the flop. Relative to the other remaining players, when does the button act in each betting round?",
      [
        ["first", "First"],
        ["last", "Last"],
      ],
      "last",
      "Postflop action begins with the first remaining player left of the button. The button therefore acts after the other remaining players.",
      "Position describes when you act and what actions you can observe.",
    ),
    openingChoice(
      "baseline-aces",
      "Read a premium opening",
      "Six players, button, 100 BB, blinds 5/10, no rake or antes. Everyone before you folds. For AA, does the local authored button baseline list raise or fold?",
      [
        ["raise", "Raise according to the baseline"],
        ["fold", "Fold according to the baseline"],
      ],
      chartAction("AA"),
      "The local six-player button chart includes AA in its raise group. Its app-selected opening size is 2.5 BB, or 25 chips. That size and chart are illustrative.",
      "This checks reading an authored baseline, not proving an optimal action.",
    ),
    openingChoice(
      "baseline-seven-two",
      "Read a weak opening",
      "In the same unopened six-player button context, what does the authored baseline list for 72o (seven-two offsuit)?",
      [
        ["raise", "Raise according to the baseline"],
        ["fold", "Fold according to the baseline"],
      ],
      chartAction("72o"),
      "72o is outside this baseline's raise group, so the chart lists fold. A chart departure alone is not a calculated poker mistake.",
      "Read the matching table size, seat and hand before comparing chart actions.",
    ),
    openingChoice(
      "chart-limits",
      "What does agreement show?",
      "Your opening agrees with this authored chart. What does that establish?",
      [
        ["optimal", "It proves optimal poker play"],
        ["baseline", "It matches this baseline under its assumptions"],
      ],
      "baseline",
      "Agreement establishes only that you followed the authored baseline. It does not establish an action's profitability against actual opponents or general skill.",
      "Keep chart agreement separate from evidence of decision quality.",
    ),
  ],
  transferQuestions: [
    openingChoice(
      "transfer-kings",
      "Another chart lookup",
      "Six players, button, everyone earlier folds, 100 BB and no rake or antes. What does the same local baseline list for KK?",
      [
        ["fold", "Fold according to the baseline"],
        ["raise", "Raise according to the baseline"],
      ],
      chartAction("KK"),
      "KK is included in this authored button opening range. The chart lists a raise; it does not solve all possible opponent responses.",
      "Use an opening baseline only in its stated context.",
      true,
    ),
    openingChoice(
      "transfer-facing-raise",
      "Check chart applicability",
      "At six players you are on the button, but an earlier player has raised. Can this unopened-pot baseline grade your response?",
      [
        ["applies", "Yes, use the same opening chart"],
        ["outside", "No, responding to a raise is outside its scope"],
      ],
      "outside",
      "An earlier raise changes the decision. This authored opening chart requires everyone earlier to fold and cannot grade a response to a raise.",
      "Check the public action history before applying a chart.",
      true,
    ),
  ],
};
const equityAssumptions = [
  "Heads-up chip arithmetic with no rake, side pots or tournament effects. Pot means chips before the opponent's stated bet; your call matches that bet.",
  "River boards and hypothetical opponent ranges are supplied visibly. Each listed range combination has equal weight; ties contribute half the pot share.",
  "An all-in call leaves no future betting. Equity against the supplied range is conditional on that range, not a prediction of an actual opponent or a general strategy claim.",
];
const equityChoice = lessonQuestion.bind(
  null,
  "pot-odds-equity",
  equityAssumptions,
);
const equityPercent = percentQuestion.bind(
  null,
  "pot-odds-equity",
  equityAssumptions,
);
const visibleRiverEquity = equity(
  ["Ah", "Kd"],
  ["Ac", "7d", "4s", "2h", "9c"],
  [
    ["As", "Qd"],
    ["7c", "7s"],
  ],
).equity;
const equityLesson: LessonDefinition = {
  contentId: "pot-odds-equity",
  contentVersion,
  title: "Pot odds and a visible range",
  skillId: "pot-odds-equity",
  concept:
    "Compare the price of an all-in call with pot share under explicit assumptions.",
  intro:
    "Required pot share is cost to call divided by the final pot after your call. Equity is your expected pot share against a stated range, including ties. For a heads-up all-in with no rake or future betting, call chip EV = equity fraction × final pot − call cost; folding adds or loses zero more chips. A different opponent range can change the result.",
  coreQuestions: [
    equityPercent(
      "call-price",
      "Price of a call",
      "The pot is 50 before an opponent bets all-in for 25. You must call 25. What percentage of the final pot must you win on average to break even?",
      potOdds(50, 25, 25),
      "The final pot is 50 + 25 + 25 = 100. Required share is 25 / 100 = 25%. Money committed earlier is already in the pot.",
      "Divide the new call cost by the final pot, including your call.",
    ),
    equityPercent(
      "river-range",
      "Share against a supplied range",
      "Your cards: Ah Kd. River board: Ac 7d 4s 2h 9c. The supplied opponent range is exactly As Qd (50%) or 7c 7s (50%). What is your equity percentage?",
      visibleRiverEquity,
      "Against As Qd, your ace pair wins with the king kicker. Against 7c 7s, the opponent's three sevens win. One equally weighted win and one loss give 50% equity.",
      "Equity depends on the supplied range and weights, not just your hand category.",
    ),
    equityChoice(
      "conditional-call",
      "Compare share and price",
      "Use the same Ah Kd, Ac 7d 4s 2h 9c board and range As Qd (50%) / 7c 7s (50%). The pot is 50 before a 25 all-in bet. Your equity is 50%; the call needs 25%. Which has higher chip EV under these assumptions?",
      [
        ["call", "Call under the supplied assumptions"],
        ["fold", "Fold under the supplied assumptions"],
      ],
      "call",
      "Calling has chip EV 0.50 × 100 − 25 = +25 chips from this decision; folding has 0. This is an exact conditional calculation for the stated river range and price.",
      "The arithmetic can be exact while the assumed opponent range remains uncertain.",
    ),
  ],
  transferQuestions: [
    equityPercent(
      "transfer-price",
      "A different call price",
      "The pot is 40 before an opponent bets all-in for 40. Calling costs 40. What percentage of the final pot is required to break even?",
      potOdds(40, 40, 40),
      "The final pot is 40 + 40 + 40 = 120, so 40 / 120 = 33.333…%. A pot-sized bet offers a one-third break-even share.",
      "Recalculate the final pot when the bet size changes.",
      true,
    ),
    equityPercent(
      "transfer-tie",
      "Ties count as pot share",
      "Your cards are 2c 3d. River board: As Ks Qs Js Ts. The supplied range is Ah Ad (50%) or Kh Kd (50%). What is your equity percentage?",
      equity(
        ["2c", "3d"],
        ["As", "Ks", "Qs", "Js", "Ts"],
        [
          ["Ah", "Ad"],
          ["Kh", "Kd"],
        ],
      ).equity,
      "Both range combinations tie your board royal flush. You win no outright showdowns but receive half the pot every time, so equity is 50%.",
      "Equity includes your fraction of tied pots, not only outright wins.",
      true,
    ),
  ],
};
const postflopAssumptions = [
  "Use only the stated private cards and visible flop. Opponent cards and future community cards are unknown.",
  "For next-card probabilities, treat all 47 cards unseen from your perspective as equally likely. This is card-counting under a stated model, not equity against an opponent range.",
  "Completing a draw does not guarantee winning. With chips behind, future actions, prices and opponent ranges also matter.",
];
const postflopChoice = lessonQuestion.bind(
  null,
  "postflop-reasoning",
  postflopAssumptions,
);
const postflopPercent = percentQuestion.bind(
  null,
  "postflop-reasoning",
  postflopAssumptions,
);
const postflopLesson: LessonDefinition = {
  contentId: "postflop-reasoning",
  contentVersion,
  title: "First postflop decisions",
  skillId: "postflop-reasoning",
  concept: "Separate made hands, draws and conditional decision evidence.",
  intro:
    "A made hand exists now; a draw needs more community cards to improve. Count cards that complete the draw, then ask whether those cards really win against a plausible range. A one-card draw probability is not your overall equity or a guarantee. With future betting, equity alone cannot settle a call. After these foundations, try Bot table or Cash Decision Lab from the main navigation to practice public-history decisions with explicit assumptions.",
  coreQuestions: [
    postflopChoice(
      "flush-draw",
      "Made hand or draw?",
      "Your cards are Ah Kh. The flop is Qh 7h 2c. Do you already have a flush?",
      [
        ["flush", "Yes, a made flush"],
        ["draw", "No, a four-heart flush draw"],
      ],
      "draw",
      "There are four hearts among your five visible cards. A flush needs five hearts, so this is a draw rather than a made flush.",
      "Name what you have now separately from what another card could make.",
    ),
    postflopChoice(
      "flush-outs",
      "Count completing cards",
      "With Ah Kh on Qh 7h 2c, how many unseen hearts would complete a five-heart flush on the turn? Count completion only, not guaranteed winning cards.",
      [
        ["nine", "9 hearts"],
        ["thirteen", "13 hearts"],
        ["four", "4 hearts"],
      ],
      "nine",
      "A deck has 13 hearts. Four are visible, so 13 − 4 = 9 unseen hearts complete your flush on the next card. Some may still lose against particular hands.",
      "Subtract visible cards before counting draw-completing cards.",
    ),
    postflopPercent(
      "next-card",
      "One-card draw probability",
      "Your cards are Ah Kh; flop Qh 7h 2c. Assume the 47 unseen cards are equally likely. What percent of turn cards complete your flush?",
      900 / 47,
      "Nine of the 47 unseen cards are hearts: 9 / 47 × 100 = 19.149…%. This is a next-card completion probability, not your showdown equity.",
      "State the denominator and distinguish draw probability from pot equity.",
    ),
    postflopChoice(
      "future-betting",
      "What does equity leave out?",
      "On the flop with chips still behind, an estimate says your equity exceeds the current call price. Is that alone enough to prove calling is profitable?",
      [
        ["enough", "Yes, equity alone settles it"],
        ["not-enough", "No, future betting and the opponent range matter"],
      ],
      "not-enough",
      "Unlike an all-in exercise, a flop call can face later bets. Your realized share depends on later actions and the range assumption; raw equity versus today's price alone does not prove profitability.",
      "Use all-in arithmetic only when its no-future-betting assumption holds.",
    ),
  ],
  transferQuestions: [
    postflopChoice(
      "transfer-board-pair",
      "Improving can still lose",
      "You hold Ah Kh on Qh 7h 2c. The turn is 2h. You now have a flush and the board is paired. Does the flush guarantee a win against every possible opponent hand?",
      [
        ["guaranteed", "Yes, every flush wins"],
        ["not-guaranteed", "No, a full house or four of a kind can beat it"],
      ],
      "not-guaranteed",
      "For example, a hypothetical opponent with Qc Qd would have queens full of twos. This counterexample is a possible hand, not disclosed opponent information.",
      "A draw-completing card need not be a guaranteed winning card.",
      true,
    ),
    postflopPercent(
      "transfer-straight",
      "A different draw",
      "You hold 8c 9d on 6h 7s Kc. Any five or ten completes a straight on the turn. With 47 equally likely unseen cards, what is the next-card completion percentage?",
      800 / 47,
      "Four fives plus four tens give eight completing cards: 8 / 47 × 100 = 17.021…%. Completing the straight is still not a guarantee of winning.",
      "Count distinct completing cards and divide by the explicitly stated unseen pool.",
      true,
    ),
  ],
};
const legacyLessons: LessonDefinition[] = [
  firstLesson,
  rankingLesson,
  openingLesson,
  equityLesson,
  postflopLesson,
];
const catalog: LearningPathCatalog = {
  pathId: "poker-foundations",
  contentVersion: "2",
  title: "Poker strategy",
  units: [
    {
      id: "preflop-decisions",
      title: "Preflop decisions",
      lessons: [
        {
          contentId: "strategy-preflop",
          title: "Position and opening baselines",
          skillId: "strategy-preflop",
        },
      ],
    },
    {
      id: "price-and-equity",
      title: "Price and equity",
      lessons: [
        {
          contentId: "strategy-equity",
          title: "Pot price and range equity",
          skillId: "strategy-equity",
        },
      ],
    },
    {
      id: "draw-decisions",
      title: "Postflop draws",
      lessons: [
        {
          contentId: "strategy-postflop",
          title: "Draws, equity and call prices",
          skillId: "strategy-postflop",
        },
      ],
    },
    {
      id: "ranges-and-blockers",
      title: "Ranges and blockers",
      lessons: [
        {
          contentId: "strategy-ranges",
          title: "Read ranges and card blockers",
          skillId: "strategy-ranges",
        },
      ],
    },
    {
      id: "value-betting",
      title: "Value betting",
      lessons: [
        {
          contentId: "strategy-betting",
          title: "Bet sizing and value",
          skillId: "strategy-betting",
        },
      ],
    },
  ],
};

export function getLearningPathCatalog(): LearningPathCatalog {
  return structuredClone(catalog);
}
export function getLessonDefinition(
  contentId: string,
  contentVersion: string,
  exerciseSeed?: number,
): LessonDefinition | undefined {
  if (contentVersion === "2") {
    if (
      exerciseSeed === undefined ||
      !Number.isInteger(exerciseSeed) ||
      exerciseSeed < 0 ||
      exerciseSeed > 4294967295
    )
      return undefined;
    return generateVersion2Lesson(contentId, exerciseSeed);
  }
  if (contentVersion !== "1") return undefined;
  const lesson = legacyLessons.find(
    (item) =>
      item.contentId === contentId && item.contentVersion === contentVersion,
  );
  return lesson && structuredClone(lesson);
}
function findQuestion(
  contentId: string,
  contentVersion: string,
  questionId: string,
  exerciseSeed?: number,
): QuestionDefinition | undefined {
  const lesson = getLessonDefinition(contentId, contentVersion, exerciseSeed);
  return (
    lesson &&
    [...lesson.coreQuestions, ...lesson.transferQuestions].find(
      (item) => item.question.id === questionId,
    )
  );
}
export function getPublicQuestion(
  contentId: string,
  contentVersion: string,
  questionId: string,
  exerciseSeed?: number,
): LearningPathQuestion | undefined {
  const item = findQuestion(
    contentId,
    contentVersion,
    questionId,
    exerciseSeed,
  );
  // Parse a dedicated public object; strict validation fails closed if a future
  // author accidentally attaches an answer key or grading metadata to it.
  return item && learningPathQuestionSchema.parse(item.question);
}
export function selectLearningPathTransfer(
  contentId: string,
  contentVersion: string,
  seenQuestionIds: readonly string[],
  exerciseSeed?: number,
): { questionId: string; reason: string } {
  const lesson = getLessonDefinition(contentId, contentVersion, exerciseSeed);
  if (!lesson) throw new Error("Unknown learning content or version");
  const fresh = lesson.transferQuestions.find(
    (item) => !seenQuestionIds.includes(item.question.id),
  );
  // The ledger supplies presentation IDs in order, including repeated IDs.
  // Least-used selection preserves authored order on ties after exhaustion.
  const counts = new Map<string, number>();
  for (const id of seenQuestionIds) counts.set(id, (counts.get(id) ?? 0) + 1);
  const reused = lesson.transferQuestions.reduce<
    QuestionDefinition | undefined
  >(
    (selected, item) =>
      !selected ||
      (counts.get(item.question.id) ?? 0) <
        (counts.get(selected.question.id) ?? 0)
        ? item
        : selected,
    undefined,
  );
  const selected = fresh ?? reused;
  if (!selected) throw new Error("Lesson has no transfer questions");
  return {
    questionId: selected.question.id,
    reason: fresh
      ? "First unseen transfer in the versioned lesson order."
      : "Reused transfer: all variants have been seen; repeat in authored order for practice, separate from fresh-transfer results.",
  };
}
export function gradeLearningPathAnswer(
  contentId: string,
  contentVersion: string,
  questionId: string,
  answer: LearningPathAnswer,
  exerciseSeed?: number,
): LearningPathFeedback {
  const item = findQuestion(
    contentId,
    contentVersion,
    questionId,
    exerciseSeed,
  );
  if (!item) throw new Error("Unknown learning question or content version");
  const parsed = learningPathAnswerSchema.parse(answer);
  const key = item.correctAnswer;
  const correct =
    item.gradingRule.kind === "choice-equality"
      ? parsed.kind === "choice" &&
        key.kind === "choice" &&
        parsed.choiceId === key.choiceId
      : parsed.kind === "percent" &&
        key.kind === "percent" &&
        Math.abs(parsed.value - key.value) <= item.gradingRule.tolerance;
  return {
    correct,
    correctAnswer: structuredClone(key),
    explanation: item.explanation,
    takeaway: item.takeaway,
    skillId: item.question.skillId,
  };
}

/** Stable, answer-free fingerprint for generated scenario facts, independent
 * of the question slot and display order used in a particular session. */
export function getScenarioFingerprint(
  contentId: string,
  contentVersion: string,
  exerciseSeed: number,
  questionId: string,
): string | undefined {
  if (
    contentVersion !== "2" ||
    !Number.isInteger(exerciseSeed) ||
    exerciseSeed < 0 ||
    exerciseSeed > 4294967295
  )
    return undefined;
  const question = getPublicQuestion(
    contentId,
    contentVersion,
    questionId,
    exerciseSeed,
  );
  if (!question) return undefined;
  const canonicalScenario = JSON.stringify({
    generatorVersion: LEARNING_PATH_GENERATOR_VERSION,
    templateVersion: LEARNING_PATH_TEMPLATE_VERSION,
    contentId,
    skillId: question.skillId,
    prompt: question.prompt,
    assumptions: question.assumptions,
    answerKind: question.answerKind,
    choices: question.choices
      ? [...question.choices].sort((a, b) => a.id.localeCompare(b.id))
      : undefined,
    unitLabel: question.unitLabel,
  });
  return createHash("sha256").update(canonicalScenario).digest("hex");
}
