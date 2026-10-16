import { describe, expect, it } from "vitest";
import {
  learningPathAnswerSchema,
  learningPathAnswerCommandSchema,
  learningPathCatalogSchema,
  learningPathEventSchema,
  learningPathQuestionSchema,
  startLearningInstanceSchema,
  learningPathEventAckSchema,
  learningPathInstanceStateSchema,
  learningPathProgressSchema,
} from "../packages/shared/src/learning-path.js";
import {
  getLearningPathCatalog,
  getLessonDefinition,
  getPublicQuestion,
  gradeLearningPathAnswer,
  selectLearningPathTransfer,
} from "../apps/api/src/learning-path-content.js";

const contentId = "table-flow";
const version = "1";
const uuid = "00000000-0000-4000-8000-000000000001";

describe("versioned learning path contract and content", () => {
  it("strictly validates discriminated answers and finite percentages", () => {
    for (const answer of [
      { kind: "choice", choiceId: "check" },
      { kind: "percent", value: 0 },
      { kind: "percent", value: 100 },
    ]) {
      expect(learningPathAnswerSchema.parse(answer)).toEqual(answer);
    }
    for (const answer of [
      { kind: "choice", choiceId: "" },
      { kind: "choice", choiceId: "call", value: 20 },
      { kind: "percent", value: -1 },
      { kind: "percent", value: 101 },
      { kind: "percent", value: Infinity },
      { kind: "percent", value: NaN },
    ]) {
      expect(learningPathAnswerSchema.safeParse(answer).success).toBe(false);
    }
  });

  it("strictly validates commands without allowing client grading data", () => {
    const start = {
      eventId: uuid,
      instanceId: uuid,
      sessionId: uuid,
      contentId,
      contentVersion: version,
    };
    expect(startLearningInstanceSchema.parse(start)).toEqual(start);
    expect(
      startLearningInstanceSchema.safeParse({ ...start, questionOrder: [] })
        .success,
    ).toBe(false);
    expect(
      learningPathEventAckSchema.safeParse({ eventId: uuid, correct: true })
        .success,
    ).toBe(false);
    const command = {
      requestId: uuid,
      contentVersion: version,
      answer: { kind: "choice", choiceId: "check" },
    };
    expect(learningPathAnswerCommandSchema.parse(command)).toEqual(command);
    expect(
      learningPathAnswerCommandSchema.safeParse({ ...command, feedback: {} })
        .success,
    ).toBe(false);
  });

  it("keeps pinned catalog versions resolvable and isolates returned data from mutation", () => {
    const catalog = getLearningPathCatalog();
    expect(learningPathCatalogSchema.parse(catalog)).toEqual(catalog);
    expect(catalog.pathId).toBe("poker-foundations");
    expect(catalog.contentVersion).toBe(version);
    const lesson = getLessonDefinition(contentId, version)!;
    expect(
      catalog.units
        .flatMap((unit) => unit.lessons)
        .some((item) => item.contentId === contentId),
    ).toBe(true);
    expect(lesson.contentVersion).toBe(version);
    expect(getLessonDefinition(contentId, "future")).toBeUndefined();
    expect(getLessonDefinition("missing", version)).toBeUndefined();
    catalog.units[0]!.lessons.length = 0;
    lesson.coreQuestions.length = 0;
    expect(getLearningPathCatalog().units[0]!.lessons).not.toHaveLength(0);
    expect(
      getLessonDefinition(contentId, version)!.coreQuestions.length,
    ).toBeGreaterThanOrEqual(3);
  });

  it("provides 3–5 core decisions and a distinct transfer from at least two variants", () => {
    const lesson = getLessonDefinition(contentId, version)!;
    expect(lesson.coreQuestions.length).toBeGreaterThanOrEqual(3);
    expect(lesson.coreQuestions.length).toBeLessThanOrEqual(5);
    expect(lesson.transferQuestions.length).toBeGreaterThanOrEqual(2);
    const all = [...lesson.coreQuestions, ...lesson.transferQuestions];
    expect(new Set(all.map((item) => item.question.id)).size).toBe(all.length);
    for (const item of lesson.coreQuestions)
      expect(item.question.isTransfer).toBe(false);
    for (const item of lesson.transferQuestions)
      expect(item.question.isTransfer).toBe(true);
    const first = selectLearningPathTransfer(contentId, version, []);
    const second = selectLearningPathTransfer(contentId, version, [
      first.questionId,
    ]);
    expect(second.questionId).not.toBe(first.questionId);
    expect(
      lesson.transferQuestions.some(
        (item) => item.question.id === first.questionId,
      ),
    ).toBe(true);
    expect(selectLearningPathTransfer(contentId, version, [])).toEqual(first);
    const repeated = selectLearningPathTransfer(
      contentId,
      version,
      lesson.transferQuestions.map((item) => item.question.id),
    );
    expect(repeated.reason).toMatch(/repeat|seen/i);
  });

  it("grades every legal-action question deterministically under its pinned version", () => {
    const expected = [
      ["free-check", "check"],
      ["facing-bet", "call"],
      ["minimum-raise", "raise-to-30"],
      ["next-street", "flop"],
      ["transfer-free", "check"],
      ["transfer-facing-bet", "fold-call-raise"],
    ];
    for (const [questionId, choiceId] of expected) {
      const feedback = gradeLearningPathAnswer(
        contentId,
        version,
        questionId!,
        { kind: "choice", choiceId: choiceId! },
      );
      expect(feedback.correct).toBe(true);
      expect(feedback.correctAnswer).toEqual({ kind: "choice", choiceId });
      expect(feedback.explanation.length).toBeGreaterThan(10);
      expect(feedback.takeaway.length).toBeGreaterThan(10);
      expect(
        gradeLearningPathAnswer(contentId, version, questionId!, {
          kind: "choice",
          choiceId: choiceId!,
        }),
      ).toEqual(feedback);
      expect(
        gradeLearningPathAnswer(contentId, version, questionId!, {
          kind: "choice",
          choiceId: "wrong",
        }).correct,
      ).toBe(false);
      expect(
        gradeLearningPathAnswer(contentId, version, questionId!, {
          kind: "percent",
          value: 50,
        }).correct,
      ).toBe(false);
    }
    expect(() =>
      gradeLearningPathAnswer(contentId, "future", "free-check", {
        kind: "choice",
        choiceId: "check",
      }),
    ).toThrow();
    expect(() =>
      gradeLearningPathAnswer(contentId, version, "missing", {
        kind: "choice",
        choiceId: "check",
      }),
    ).toThrow();
    expect(() => selectLearningPathTransfer(contentId, "future", [])).toThrow();
  });

  it("serializes only public fields with no answers or grading data before submission", () => {
    const lesson = getLessonDefinition(contentId, version)!;
    for (const item of [...lesson.coreQuestions, ...lesson.transferQuestions]) {
      const publicQuestion = getPublicQuestion(
        contentId,
        version,
        item.question.id,
      )!;
      expect(learningPathQuestionSchema.parse(publicQuestion)).toEqual(
        publicQuestion,
      );
      const wire = JSON.parse(JSON.stringify(publicQuestion));
      expect(Object.keys(wire).sort()).toEqual(
        [
          "id",
          "title",
          "prompt",
          "skillId",
          "answerKind",
          "choices",
          "assumptions",
          "isTransfer",
        ].sort(),
      );
      for (const choice of wire.choices)
        expect(Object.keys(choice).sort()).toEqual(["id", "label"]);
      expect(wire.assumptions.length).toBeGreaterThan(0);
      expect(
        learningPathQuestionSchema.safeParse({
          ...wire,
          correctAnswer: item.correctAnswer,
        }).success,
      ).toBe(false);
      publicQuestion.choices![0]!.label = "changed";
      expect(
        getPublicQuestion(contentId, version, item.question.id)!.choices![0]!
          .label,
      ).not.toBe("changed");
    }
    expect(
      getPublicQuestion(contentId, "future", "free-check"),
    ).toBeUndefined();
    expect(getPublicQuestion(contentId, version, "missing")).toBeUndefined();
  });

  it("validates each event and rejects unknown envelope and nested payload fields", () => {
    const envelope = {
      cursor: 1,
      eventId: uuid,
      schemaVersion: 1,
      installationId: uuid,
      sessionId: uuid,
      instanceId: uuid,
      contentId,
      contentVersion: version,
      createdAt: "2026-10-16T12:00:00.000Z",
    };
    const feedback = gradeLearningPathAnswer(contentId, version, "free-check", {
      kind: "choice",
      choiceId: "check",
    });
    const cases = [
      {
        kind: "lesson-opened",
        payload: {
          questionOrder: ["free-check"],
          selectionReason: "First lesson",
        },
      },
      { kind: "lesson-resumed", payload: { reason: "reload" } },
      {
        kind: "question-presented",
        payload: { questionId: "free-check", isFreshTransfer: false },
      },
      {
        kind: "answer-submitted",
        payload: {
          questionId: "free-check",
          requestId: uuid,
          answer: { kind: "choice", choiceId: "check" },
        },
      },
      {
        kind: "feedback-generated",
        payload: { questionId: "free-check", requestId: uuid, feedback },
      },
      {
        kind: "feedback-shown",
        payload: { questionId: "free-check", feedbackEventId: uuid },
      },
      { kind: "lesson-completed", payload: {} },
    ];
    for (const event of cases) {
      const wire = { ...envelope, ...event };
      expect(learningPathEventSchema.parse(wire)).toEqual(wire);
      expect(
        learningPathEventSchema.safeParse({ ...wire, secret: true }).success,
      ).toBe(false);
      expect(
        learningPathEventSchema.safeParse({
          ...wire,
          payload: { ...event.payload, secret: true },
        }).success,
      ).toBe(false);
    }
    expect(
      learningPathEventSchema.safeParse({
        ...envelope,
        ...cases[0],
        schemaVersion: 2,
      }).success,
    ).toBe(false);
    expect(
      learningPathEventSchema.safeParse({
        ...envelope,
        ...cases[0],
        cursor: -1,
      }).success,
    ).toBe(false);
  });

  it("strictly validates instance and progress read models including nested skills", () => {
    const state = {
      instanceId: uuid,
      sessionId: uuid,
      contentId,
      contentVersion: version,
      title: "Table flow",
      concept: "Legal actions",
      intro: "Start here",
      selectionReason: "First lesson",
      question: getPublicQuestion(contentId, version, "free-check"),
      questionIndex: 0,
      totalQuestions: 5,
      isFreshTransfer: false,
      feedback: null,
      complete: false,
    };
    expect(learningPathInstanceStateSchema.parse(state)).toEqual(state);
    expect(
      learningPathInstanceStateSchema.safeParse({ ...state, secret: 1 })
        .success,
    ).toBe(false);
    const progress = {
      startedLessons: 1,
      completedLessons: 0,
      resumedLessons: 0,
      answerAttempts: 0,
      transferAttempts: 0,
      transferCorrect: 0,
      activeInstanceId: uuid,
      bySkill: { "legal-actions": { attempts: 0, incorrect: 0 } },
      reviewSuggestion: null,
    };
    expect(learningPathProgressSchema.parse(progress)).toEqual(progress);
    expect(
      learningPathProgressSchema.safeParse({
        ...progress,
        bySkill: { x: { attempts: 0, incorrect: 0, secret: true } },
      }).success,
    ).toBe(false);
    expect(
      learningPathProgressSchema.safeParse({ ...progress, answerAttempts: -1 })
        .success,
    ).toBe(false);
  });
});
