import { z } from "zod";

const id = z.string().min(1).max(200);
const text = z.string().min(1);
const count = z.number().int().nonnegative();

export const learningPathAnswerSchema = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("choice"), choiceId: id }).strict(),
  z
    .object({ kind: z.literal("percent"), value: z.number().min(0).max(100) })
    .strict(),
]);
export type LearningPathAnswer = z.infer<typeof learningPathAnswerSchema>;

export const learningPathCatalogSchema = z
  .object({
    pathId: id,
    contentVersion: id,
    title: text,
    units: z.array(
      z
        .object({
          id,
          title: text,
          lessons: z.array(
            z.object({ contentId: id, title: text, skillId: id }).strict(),
          ),
        })
        .strict(),
    ),
  })
  .strict();
export type LearningPathCatalog = z.infer<typeof learningPathCatalogSchema>;

export const learningPathQuestionSchema = z
  .object({
    id,
    title: text,
    prompt: text,
    skillId: id,
    answerKind: z.enum(["choice", "percent"]),
    choices: z.array(z.object({ id, label: text }).strict()).optional(),
    unitLabel: text.optional(),
    assumptions: z.array(text),
    isTransfer: z.boolean(),
  })
  .strict();
export type LearningPathQuestion = z.infer<typeof learningPathQuestionSchema>;

export const startLearningInstanceSchema = z
  .object({
    eventId: z.uuid(),
    instanceId: z.uuid(),
    sessionId: z.uuid(),
    contentId: id,
    contentVersion: id,
    entryPoint: z
      .enum(["daily-recommendation", "path-selection", "review", "repeat"])
      .optional(),
  })
  .strict()
  .superRefine((value, context) => {
    if (value.contentVersion === "2" && !value.entryPoint) {
      context.addIssue({
        code: "custom",
        path: ["entryPoint"],
        message: "Version 2 starts require an entry point.",
      });
    }
  });
export type StartLearningInstance = z.infer<typeof startLearningInstanceSchema>;
export const learningPathEventAckSchema = z
  .object({ eventId: z.uuid() })
  .strict();
export type LearningPathEventAck = z.infer<typeof learningPathEventAckSchema>;
export const learningPathAnswerCommandSchema = z
  .object({
    requestId: z.uuid(),
    contentVersion: id,
    answer: learningPathAnswerSchema,
  })
  .strict();
export type LearningPathAnswerCommand = z.infer<
  typeof learningPathAnswerCommandSchema
>;

export const learningPathFeedbackSchema = z
  .object({
    correct: z.boolean(),
    correctAnswer: learningPathAnswerSchema,
    explanation: text,
    takeaway: text,
    skillId: id,
  })
  .strict();
export type LearningPathFeedback = z.infer<typeof learningPathFeedbackSchema>;
export const learningPathInstanceStateSchema = z
  .object({
    instanceId: z.uuid(),
    sessionId: z.uuid(),
    contentId: id,
    contentVersion: id,
    title: text,
    concept: text,
    intro: text,
    selectionReason: text,
    question: learningPathQuestionSchema.nullable(),
    questionIndex: count,
    totalQuestions: count,
    isFreshTransfer: z.boolean(),
    feedback: learningPathFeedbackSchema.nullable(),
    complete: z.boolean(),
  })
  .strict();
export type LearningPathInstanceState = z.infer<
  typeof learningPathInstanceStateSchema
>;
export const learningPathProgressSchema = z
  .object({
    startedLessons: count,
    completedLessons: count,
    completedToday: z.boolean(),
    currentStreakDays: count,
    recentPracticeDays: z
      .array(
        z
          .object({
            date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
            completed: z.boolean(),
            today: z.boolean(),
          })
          .strict()
          .superRefine((day, context) => {
            const parsed = new Date(`${day.date}T00:00:00.000Z`);
            if (
              Number.isNaN(parsed.getTime()) ||
              parsed.toISOString().slice(0, 10) !== day.date
            ) {
              context.addIssue({
                code: "custom",
                path: ["date"],
                message: "Expected a real calendar date.",
              });
            }
          }),
      )
      .length(7)
      .superRefine((days, context) => {
        if (days.some((day, index) => day.today !== (index === 6))) {
          context.addIssue({
            code: "custom",
            message: "Only the final practice day may be today.",
          });
        }
        for (let index = 1; index < days.length; index++) {
          const previous = Date.parse(`${days[index - 1]!.date}T00:00:00.000Z`);
          const current = Date.parse(`${days[index]!.date}T00:00:00.000Z`);
          if (current - previous !== 86_400_000) {
            context.addIssue({
              code: "custom",
              path: [index, "date"],
              message: "Practice dates must be consecutive calendar days.",
            });
          }
        }
      }),
    completedContentIds: z.array(id),
    nextLessonContentId: id.nullable(),
    resumedLessons: count,
    answerAttempts: count,
    transferAttempts: count,
    transferCorrect: count,
    activeInstanceId: z.uuid().nullable(),
    bySkill: z.record(
      id,
      z.object({ attempts: count, incorrect: count }).strict(),
    ),
    reviewSuggestion: z
      .object({ contentId: id, skillId: id, reason: text })
      .strict()
      .nullable(),
  })
  .strict();
export type LearningPathProgress = z.infer<typeof learningPathProgressSchema>;

const eventEnvelopeV1 = {
  cursor: z.number().int().positive(),
  eventId: z.uuid(),
  schemaVersion: z.literal(1),
  installationId: z.uuid(),
  sessionId: z.uuid(),
  instanceId: z.uuid(),
  contentId: id,
  contentVersion: id,
  createdAt: z.iso.datetime(),
};
const eventEnvelopeV2 = { ...eventEnvelopeV1, schemaVersion: z.literal(2) };
const learningPathEventV1Schema = z.discriminatedUnion("kind", [
  z
    .object({
      ...eventEnvelopeV1,
      kind: z.literal("lesson-opened"),
      payload: z
        .object({ questionOrder: z.array(id), selectionReason: text })
        .strict(),
    })
    .strict(),
  z
    .object({
      ...eventEnvelopeV1,
      kind: z.literal("lesson-resumed"),
      payload: z.object({ reason: z.enum(["reload", "return"]) }).strict(),
    })
    .strict(),
  z
    .object({
      ...eventEnvelopeV1,
      kind: z.literal("question-presented"),
      payload: z
        .object({ questionId: id, isFreshTransfer: z.boolean() })
        .strict(),
    })
    .strict(),
  z
    .object({
      ...eventEnvelopeV1,
      kind: z.literal("answer-submitted"),
      payload: z
        .object({
          questionId: id,
          requestId: z.uuid(),
          answer: learningPathAnswerSchema,
        })
        .strict(),
    })
    .strict(),
  z
    .object({
      ...eventEnvelopeV1,
      kind: z.literal("feedback-generated"),
      payload: z
        .object({
          questionId: id,
          requestId: z.uuid(),
          feedback: learningPathFeedbackSchema,
        })
        .strict(),
    })
    .strict(),
  z
    .object({
      ...eventEnvelopeV1,
      kind: z.literal("feedback-shown"),
      payload: z.object({ questionId: id, feedbackEventId: z.uuid() }).strict(),
    })
    .strict(),
  z
    .object({
      ...eventEnvelopeV1,
      kind: z.literal("lesson-completed"),
      payload: z.object({}).strict(),
    })
    .strict(),
]);
const learningPathEventV2Schema = z.discriminatedUnion("kind", [
  z
    .object({
      ...eventEnvelopeV2,
      kind: z.literal("lesson-opened"),
      payload: z
        .object({
          questionOrder: z.array(id),
          selectionReason: text,
          entryPoint: z.enum([
            "daily-recommendation",
            "path-selection",
            "review",
            "repeat",
          ]),
          exerciseSeed: z.number().int().min(0).max(4294967295),
          generatorVersion: text,
        })
        .strict(),
    })
    .strict(),
  z
    .object({
      ...eventEnvelopeV2,
      kind: z.literal("lesson-resumed"),
      payload: z.object({ reason: z.enum(["reload", "return"]) }).strict(),
    })
    .strict(),
  z
    .object({
      ...eventEnvelopeV2,
      kind: z.literal("question-presented"),
      payload: z
        .object({
          questionId: id,
          isFreshTransfer: z.boolean(),
          isTransfer: z.boolean(),
          scenarioFingerprint: z.string().regex(/^[a-f0-9]{64}$/),
          templateVersion: text,
        })
        .strict(),
    })
    .strict(),
  z
    .object({
      ...eventEnvelopeV2,
      kind: z.literal("answer-submitted"),
      payload: z
        .object({
          questionId: id,
          requestId: z.uuid(),
          answer: learningPathAnswerSchema,
        })
        .strict(),
    })
    .strict(),
  z
    .object({
      ...eventEnvelopeV2,
      kind: z.literal("feedback-generated"),
      payload: z
        .object({
          questionId: id,
          requestId: z.uuid(),
          feedback: learningPathFeedbackSchema,
        })
        .strict(),
    })
    .strict(),
  z
    .object({
      ...eventEnvelopeV2,
      kind: z.literal("feedback-shown"),
      payload: z.object({ questionId: id, feedbackEventId: z.uuid() }).strict(),
    })
    .strict(),
  z
    .object({
      ...eventEnvelopeV2,
      kind: z.literal("lesson-completed"),
      payload: z.object({}).strict(),
    })
    .strict(),
]);
export const learningPathEventSchema = z.union([
  learningPathEventV1Schema,
  learningPathEventV2Schema,
]);
export type LearningPathEvent = z.infer<typeof learningPathEventSchema>;
