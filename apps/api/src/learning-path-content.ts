import {
  learningPathAnswerSchema,
  learningPathQuestionSchema,
  type LearningPathAnswer,
  type LearningPathCatalog,
  type LearningPathFeedback,
  type LearningPathQuestion,
} from "../../../packages/shared/src/learning-path.js";

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

const lessons: LessonDefinition[] = [firstLesson];
const catalog: LearningPathCatalog = {
  pathId: "poker-foundations",
  contentVersion,
  title: "Poker foundations",
  units: [
    {
      id: "table-basics",
      title: "At the table",
      lessons: [
        {
          contentId: firstLesson.contentId,
          title: firstLesson.title,
          skillId: firstLesson.skillId,
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
): LessonDefinition | undefined {
  const lesson = lessons.find(
    (item) =>
      item.contentId === contentId && item.contentVersion === contentVersion,
  );
  return lesson && structuredClone(lesson);
}
function findQuestion(
  contentId: string,
  contentVersion: string,
  questionId: string,
): QuestionDefinition | undefined {
  const lesson = lessons.find(
    (item) =>
      item.contentId === contentId && item.contentVersion === contentVersion,
  );
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
): LearningPathQuestion | undefined {
  const item = findQuestion(contentId, contentVersion, questionId);
  // Parse a dedicated public object; strict validation fails closed if a future
  // author accidentally attaches an answer key or grading metadata to it.
  return item && learningPathQuestionSchema.parse(item.question);
}
export function selectLearningPathTransfer(
  contentId: string,
  contentVersion: string,
  seenQuestionIds: readonly string[],
): { questionId: string; reason: string } {
  const lesson = getLessonDefinition(contentId, contentVersion);
  if (!lesson) throw new Error("Unknown learning content or version");
  const fresh = lesson.transferQuestions.find(
    (item) => !seenQuestionIds.includes(item.question.id),
  );
  const selected = fresh ?? lesson.transferQuestions[0];
  if (!selected) throw new Error("Lesson has no transfer questions");
  return {
    questionId: selected.question.id,
    reason: fresh
      ? "First unseen transfer in the versioned lesson order."
      : "All transfer variants have been seen; repeat the first variant for practice.",
  };
}
export function gradeLearningPathAnswer(
  contentId: string,
  contentVersion: string,
  questionId: string,
  answer: LearningPathAnswer,
): LearningPathFeedback {
  const item = findQuestion(contentId, contentVersion, questionId);
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
