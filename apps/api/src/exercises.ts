import {
  best,
  compare,
  deal,
  equity,
  names,
  potOdds,
  random,
  strongerCategories,
  validateCards,
} from "../../../packages/poker/src/index";
import {
  exerciseSchema,
  type Exercise,
  type Feedback,
  type Mode,
} from "../../../packages/shared/src/index";
import { scenarios } from "./scenarios";
export type Specification = {
  exercise: Exercise;
  seed: number;
  scenarioIndex?: number;
};
const fixtures = [
  {
    hero: ["As", "2d"],
    villain: ["2h", "6d"],
    board: ["3c", "4h", "5s", "Kc", "Qd"],
    tags: ["Straight"],
    id: "wheel",
  },
  {
    hero: ["Ks", "Qd"],
    villain: ["Qs", "Jh"],
    board: ["As", "9s", "7s", "3s", "2d"],
    tags: ["Flush", "Kicker"],
    id: "flush-kicker",
  },
  {
    hero: ["Kh", "3d"],
    villain: ["Qd", "4s"],
    board: ["Ac", "Ad", "9s", "9h", "2c"],
    tags: ["Kicker"],
    id: "two-pair-kicker",
  },
  {
    hero: ["As", "Kh"],
    villain: ["9s", "Kd"],
    board: ["Ac", "9d", "Kc", "2s", "3c"],
    tags: ["Kicker"],
    id: "two-pair-higher-pair",
  },
  {
    hero: ["As", "9d"],
    villain: ["Ah", "2d"],
    board: ["Ac", "Kd", "9h", "2s", "3c"],
    tags: ["Kicker"],
    id: "two-pair-lower-pair",
  },
  {
    hero: ["Ah", "Kh"],
    villain: ["As", "Qh"],
    board: ["Ac", "Ad", "Kc", "Qd", "2s"],
    tags: ["Full house", "Kicker"],
    id: "full-house-pair",
  },
  {
    hero: ["Ah", "3d"],
    villain: ["9d", "4s"],
    board: ["Ac", "Ad", "9s", "9h", "2c"],
    tags: ["Full house"],
    id: "full-house",
  },
  {
    hero: ["2c", "3d"],
    villain: ["4c", "5d"],
    board: ["As", "Ks", "Qs", "Js", "Ts"],
    tags: ["Split pot"],
    id: "board-only",
  },
  {
    hero: ["Th", "3d"],
    villain: ["Tc", "4d"],
    board: ["Ac", "Kd", "Qh", "Js", "2c"],
    tags: ["Straight", "Split pot"],
    id: "equal-hands",
  },
];
export function generate(
  mode: Mode,
  seed: number,
  id: string,
  street: "turn" | "river" = "river",
  targetTag?: string,
): Specification {
  if (mode === "equity" && targetTag === "Flush") street = "turn";
  const rng = random(seed);
  let exercise: Exercise = { id, mode, sourceId: "", question: "", tags: [] };
  let scenarioIndex: number | undefined;
  if (mode === "decision") {
    const pool = scenarios
      .map((s, i) => ({ s, i }))
      .filter(({ s }) => !targetTag || s.exercise.tags.includes(targetTag));
    const chosen = (pool.length ? pool : scenarios.map((s, i) => ({ s, i })))[
      Math.floor(rng() * (pool.length || scenarios.length))
    ];
    scenarioIndex = chosen.i;
    exercise = { ...exercise, ...chosen.s.exercise };
  } else if (mode === "who-wins") {
    const pool = fixtures.filter(
      (f) => !targetTag || f.tags.includes(targetTag),
    );
    const f = (pool.length ? pool : fixtures)[
      Math.floor(rng() * (pool.length || fixtures.length))
    ];
    if ((!targetTag && rng() < 0.3) || targetTag === "Range comparison") {
      const cards = deal(seed, 9);
      exercise = {
        ...exercise,
        sourceId: `deal-${seed}`,
        hero: cards.slice(0, 2),
        villain: cards.slice(2, 4),
        board: cards.slice(4),
        tags: ["Range comparison"],
      };
    } else exercise = { ...exercise, ...f, id, sourceId: f.id };
    exercise.question = "Who wins at showdown?";
    exercise.options = ["Player 1 wins", "Player 2 wins", "Tie"];
  } else if (mode === "what-beats-me") {
    const board = ["Ac", "9c", "7c", "4d", "2s"];
    exercise = {
      ...exercise,
      sourceId: "river-comparison",
      question: "How does each opponent hand compare with yours?",
      hero: ["As", "Qd"],
      board,
      range: [
        ["Ah", "Jd"],
        ["Kc", "Qc"],
        ["9h", "9d"],
        ["Ad", "Qs"],
      ],
      tags: ["Range comparison", "Flush", "Kicker"],
    };
    // Alternate legal original board/hand sets.
    if (
      targetTag === "Full house" ||
      targetTag === "Split pot" ||
      (targetTag !== "Flush" && rng() < 0.5)
    )
      exercise = {
        ...exercise,
        sourceId: "two-pair-comparison",
        hero: ["Kh", "3d"],
        board: ["Ac", "Ad", "9s", "9h", "2c"],
        range: [
          ["Qd", "4s"],
          ["Ks", "5d"],
          ["Ah", "6s"],
          ["9d", "7c"],
        ],
        tags: ["Kicker", "Full house", "Split pot", "Range comparison"],
      };
  } else if (mode === "pot-odds") {
    const pot = [40, 60, 80, 100, 120, 150, 200][Math.floor(rng() * 7)],
      bet = [10, 20, 30, 40, 50, 75, 100][Math.floor(rng() * 7)];
    exercise = {
      ...exercise,
      sourceId: `odds-${pot}-${bet}`,
      question: "What equity do you need to call?",
      pot,
      bet,
      call: bet,
      tags: ["Pot odds"],
      context: [
        "Heads-up river call. No future bets, side pots, unequal all-ins, or rake.",
      ],
    };
  } else {
    exercise = {
      ...exercise,
      sourceId: `range-${street}`,
      question: "Estimate your equity against this exact range.",
      hero: ["Ah", "Jh"],
      board:
        street === "turn"
          ? ["Kh", "8h", "4c", "2d"]
          : ["Kh", "8h", "4c", "2d", "Js"],
      range: [
        ["Ks", "Kc"],
        ["Qc", "Qd"],
        ["Ac", "9s"],
        ["Jd", "Tc"],
      ],
      tags: ["Range comparison", ...(street === "turn" ? ["Flush"] : [])],
      context: [
        `${street === "turn" ? "Turn: every legal river is enumerated separately for each opponent hand." : "River: there are no cards to come."} Each listed combination has equal weight. Equity includes half of ties.`,
      ],
    };
    if (street === "river" && rng() < 0.5)
      exercise = {
        ...exercise,
        sourceId: "river-split-range",
        hero: ["As", "Qd"],
        board: ["Ac", "9h", "7s", "4c", "2d"],
        range: [
          ["Ah", "Jd"],
          ["Ad", "Qs"],
          ["9s", "9d"],
          ["Ks", "Kh"],
        ],
      };
  }
  exerciseSchema.parse(exercise);
  if (exercise.hero && exercise.board)
    validateCards(
      [...exercise.hero, ...exercise.board, ...(exercise.villain ?? [])],
      6,
      9,
    );
  if (mode === "equity")
    equity(exercise.hero!, exercise.board!, exercise.range!);
  return { exercise, seed, scenarioIndex };
}
const rankName = (v: number) =>
  ({
    14: "ace",
    13: "king",
    12: "queen",
    11: "jack",
    10: "ten",
    9: "nine",
    8: "eight",
    7: "seven",
    6: "six",
    5: "five",
    4: "four",
    3: "three",
    2: "two",
  })[v] ?? String(v);
function difference(a: ReturnType<typeof best>, b: ReturnType<typeof best>) {
  if (a.category !== b.category)
    return `${a.name} ranks above ${b.name.toLowerCase()}.`;
  const i = a.kickers.findIndex((v, i) => v !== b.kickers[i]);
  if (i < 0)
    return "Both players have the same five-card rank and all the same relevant kickers. Suits never break a tie.";
  const role =
    a.category === 2
      ? i === 0
        ? "higher pair"
        : i === 1
          ? "lower pair"
          : "kicker"
      : a.category === 6
        ? i === 0
          ? "three-of-a-kind rank"
          : "pair rank"
        : a.category === 4 || a.category === 8
          ? "straight high card"
          : a.category === 5 || a.category === 0
            ? "first differing high card"
            : i === 0
              ? "made-hand rank"
              : "kicker";
  return `Both have ${a.name.toLowerCase()}. The ${role} decides it: ${rankName(a.kickers[i])} beats ${rankName(b.kickers[i])}.`;
}
export function grade(spec: Specification, answer: unknown): Feedback {
  const e = spec.exercise;
  if (e.mode === "decision") {
    if (typeof answer !== "string" || !e.options!.includes(answer))
      throw new Error("Choose an available action.");
    const s = scenarios[spec.scenarioIndex!];
    return {
      ...s.feedback,
      correct: s.accepted.includes(answer),
      result: `${s.accepted.includes(answer) ? "Supported choice" : "Revisit this choice"} · ${s.feedback.kind === "exact" ? "Calculated result" : "Illustrative strategy"}`,
    };
  }
  if (e.mode === "pot-odds" || e.mode === "equity") {
    if (
      typeof answer !== "number" ||
      !Number.isFinite(answer) ||
      answer < 0 ||
      answer > 100
    )
      throw new Error("Enter a percentage from 0 to 100.");
    if (e.mode === "pot-odds") {
      const required = potOdds(e.pot!, e.bet!, e.call!),
        error = Math.abs(answer - required);
      return {
        kind: "exact",
        correct: error <= 0.5,
        equity: required,
        estimate: answer,
        error,
        result:
          error <= 0.5
            ? "Correct, within rounding tolerance"
            : "Review the call threshold",
        explanation: `The final pot includes the original pot, opponent’s bet, and your call. You need ${required.toFixed(2)}% equity for a break-even call.`,
        calculation: `$${e.call} ÷ ($${e.pot} + $${e.bet} + $${e.call}) × 100 = ${required.toFixed(2)}%`,
        takeaway:
          "This threshold directly supports an all-in or river call. Future betting on earlier streets can change the decision.",
      };
    }
    const result = equity(e.hero!, e.board!, e.range!),
      error = Math.abs(answer - result.equity);
    const comparisons = result.rows
      .map((r) => {
        if (e.board!.length === 4)
          return `Against ${r.combo.join(" ")}, you win ${r.wins}, tie ${r.ties}, and lose ${r.total - r.wins - r.ties} of ${r.total} legal rivers.`;
        const mine = best([...e.hero!, ...e.board!]),
          theirs = best([...r.combo, ...e.board!]),
          cmp = compare(mine, theirs);
        return `Against ${r.combo.join(" ")}, your ${mine.name.toLowerCase()} ${cmp > 0 ? "beats" : cmp < 0 ? "loses to" : "ties"} their ${theirs.name.toLowerCase()}.`;
      })
      .join("\n");
    return {
      kind: "estimate",
      equity: result.equity,
      estimate: answer,
      error,
      rangeResults: result.rows,
      result:
        error <= 2
          ? "Very close estimate"
          : error <= 5
            ? "Close estimate"
            : error <= 12
              ? "A useful estimate to refine"
              : "Let’s compare the range",
      explanation: `Exact equity is ${result.equity.toFixed(2)}%. Your estimate differs by ${error.toFixed(2)} percentage points. Each legal opponent combination has equal weight; ties count as half a win.\n${comparisons}`,
      takeaway:
        "Equity describes this supplied range, not an unspecified opponent or a betting recommendation.",
    };
  }
  const mine = best([...e.hero!, ...e.board!]);
  if (e.mode === "who-wins") {
    if (typeof answer !== "string" || !e.options!.includes(answer))
      throw new Error("Choose Player 1, Player 2, or Tie.");
    const theirs = best([...e.villain!, ...e.board!]),
      comparison = compare(mine, theirs),
      expected =
        comparison > 0
          ? "Player 1 wins"
          : comparison < 0
            ? "Player 2 wins"
            : "Tie";
    const boardHand = best(e.board!);
    const boardPlays =
      compare(mine, boardHand) === 0 && compare(theirs, boardHand) === 0;
    return {
      kind: "exact",
      correct: answer === expected,
      result: expected,
      explanation:
        comparison === 0
          ? boardPlays
            ? "The board plays for both players: both use its best five-card hand. The pot is split equally."
            : difference(mine, theirs) + " The pot is split equally."
          : difference(
              comparison > 0 ? mine : theirs,
              comparison > 0 ? theirs : mine,
            ),
      hands: [
        { label: "Player 1", ...mine },
        { label: "Player 2", ...theirs },
      ],
      takeaway:
        "Compare the best five cards. Unused hole cards do not break ties.",
    };
  }
  if (
    !Array.isArray(answer) ||
    answer.length !== e.range!.length ||
    answer.some((a) => !["beats", "ties", "loses"].includes(a))
  )
    throw new Error("Classify every opponent combination.");
  const rows = e.range!.map((combo) => {
    const theirs = best([...combo, ...e.board!]);
    const cmp = compare(theirs, mine);
    return {
      combo,
      hand: theirs,
      expected: cmp > 0 ? "beats" : cmp < 0 ? "loses" : "ties",
    };
  });
  return {
    kind: "exact",
    correct: rows.every((r, i) => r.expected === answer[i]),
    result: `${rows.filter((r, i) => r.expected === answer[i]).length} of ${rows.length} classifications correct`,
    explanation: rows
      .map(
        (r) =>
          `${r.combo.join(" ")}: ${r.hand.name.toLowerCase()}, ${r.expected === "ties" ? "ties with" : r.expected === "beats" ? "beats" : "loses to"} your ${mine.name.toLowerCase()}. ${r.expected === "ties" ? difference(mine, r.hand) : difference(r.expected === "beats" ? r.hand : mine, r.expected === "beats" ? mine : r.hand)}`,
      )
      .join("\n"),
    hands: [
      { label: "Your best hand", ...mine },
      ...rows.map((r) => ({ label: r.combo.join(" "), ...r.hand })),
    ],
    stronger: strongerCategories(e.hero!, e.board!),
    takeaway:
      "Possible does not mean likely. Legal card combinations alone do not describe an opponent’s range after betting.",
  };
}
