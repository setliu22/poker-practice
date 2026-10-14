import { best, compare, validateCards } from "./index";
import type {
  LearningQuestion,
  LearningFeedback,
} from "../../shared/src/learning";
import { learningAnswerSchema } from "../../shared/src/learning";
import type { z } from "zod";
const assumptions = [
  "Heads-up river: you act first, with no bet to call. Both players have at least the stated bet left.",
  "The opponent has exactly one of the listed combinations, each equally likely. These are given assumptions, not hidden cards revealed by a bot.",
  "If you check, the opponent checks and you go to showdown. If you bet, each hand responds exactly as listed; there are no raises or later bets.",
  "No rake or side pots. Compare average net chips from this decision; earlier contributions are already in the pot.",
];
function spot(
  title: string,
  stage: LearningQuestion["stage"],
  hole: string[],
  board: string[],
  hands: string[][],
  calls: boolean[],
  pot: number,
  bet: number,
  change: string,
): Omit<LearningQuestion, "id" | "index" | "total"> {
  return {
    title,
    stage,
    hole,
    board,
    pot,
    bet,
    change,
    context: "River · Out of position · One opponent",
    assumptions,
    opponents: hands.map((cards, i) => ({
      cards,
      response: calls[i] ? "call" : "fold",
    })),
  };
}
const aces = [
  ["Ah", "Js"],
  ["Ad", "Tc"],
  ["Ah", "Kd"],
];
const kings = [
  ["Kh", "Js"],
  ["Kd", "Tc"],
  ["Ah", "Kd"],
  ["8c", "8h"],
];
const queens = [
  ["Qh", "Js"],
  ["Qd", "Tc"],
  ["Ah", "Qd"],
];
export const learningScenarios = [
  spot(
    "Will weaker aces pay you?",
    "Practice",
    ["As", "Qh"],
    ["Ac", "9d", "6s", "3h", "2c"],
    aces,
    [true, true, true],
    100,
    40,
    "First example: AJ and AT call your bet, as does AK.",
  ),
  spot(
    "Same cards, different calls",
    "Contrast",
    ["As", "Qh"],
    ["Ac", "9d", "6s", "3h", "2c"],
    aces,
    [false, false, true],
    100,
    40,
    "Only the responses changed: AJ and AT now fold. AK still calls.",
  ),
  spot(
    "Three weaker hands call",
    "Practice",
    ["Ks", "Qh"],
    ["Kc", "8d", "5h", "3c", "2s"],
    [...kings.slice(0, 2), ["Kh", "9s"], kings[2]],
    [true, true, true, true],
    120,
    30,
    "KJ, KT and K9 call; AK also calls. Three combinations are weaker than yours.",
  ),
  spot(
    "A bigger bet loses those calls",
    "Contrast",
    ["Ks", "Qh"],
    ["Kc", "8d", "5h", "3c", "2s"],
    [...kings.slice(0, 2), ["Kh", "9s"], kings[2]],
    [false, false, false, true],
    120,
    90,
    "Same range. Your proposed bet is now 90: KJ, KT and K9 fold; AK calls.",
  ),
  spot(
    "Apply the idea to queens",
    "Transfer",
    ["Qs", "Kh"],
    ["Qc", "8d", "5h", "3c", "2s"],
    queens,
    [true, true, true],
    80,
    20,
    "New cards: QJ and QT call, as does AQ.",
  ),
  spot(
    "Change the response, keep the hand",
    "Transfer",
    ["Qs", "Kh"],
    ["Qc", "8d", "5h", "3c", "2s"],
    queens,
    [false, false, true],
    80,
    20,
    "QJ and QT now fold. AQ still calls.",
  ),
  spot(
    "A strong hand can still prefer checking",
    "Transfer",
    ["As", "Ah"],
    ["Kc", "9d", "6s", "3h", "2c"],
    [
      ["Kh", "Qs"],
      ["Kd", "Jc"],
      ["9c", "9h"],
    ],
    [false, false, true],
    90,
    30,
    "KQ and KJ fold to your bet. A set of nines calls.",
  ),
  spot(
    "Would a smaller bet change that?",
    "Transfer",
    ["As", "Ah"],
    ["Kc", "9d", "6s", "3h", "2c"],
    [
      ["Kh", "Qs"],
      ["Kd", "Jc"],
      ["9c", "9h"],
    ],
    [true, true, true],
    90,
    10,
    "The bet is now 10. Under the new response assumptions, KQ and KJ call; the set still calls.",
  ),
];
export function learningQuestion(index: number, id: string): LearningQuestion {
  const scenario = learningScenarios[index];
  if (!scenario) throw new Error("Unknown lesson exercise.");
  return { ...scenario, id, index, total: learningScenarios.length };
}
export function gradeLearning(
  index: number,
  raw: z.infer<typeof learningAnswerSchema>,
): LearningFeedback {
  const answer = learningAnswerSchema.parse(raw),
    q = learningQuestion(index, "grading");
  validateCards([...q.hole, ...q.board], 7, 7);
  const hero = best([...q.hole, ...q.board]);
  const branches = q.opponents.map((o) => {
    validateCards([...q.hole, ...q.board, ...o.cards], 9, 9);
    const result = compare(hero, best([...o.cards, ...q.board]));
    const share = result > 0 ? 1 : result === 0 ? 0.5 : 0;
    return {
      cards: o.cards,
      outcome: result > 0 ? "You win" : result === 0 ? "Tie" : "You lose",
      response: o.response,
      checkNet: share * q.pot,
      betNet:
        o.response === "fold" ? q.pot : share * (q.pot + 2 * q.bet) - q.bet,
    };
  });
  const checkEv =
    branches.reduce((n, b) => n + b.checkNet, 0) / branches.length;
  const betEv = branches.reduce((n, b) => n + b.betNet, 0) / branches.length;
  const bestAction = betEv > checkEv ? "bet" : "check";
  const reason = branches.some(
    (b) => b.outcome === "You win" && b.response === "call",
  )
    ? "weaker-call"
    : "stronger-only";
  const label = (cards: string[]) => cards.map((c) => c[0]).join("");
  const weaker = branches
    .filter((b) => b.outcome === "You win")
    .map((b) => label(b.cards))
    .join(", ");
  const stronger = branches
    .filter((b) => b.outcome === "You lose")
    .map((b) => label(b.cards))
    .join(", ");
  const explanation =
    bestAction === "bet"
      ? `${weaker} call with hands you beat. ${stronger} also call with better hands. Counting all equally likely outcomes, betting averages ${betEv.toFixed(1)} chips versus ${checkEv.toFixed(1)} for checking. The extra calls from weaker hands make betting better here.`
      : `${weaker} fold, so betting gets no extra chips from those weaker hands. ${stronger} call and beat you. Checking already wins the existing pot against the weaker hands. Betting averages ${betEv.toFixed(1)} chips versus ${checkEv.toFixed(1)} for checking.`;
  return {
    actionCorrect: answer.action === bestAction,
    reasonCorrect: answer.reason === reason,
    best: bestAction,
    betEv,
    checkEv,
    branches,
    explanation,
    takeaway:
      bestAction === "bet"
        ? "A value bet earns extra chips from weaker calling hands; compare it with checking, too."
        : "A strong hand can prefer checking when weaker hands fold and stronger hands call.",
  };
}
