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
  getScenarioFingerprint,
  getPublicQuestion,
  gradeLearningPathAnswer,
  selectLearningPathTransfer,
} from "../apps/api/src/learning-path-content.js";
import {
  LEARNING_PATH_GENERATOR_VERSION,
  LEARNING_PATH_TEMPLATE_VERSION,
  generateVersion2Lesson,
} from "../apps/api/src/learning-path-generated.js";
import { equity, legalRange, potOdds } from "../packages/poker/src/index.js";
import { openingCharts } from "../packages/poker/src/preflop-charts.js";

const contentId = "table-flow";
const version = "1";
const currentVersion = "2";
const uuid = "00000000-0000-4000-8000-000000000001";
const strategyLessonIds = [
  "strategy-preflop",
  "strategy-equity",
  "strategy-postflop",
  "strategy-ranges",
  "strategy-betting",
] as const;
const legacyLessonIds = [
  "table-flow",
  "hand-rankings",
  "position-opening",
  "pot-odds-equity",
  "postflop-reasoning",
] as const;

function scenarioCards(prompt: string, label: string): string[] {
  const value = prompt.match(new RegExp(`${label}: ([^.]+)\\.`))?.[1];
  return value?.match(/[2-9TJQKA][cdhs]/g) ?? [];
}

describe("versioned learning path contract and content", () => {
  it("preserves version 1 lesson definitions with complete private pools and reviewable skills", () => {
    const skills = new Set<string>();
    for (const contentId of legacyLessonIds) {
      const lesson = getLessonDefinition(contentId, version)!;
      expect(lesson).toBeDefined();
      // The review projection maps question skills to the first catalog lesson.
      expect(skills.has(lesson.skillId)).toBe(false);
      skills.add(lesson.skillId);
      expect(lesson.coreQuestions.length).toBeGreaterThanOrEqual(3);
      expect(lesson.coreQuestions.length).toBeLessThanOrEqual(5);
      expect(lesson.transferQuestions.length).toBeGreaterThanOrEqual(2);
      const all = [...lesson.coreQuestions, ...lesson.transferQuestions];
      expect(new Set(all.map((item) => item.question.id)).size).toBe(
        all.length,
      );
      for (const item of all) {
        const question = getPublicQuestion(
          contentId,
          version,
          item.question.id,
        )!;
        expect(question.skillId).toBe(lesson.skillId);
        expect(question.assumptions.length).toBeGreaterThan(0);
        expect(JSON.stringify(question)).not.toMatch(
          /correctAnswer|gradingRule|explanation|takeaway/,
        );
        expect(learningPathQuestionSchema.parse(question)).toEqual(question);
        expect(question.isTransfer).toBe(
          lesson.transferQuestions.includes(item),
        );
      }
    }
  });

  it("grades independently checked hand, position, price, range and postflop examples", () => {
    // Literal answers are hand-derived: AA+77 is two pair; a flush beats a
    // straight; the board royal flush plays for everyone. Price is 25/(50+25+25).
    // The river range has one winning and one losing combo, equally weighted.
    const choices = [
      ["hand-rankings", "two-pair", "two-pair"],
      ["hand-rankings", "flush-straight", "flush"],
      ["hand-rankings", "board-tie", "tie"],
      ["hand-rankings", "transfer-full-house", "full-house"],
      ["hand-rankings", "transfer-kicker", "ace-kicker"],
      ["position-opening", "button-position", "last"],
      ["position-opening", "baseline-aces", "raise"],
      ["position-opening", "baseline-seven-two", "fold"],
      ["position-opening", "chart-limits", "baseline"],
      ["position-opening", "transfer-kings", "raise"],
      ["position-opening", "transfer-facing-raise", "outside"],
      ["pot-odds-equity", "conditional-call", "call"],
      ["postflop-reasoning", "flush-draw", "draw"],
      ["postflop-reasoning", "flush-outs", "nine"],
      ["postflop-reasoning", "future-betting", "not-enough"],
      ["postflop-reasoning", "transfer-board-pair", "not-guaranteed"],
    ];
    for (const [lesson, question, choiceId] of choices) {
      expect(
        gradeLearningPathAnswer(lesson!, version, question!, {
          kind: "choice",
          choiceId: choiceId!,
        }).correct,
      ).toBe(true);
      expect(
        gradeLearningPathAnswer(lesson!, version, question!, {
          kind: "choice",
          choiceId: "wrong",
        }).correct,
      ).toBe(false);
    }
    const percents = [
      ["pot-odds-equity", "call-price", 25],
      ["pot-odds-equity", "river-range", 50],
      ["pot-odds-equity", "transfer-price", 100 / 3],
      ["pot-odds-equity", "transfer-tie", 50],
      ["postflop-reasoning", "next-card", 900 / 47],
      ["postflop-reasoning", "transfer-straight", 800 / 47],
    ] as const;
    for (const [lesson, question, value] of percents) {
      expect(
        gradeLearningPathAnswer(lesson, version, question, {
          kind: "percent",
          value,
        }).correct,
      ).toBe(true);
      expect(
        gradeLearningPathAnswer(lesson, version, question, {
          kind: "percent",
          value: value + 1,
        }).correct,
      ).toBe(false);
      expect(
        gradeLearningPathAnswer(lesson, version, question, {
          kind: "choice",
          choiceId: "call",
        }).correct,
      ).toBe(false);
    }
  });

  it("uses unseen transfers before cycling exhausted pools in authored order", () => {
    for (const contentId of legacyLessonIds) {
      const pool = getLessonDefinition(
        contentId,
        version,
      )!.transferQuestions.map((item) => item.question.id);
      const seen: string[] = [];
      for (let cycle = 0; cycle < 3; cycle++) {
        for (const id of pool) {
          const selected = selectLearningPathTransfer(contentId, version, seen);
          expect(selected.questionId).toBe(id);
          expect(selected.reason).toMatch(cycle === 0 ? /unseen/i : /reused/i);
          seen.push(id);
        }
      }
    }
  });

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
    const generatedStart = {
      ...start,
      contentId: "strategy-preflop",
      contentVersion: currentVersion,
      entryPoint: "daily-recommendation",
    };
    for (const entryPoint of [
      "daily-recommendation",
      "path-selection",
      "review",
      "repeat",
    ] as const) {
      const command = { ...generatedStart, entryPoint };
      expect(startLearningInstanceSchema.parse(command)).toEqual(command);
    }
    expect(
      startLearningInstanceSchema.safeParse({
        ...generatedStart,
        entryPoint: undefined,
      }).success,
    ).toBe(false);
    expect(
      startLearningInstanceSchema.safeParse({
        ...generatedStart,
        entryPoint: "unknown",
      }).success,
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
    expect(catalog.contentVersion).toBe(currentVersion);
    const generatedId = catalog.units[0]!.lessons[0]!.contentId;
    const lesson = getLessonDefinition(generatedId, currentVersion, 17)!;
    expect(
      catalog.units
        .flatMap((unit) => unit.lessons)
        .some((item) => item.contentId === generatedId),
    ).toBe(true);
    expect(lesson.contentVersion).toBe(currentVersion);
    expect(getLessonDefinition(contentId, "future")).toBeUndefined();
    expect(getLessonDefinition("missing", version)).toBeUndefined();
    catalog.units[0]!.lessons.length = 0;
    lesson.coreQuestions.length = 0;
    expect(getLearningPathCatalog().units[0]!.lessons).not.toHaveLength(0);
    expect(
      getLessonDefinition(generatedId, currentVersion, 17)!.coreQuestions
        .length,
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
    // Matching the big blind alone leaves its option open; the scenario must
    // establish the final check before the stored "flop" answer is justified.
    const nextStreet = getPublicQuestion(contentId, version, "next-street")!;
    expect(nextStreet.prompt).toMatch(/big blind checks/i);
    expect(nextStreet.prompt).toMatch(/betting round is complete/i);
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
    const v2Envelope = {
      ...envelope,
      schemaVersion: 2,
      contentId: "strategy-preflop",
      contentVersion: currentVersion,
    };
    const v2Opened = {
      ...v2Envelope,
      kind: "lesson-opened" as const,
      payload: {
        questionOrder: ["open-baseline-1"],
        selectionReason: "Daily recommendation",
        entryPoint: "daily-recommendation" as const,
        exerciseSeed: 4294967295,
        generatorVersion: LEARNING_PATH_GENERATOR_VERSION,
      },
    };
    expect(learningPathEventSchema.parse(v2Opened)).toEqual(v2Opened);
    expect(
      learningPathEventSchema.safeParse({
        ...v2Opened,
        contentVersion: "future-content-version",
      }).success,
    ).toBe(true);
    expect(
      learningPathEventSchema.safeParse({
        ...v2Opened,
        payload: { ...v2Opened.payload, exerciseSeed: 4294967296 },
      }).success,
    ).toBe(false);
    expect(
      learningPathEventSchema.safeParse({
        ...v2Opened,
        payload: { ...v2Opened.payload, exerciseSeed: undefined },
      }).success,
    ).toBe(false);
    expect(
      learningPathEventSchema.safeParse({
        ...v2Opened,
        payload: { ...v2Opened.payload, secret: true },
      }).success,
    ).toBe(false);
    const v2Presented = {
      ...v2Envelope,
      kind: "question-presented" as const,
      payload: {
        questionId: "open-transfer-1",
        isFreshTransfer: true,
        isTransfer: true,
        scenarioFingerprint: "a".repeat(64),
        templateVersion: LEARNING_PATH_TEMPLATE_VERSION,
      },
    };
    expect(learningPathEventSchema.parse(v2Presented)).toEqual(v2Presented);
    expect(
      learningPathEventSchema.safeParse({
        ...v2Presented,
        payload: { ...v2Presented.payload, scenarioFingerprint: "bad" },
      }).success,
    ).toBe(false);
    expect(
      learningPathEventSchema.safeParse({
        ...v2Presented,
        payload: { ...v2Presented.payload, templateVersion: undefined },
      }).success,
    ).toBe(false);
    expect(
      learningPathEventSchema.safeParse({
        ...envelope,
        ...cases[0],
        payload: {
          questionOrder: ["free-check"],
          selectionReason: "old",
          exerciseSeed: 1,
          generatorVersion: "2.0.0",
        },
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
      completedToday: false,
      currentStreakDays: 0,
      recentPracticeDays: Array.from({ length: 7 }, (_, index) => ({
        date: `2026-10-${String(index + 10).padStart(2, "0")}`,
        completed: false,
        today: index === 6,
      })),
      completedContentIds: [],
      nextLessonContentId: "table-flow",
      resumedLessons: 0,
      answerAttempts: 0,
      transferAttempts: 0,
      transferCorrect: 0,
      activeInstanceId: uuid,
      bySkill: { "legal-actions": { attempts: 0, incorrect: 0 } },
      reviewSuggestion: null,
    };
    expect(learningPathProgressSchema.parse(progress)).toEqual(progress);
    for (const fields of [
      { completedToday: "yes" },
      { currentStreakDays: -1 },
      { currentStreakDays: 1.5 },
      { currentStreakDays: "1" },
      { recentPracticeDays: progress.recentPracticeDays.slice(1) },
      {
        recentPracticeDays: progress.recentPracticeDays.map((day, index) => ({
          ...day,
          today: index === 0,
        })),
      },
      {
        recentPracticeDays: progress.recentPracticeDays.map((day, index) =>
          index === 3 ? { ...day, date: "2026-02-30" } : day,
        ),
      },
      {
        recentPracticeDays: progress.recentPracticeDays.map((day, index) =>
          index === 2 ? { ...day, date: "2026-10-11" } : day,
        ),
      },
      { completedContentIds: [""] },
      { completedContentIds: "table-flow" },
      { nextLessonContentId: "" },
      { nextLessonContentId: { contentId: "table-flow" } },
    ])
      expect(
        learningPathProgressSchema.safeParse({ ...progress, ...fields })
          .success,
      ).toBe(false);
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

  it("generates version 2 lessons deterministically from a seed", () => {
    const catalog = getLearningPathCatalog();
    expect(catalog.contentVersion).toBe(currentVersion);
    expect(
      catalog.units.flatMap((unit) =>
        unit.lessons.map((lesson) => lesson.contentId),
      ),
    ).toEqual(strategyLessonIds);
    expect(LEARNING_PATH_GENERATOR_VERSION).toBe("2.0.0");
    expect(LEARNING_PATH_TEMPLATE_VERSION).toBe("1");

    for (const contentId of strategyLessonIds) {
      const first = generateVersion2Lesson(contentId, 0xdecafbad);
      expect(first).toBeDefined();
      expect(generateVersion2Lesson(contentId, 0xdecafbad)).toEqual(first);
      expect(first!.contentVersion).toBe(currentVersion);
      expect(first!.coreQuestions.length).toBeGreaterThanOrEqual(3);
      expect(first!.coreQuestions.length).toBeLessThanOrEqual(5);
      expect(first!.transferQuestions.length).toBeGreaterThanOrEqual(2);
      const questions = [...first!.coreQuestions, ...first!.transferQuestions];
      expect(new Set(questions.map((item) => item.question.id)).size).toBe(
        questions.length,
      );
      for (const item of first!.coreQuestions)
        expect(item.question.isTransfer).toBe(false);
      for (const item of first!.transferQuestions)
        expect(item.question.isTransfer).toBe(true);
      for (const item of questions) {
        expect(item.question.skillId).toBe(first!.skillId);
        expect(item.question.assumptions.length).toBeGreaterThan(0);
        expect(learningPathQuestionSchema.parse(item.question)).toEqual(
          item.question,
        );
        if (item.question.answerKind === "choice") {
          const ids = item.question.choices!.map((choice) => choice.id);
          expect(new Set(ids).size).toBe(ids.length);
          expect(
            new Set(item.question.choices!.map((choice) => choice.label)).size,
          ).toBe(ids.length);
          expect(
            ids.filter(
              (id) =>
                id === (item.correctAnswer as { choiceId: string }).choiceId,
            ),
          ).toHaveLength(1);
        }
      }
      const firstTransfer = selectLearningPathTransfer(
        contentId,
        currentVersion,
        [],
        0xdecafbad,
      );
      const nextTransfer = selectLearningPathTransfer(
        contentId,
        currentVersion,
        [firstTransfer.questionId],
        0xdecafbad,
      );
      expect(nextTransfer.questionId).not.toBe(firstTransfer.questionId);
      expect(
        first!.transferQuestions.some(
          (item) => item.question.id === firstTransfer.questionId,
        ),
      ).toBe(true);
    }
  });

  it("varies scenarios across the fixed seed set", () => {
    for (const contentId of strategyLessonIds) {
      const prompts = new Set<string>();
      const questionId =
        contentId === "strategy-equity" ? "range-equity-1" : undefined;
      for (let seed = 0; seed < 256; seed++) {
        const lesson = generateVersion2Lesson(contentId, seed)!;
        prompts.add(
          (questionId
            ? [...lesson.coreQuestions, ...lesson.transferQuestions].find(
                (item) => item.question.id === questionId,
              )
            : lesson.coreQuestions[0])!.question.prompt,
        );
      }
      expect(
        prompts.size,
        `${contentId} varied prompts`,
      ).toBeGreaterThanOrEqual(128);
    }
  }, 120_000);

  it("rejects invalid generated seeds and impossible scenarios", () => {
    for (const invalid of [
      -1,
      1.5,
      2 ** 32,
      Number.NaN,
      Number.POSITIVE_INFINITY,
    ]) {
      expect(() =>
        generateVersion2Lesson(strategyLessonIds[0], invalid),
      ).toThrow();
      expect(
        getScenarioFingerprint(
          strategyLessonIds[0],
          currentVersion,
          invalid,
          "open-baseline-1",
        ),
      ).toBeUndefined();
    }
    expect(generateVersion2Lesson("unknown-strategy", 1)).toBeUndefined();
    expect(
      getLessonDefinition(strategyLessonIds[0], currentVersion),
    ).toBeUndefined();

    for (const contentId of strategyLessonIds) {
      for (let seed = 0; seed < 256; seed++) {
        const lesson = generateVersion2Lesson(contentId, seed)!;
        for (const item of [
          ...lesson.coreQuestions,
          ...lesson.transferQuestions,
        ]) {
          const prompt = item.question.prompt;
          const hero = scenarioCards(prompt, "Hero");
          const board = scenarioCards(prompt, "Board");
          if (hero.length || board.length) {
            expect(hero).toHaveLength(2);
            expect(board.length).toBeGreaterThanOrEqual(3);
            expect(new Set([...hero, ...board]).size).toBe(
              hero.length + board.length,
            );
          }
          expect(item.question.prompt.length).toBeGreaterThan(30);
          expect(
            item.question.assumptions.some((assumption) =>
              /assum|range|chart|equally|river|pot|call|frequency|unknown/i.test(
                assumption,
              ),
            ),
          ).toBe(true);
        }
      }
    }
  }, 120_000);

  it("grades every generated question under its displayed assumptions", () => {
    for (const contentId of strategyLessonIds) {
      for (let seed = 0; seed < 256; seed++) {
        const lesson = generateVersion2Lesson(contentId, seed)!;
        for (const item of [
          ...lesson.coreQuestions,
          ...lesson.transferQuestions,
        ]) {
          const feedback = gradeLearningPathAnswer(
            contentId,
            currentVersion,
            item.question.id,
            item.correctAnswer,
            seed,
          );
          expect(
            feedback.correct,
            `${contentId}/${seed}/${item.question.id}`,
          ).toBe(true);
          expect(feedback.skillId).toBe(lesson.skillId);
          expect(feedback.explanation.length).toBeGreaterThan(10);
          expect(feedback.takeaway.length).toBeGreaterThan(10);
          const wrong =
            item.correctAnswer.kind === "choice"
              ? { kind: "choice" as const, choiceId: "not-the-answer" }
              : {
                  kind: "percent" as const,
                  value:
                    item.correctAnswer.value > 99
                      ? item.correctAnswer.value - 1
                      : item.correctAnswer.value + 1,
                };
          expect(
            gradeLearningPathAnswer(
              contentId,
              currentVersion,
              item.question.id,
              wrong,
              seed,
            ).correct,
          ).toBe(false);
          if (item.correctAnswer.kind === "percent") {
            expect(
              Math.abs(
                (feedback.correctAnswer as { value: number }).value -
                  item.correctAnswer.value,
              ),
            ).toBeLessThan(0.1);
          }
        }
      }
    }
  }, 120_000);

  it("keeps generated answers and seeds private", () => {
    const seed = 424242;
    for (const contentId of strategyLessonIds) {
      const lesson = generateVersion2Lesson(contentId, seed)!;
      for (const item of [
        ...lesson.coreQuestions,
        ...lesson.transferQuestions,
      ]) {
        const publicQuestion = getPublicQuestion(
          contentId,
          currentVersion,
          item.question.id,
          seed,
        )!;
        expect(learningPathQuestionSchema.parse(publicQuestion)).toEqual(
          publicQuestion,
        );
        const json = JSON.stringify(publicQuestion);
        expect(json).not.toMatch(
          /correctAnswer|gradingRule|explanation|takeaway|exerciseSeed|generatorVersion/,
        );
        const allowedPublicKeys = [
          "id",
          "title",
          "prompt",
          "skillId",
          "answerKind",
          "assumptions",
          "isTransfer",
          ...(publicQuestion.choices === undefined ? [] : ["choices"]),
          ...(publicQuestion.unitLabel === undefined ? [] : ["unitLabel"]),
        ];
        expect(Object.keys(publicQuestion).sort()).toEqual(
          allowedPublicKeys.sort(),
        );
        const fingerprint = getScenarioFingerprint(
          contentId,
          currentVersion,
          seed,
          item.question.id,
        );
        expect(fingerprint).toMatch(/^[a-f0-9]{64}$/);
        expect(
          getScenarioFingerprint(
            contentId,
            currentVersion,
            seed,
            item.question.id,
          ),
        ).toBe(fingerprint);
      }
    }
    expect(
      getScenarioFingerprint(strategyLessonIds[0], version, seed, "free-check"),
    ).toBeUndefined();
  });

  it("fingerprints identical generated scenarios across different question slots", () => {
    // Both seeds produce the same six-player Button K9o baseline transfer.
    // The generated slot IDs differ because each session orders variants
    // independently, but a repeated scenario must not count as new practice.
    const first = getScenarioFingerprint(
        "strategy-preflop",
        currentVersion,
        25,
        "open-transfer-1",
      ),
      second = getScenarioFingerprint(
        "strategy-preflop",
        currentVersion,
        75,
        "open-transfer-2",
      );
    expect(first).toMatch(/^[a-f0-9]{64}$/);
    expect(second).toBe(first);
  });

  it("continues to resolve content version 1", () => {
    for (const contentId of legacyLessonIds) {
      const first = getLessonDefinition(contentId, version);
      expect(first).toBeDefined();
      expect(first!.contentVersion).toBe(version);
      expect(getLessonDefinition(contentId, version)).toEqual(first);
    }
    expect(
      getPublicQuestion("table-flow", version, "free-check")!.prompt,
    ).toMatch(/everyone before you checks/i);
    expect(
      gradeLearningPathAnswer("table-flow", version, "free-check", {
        kind: "choice",
        choiceId: "check",
      }).correct,
    ).toBe(true);
    expect(
      getLearningPathCatalog().units.some((unit) =>
        unit.lessons.some((lesson) =>
          legacyLessonIds.includes(
            lesson.contentId as (typeof legacyLessonIds)[number],
          ),
        ),
      ),
    ).toBe(false);
  });

  it("independently checks generated charts, prices, range equity, outs, blockers and bet EV", () => {
    const cardList = (prompt: string, label: string) => {
      const value = prompt.match(new RegExp(`${label}: ([^.]+)\\.`))?.[1] ?? "";
      return value.match(/[2-9TJQKA][cdhs]/g) ?? [];
    };
    const combos = (prompt: string) => {
      const value =
        prompt.match(
          /Range(?: combos)?(?: \(equal weight\))?: ([^.]+)\./i,
        )?.[1] ?? "";
      return value
        .split("/")
        .map((part) => part.match(/[2-9TJQKA][cdhs]/g) ?? [])
        .filter((combo) => combo.length === 2);
    };
    for (let seed = 0; seed < 256; seed++) {
      const preflop = generateVersion2Lesson("strategy-preflop", seed)!;
      for (const item of [
        ...preflop.coreQuestions,
        ...preflop.transferQuestions,
      ]) {
        const prompt = item.question.prompt;
        const players = Number(prompt.match(/(2|6|9)-player chart/)?.[1]);
        const position = prompt.match(/position: ([^;]+);/)?.[1];
        const hand = prompt.match(/hand class: ([A23456789TJQK]{2}[so]?)/)?.[1];
        const chart = openingCharts.find(
          (candidate) =>
            candidate.players === players && candidate.position === position,
        )!;
        const chartAnswer = chart.cells.find(
          (cell) => cell.hand === hand,
        )!.action;
        expect(item.correctAnswer).toEqual({
          kind: "choice",
          choiceId: chartAnswer,
        });
      }

      const equityLesson = generateVersion2Lesson("strategy-equity", seed)!;
      for (const item of [
        ...equityLesson.coreQuestions,
        ...equityLesson.transferQuestions,
      ]) {
        const prompt = item.question.prompt;
        const price = prompt
          .match(/Pot before bet: (\d+) chips; bet\/call: (\d+) chips/)
          ?.slice(1)
          .map(Number);
        if (price && item.question.id.includes("price")) {
          expect(item.question.assumptions.join(" ")).not.toMatch(
            /displayed opponent combinations/i,
          );
          expect(item.correctAnswer).toEqual({
            kind: "percent",
            value: potOdds(price[0]!, price[1]!, price[1]!),
          });
        }
        if (
          /Hero:/.test(prompt) &&
          /Board:/.test(prompt) &&
          /Range/.test(prompt)
        ) {
          const hero = cardList(prompt, "Hero");
          const board = cardList(prompt, "Board");
          const range = combos(prompt);
          const answer = equity(hero, board, range).equity;
          if (
            item.correctAnswer.kind === "percent" &&
            item.question.id.includes("equity")
          )
            expect(item.correctAnswer.value).toBeCloseTo(answer, 9);
          if (item.question.id.includes("call")) {
            const threshold = potOdds(price![0]!, price![1]!, price![1]!);
            if (item.correctAnswer.kind !== "choice")
              throw new Error("Generated call decision must be a choice.");
            expect(item.correctAnswer.choiceId).toBe(
              answer > threshold ? "call" : "fold",
            );
          }
        }
      }

      const postflop = generateVersion2Lesson("strategy-postflop", seed)!;
      for (const item of [
        ...postflop.coreQuestions,
        ...postflop.transferQuestions,
      ]) {
        const prompt = item.question.prompt;
        const hero = cardList(prompt, "Hero");
        const board = cardList(prompt, "Board");
        if (hero.length === 2 && board.length === 4) {
          const suit = hero
            .concat(board)
            .find(
              (card) =>
                hero
                  .concat(board)
                  .filter((candidate) => candidate[1] === card[1]).length === 4,
            )?.[1];
          if (suit && item.question.id.includes("outs")) {
            expect(item.correctAnswer).toEqual({
              kind: "choice",
              choiceId: `outs-${13 - hero.concat(board).filter((card) => card[1] === suit).length}`,
            });
          }
          if (
            item.question.id.includes("equity") ||
            item.question.id.includes("call")
          ) {
            const range = combos(prompt);
            const answer = equity(hero, board, range).equity;
            if (item.correctAnswer.kind === "percent")
              expect(item.correctAnswer.value).toBeCloseTo(answer, 9);
            if (item.question.id.includes("call")) {
              const price = prompt
                .match(/Pot before bet: (\d+) chips; bet\/call: (\d+) chips/)
                ?.slice(1)
                .map(Number)!;
              if (item.correctAnswer.kind !== "choice")
                throw new Error("Generated draw decision must be a choice.");
              expect(item.correctAnswer.choiceId).toBe(
                answer > potOdds(price[0]!, price[1]!, price[1]!)
                  ? "call"
                  : "fold",
              );
            }
          }
        }
      }

      const ranges = generateVersion2Lesson("strategy-ranges", seed)!;
      for (const item of [
        ...ranges.coreQuestions,
        ...ranges.transferQuestions,
      ]) {
        const prompt = item.question.prompt;
        const hero = cardList(prompt, "Hero");
        const board = cardList(prompt, "Board");
        const range = combos(prompt);
        if (hero.length === 2 && board.length === 5 && range.length >= 2) {
          const legal = legalRange(hero, board, range);
          if (item.question.id.startsWith("blocked-combos"))
            expect(item.correctAnswer).toEqual({
              kind: "choice",
              choiceId: `remain-${legal.length}`,
            });
          if (item.question.id.includes("equity"))
            expect(item.correctAnswer).toEqual({
              kind: "percent",
              value: equity(hero, board, range).equity,
            });
        }
      }

      const betting = generateVersion2Lesson("strategy-betting", seed)!;
      for (const item of [
        ...betting.coreQuestions,
        ...betting.transferQuestions,
      ]) {
        const prompt = item.question.prompt;
        const hero = cardList(prompt, "Hero");
        const board = cardList(prompt, "Board");
        const range = combos(prompt);
        const numbers = prompt
          .match(/Pot: (\d+) chips; bet: (\d+) chips; fold frequency: (\d+)%/i)
          ?.slice(1)
          .map(Number);
        if (
          hero.length === 2 &&
          board.length === 5 &&
          range.length &&
          numbers
        ) {
          const share = equity(hero, board, range).equity / 100;
          const [pot, bet, foldPct] = numbers;
          const betEv =
            (foldPct! / 100) * pot! +
            (1 - foldPct! / 100) * (share * (pot! + 2 * bet!) - bet!);
          const checkEv = share * pot!;
          expect(share).toBeGreaterThan(0.5);
          expect(item.correctAnswer).toEqual({
            kind: "choice",
            choiceId: betEv > checkEv ? "bet" : "check",
          });
        }
      }
    }
  }, 120_000);
});
