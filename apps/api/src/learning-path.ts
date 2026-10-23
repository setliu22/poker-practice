import { Router } from "express";
import type Database from "better-sqlite3";
import { createHash, randomInt, randomUUID } from "node:crypto";
import { z } from "zod";
import {
  startLearningInstanceSchema,
  learningPathEventAckSchema,
  learningPathAnswerCommandSchema,
  learningPathEventSchema,
  type LearningPathEvent,
  type LearningPathInstanceState,
  type LearningPathProgress,
} from "../../../packages/shared/src/learning-path.js";
import {
  getLearningPathCatalog,
  getLessonDefinition,
  getPublicQuestion,
  gradeLearningPathAnswer,
  getScenarioFingerprint,
  selectLearningPathTransfer,
} from "./learning-path-content.js";
import {
  LEARNING_PATH_GENERATOR_VERSION,
  LEARNING_PATH_TEMPLATE_VERSION,
} from "./learning-path-generated.js";

type Opened = Extract<LearningPathEvent, { kind: "lesson-opened" }>;
type EventFact = {
  [K in LearningPathEvent["kind"]]: Pick<
    Extract<LearningPathEvent, { kind: K }>,
    "kind" | "payload"
  >;
}[LearningPathEvent["kind"]];
class PathError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message);
  }
}
const conflict = (message: string): never => {
  throw new PathError(409, message);
};
/** Explicit callers delete receipts first to preserve foreign-key integrity. */
export function clearLearningPathProgress(db: Database.Database) {
  db.prepare("DELETE FROM learning_path_answer_receipts").run();
  db.prepare("DELETE FROM learning_path_events").run();
}
const UINT32_MAX = 0xffff_ffff;
const UINT32_RANGE = 0x1_0000_0000;

export function learningPathRoutes(
  db: Database.Database,
  nextExerciseSeed: () => number = () => randomInt(0, UINT32_RANGE),
): Router {
  const router = Router();
  function readEvents(): LearningPathEvent[] {
    return (
      db
        .prepare(
          `SELECT cursor,event_id AS eventId,schema_version AS schemaVersion,
      installation_id AS installationId,session_id AS sessionId,instance_id AS instanceId,
      content_id AS contentId,content_version AS contentVersion,kind,created_at AS createdAt,payload
      FROM learning_path_events ORDER BY cursor`,
        )
        .all() as { payload: string }[]
    ).map((row) =>
      learningPathEventSchema.parse({
        ...row,
        payload: JSON.parse(row.payload),
      }),
    );
  }
  function opened(instanceId: string, events = readEvents()): Opened {
    const event = events.find(
      (e): e is Opened =>
        e.kind === "lesson-opened" && e.instanceId === instanceId,
    );
    if (!event) throw new PathError(404, "Learning instance not found.");
    const seed = exerciseSeed(event);
    const generatorVersion =
      "generatorVersion" in event.payload
        ? event.payload.generatorVersion
        : undefined;
    if (
      event.contentVersion === "2" &&
      generatorVersion !== LEARNING_PATH_GENERATOR_VERSION
    )
      conflict("This generated practice version is unavailable.");
    if (!getLessonDefinition(event.contentId, event.contentVersion, seed))
      conflict("This content version is unavailable.");
    return event;
  }
  function exerciseSeed(open: Opened): number | undefined {
    return "exerciseSeed" in open.payload
      ? open.payload.exerciseSeed
      : undefined;
  }
  function uniqueExerciseSeed(events: LearningPathEvent[]): number {
    const used = new Set(
      events.flatMap((event) =>
        event.kind === "lesson-opened" &&
        event.schemaVersion === 2 &&
        "exerciseSeed" in event.payload
          ? [event.payload.exerciseSeed]
          : [],
      ),
    );
    let seed = nextExerciseSeed();
    if (!Number.isInteger(seed) || seed < 0 || seed > UINT32_MAX)
      throw new PathError(
        503,
        "Practice could not be generated. Please retry.",
      );
    if (used.size >= UINT32_RANGE)
      throw new PathError(503, "No new practice scenarios are available.");
    while (used.has(seed)) seed = seed === UINT32_MAX ? 0 : seed + 1;
    return seed;
  }
  function lessonFor(open: Opened) {
    return getLessonDefinition(
      open.contentId,
      open.contentVersion,
      exerciseSeed(open),
    );
  }
  function scenarioFingerprint(open: Opened, questionId: string) {
    const seed = exerciseSeed(open);
    return seed === undefined
      ? undefined
      : getScenarioFingerprint(
          open.contentId,
          open.contentVersion,
          seed,
          questionId,
        );
  }
  function fresh(
    questionId: string,
    open: Opened,
    events: LearningPathEvent[],
  ) {
    const fingerprint = scenarioFingerprint(open, questionId);
    if (fingerprint !== undefined)
      return !events.some(
        (e) =>
          e.kind === "question-presented" &&
          e.contentId === open.contentId &&
          e.contentVersion === open.contentVersion &&
          "scenarioFingerprint" in e.payload &&
          e.payload.scenarioFingerprint === fingerprint,
      );
    return !events.some(
      (e) =>
        e.kind === "question-presented" &&
        e.contentId === open.contentId &&
        e.contentVersion === open.contentVersion &&
        e.payload.questionId === questionId,
    );
  }
  function state(
    instanceId: string,
    events = readEvents(),
  ): LearningPathInstanceState {
    const open = opened(instanceId, events),
      lesson = lessonFor(open)!;
    const own = events.filter((e) => e.instanceId === instanceId);
    const questionIndex = open.payload.questionOrder.findIndex(
      (id) =>
        !own.some(
          (e) => e.kind === "feedback-shown" && e.payload.questionId === id,
        ),
    );
    const index =
      questionIndex < 0 ? open.payload.questionOrder.length : questionIndex;
    const id = open.payload.questionOrder[index];
    const question = id
      ? getPublicQuestion(
          open.contentId,
          open.contentVersion,
          id,
          exerciseSeed(open),
        )
      : null;
    if (id && !question) conflict("This question version is unavailable.");
    const feedback = own.find(
      (e) => e.kind === "feedback-generated" && e.payload.questionId === id,
    );
    const presentation = own.find(
      (e) => e.kind === "question-presented" && e.payload.questionId === id,
    );
    return {
      instanceId,
      sessionId: open.sessionId,
      contentId: open.contentId,
      contentVersion: open.contentVersion,
      title: lesson.title,
      concept: lesson.concept,
      intro: lesson.intro,
      selectionReason: open.payload.selectionReason,
      question: question ?? null,
      questionIndex: index,
      totalQuestions: open.payload.questionOrder.length,
      isFreshTransfer:
        !!question?.isTransfer &&
        (presentation?.kind === "question-presented"
          ? presentation.payload.isFreshTransfer
          : fresh(id!, open, events)),
      feedback:
        feedback?.kind === "feedback-generated"
          ? feedback.payload.feedback
          : null,
      complete: own.some((e) => e.kind === "lesson-completed"),
    };
  }
  function append(
    open: Pick<
      Opened,
      | "installationId"
      | "sessionId"
      | "instanceId"
      | "contentId"
      | "contentVersion"
    > & { schemaVersion: 1 | 2 },
    eventId: string,
    fact: EventFact,
  ) {
    // Validate the whole persisted fact, including nested payload, before writing.
    const event = learningPathEventSchema.parse({
      ...open,
      ...fact,
      eventId,
      cursor: 1,
      createdAt: new Date().toISOString(),
    });
    const result = db
      .prepare(
        `INSERT INTO learning_path_events(event_id,schema_version,installation_id,session_id,instance_id,content_id,content_version,kind,created_at,payload) VALUES(?,?,?,?,?,?,?,?,?,?)`,
      )
      .run(
        eventId,
        event.schemaVersion,
        event.installationId,
        event.sessionId,
        event.instanceId,
        event.contentId,
        event.contentVersion,
        event.kind,
        event.createdAt,
        JSON.stringify(event.payload),
      );
    return Number(result.lastInsertRowid);
  }
  function existingAck(
    eventId: string,
    instanceId: string,
    kind: LearningPathEvent["kind"],
    questionId?: string,
  ) {
    const event = readEvents().find((e) => e.eventId === eventId);
    if (!event) return false;
    if (
      event.instanceId !== instanceId ||
      event.kind !== kind ||
      (questionId !== undefined &&
        (!("questionId" in event.payload) ||
          event.payload.questionId !== questionId))
    )
      conflict("Event ID already belongs to a different acknowledgement.");
    return true;
  }
  function progress(timeZone: string): LearningPathProgress {
    const calendar = new Intl.DateTimeFormat("en-US", {
      timeZone,
      calendar: "gregory",
      numberingSystem: "latn",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    });
    // Convert local calendar labels to UTC day ordinals, never subtract 24 hours
    // from a zoned instant: DST days can have 23 or 25 hours.
    function dayOrdinal(date: Date): number {
      const parts = calendar.formatToParts(date);
      const part = (type: string) =>
        Number(parts.find((item) => item.type === type)!.value);
      const day = new Date(0);
      day.setUTCFullYear(part("year"), part("month") - 1, part("day"));
      return day.getTime() / 86_400_000;
    }
    const today = dayOrdinal(new Date());
    const events = readEvents(),
      opens = events.filter((e): e is Opened => e.kind === "lesson-opened"),
      catalog = getLearningPathCatalog(),
      lessons = catalog.units.flatMap((unit) => unit.lessons),
      currentLessonIds = lessons.map((lesson) => lesson.contentId);
    const practiceDays = new Set(
      events
        .filter((event) => event.kind === "lesson-completed")
        .map((event) => dayOrdinal(new Date(event.createdAt))),
    );
    const result: LearningPathProgress = {
      startedLessons: opens.length,
      completedLessons: 0,
      completedToday: false,
      currentStreakDays: 0,
      completedContentIds: [],
      nextLessonContentId: null,
      resumedLessons: 0,
      answerAttempts: 0,
      transferAttempts: 0,
      transferCorrect: 0,
      activeInstanceId: null,
      bySkill: {},
      reviewSuggestion: null,
      recentPracticeDays: Array.from({ length: 7 }, (_, index) => {
        const ordinal = today - 6 + index;
        return {
          date: new Date(ordinal * 86_400_000).toISOString().slice(0, 10),
          completed: practiceDays.has(ordinal),
          today: index === 6,
        };
      }),
    };
    const completed = new Set(
      events
        .filter((e) => e.kind === "lesson-completed")
        .map((e) => e.instanceId),
    );
    result.completedToday = practiceDays.has(today);
    let day = result.completedToday ? today : today - 1;
    while (practiceDays.has(day)) {
      result.currentStreakDays++;
      day--;
    }
    result.completedLessons = completed.size;
    result.completedContentIds = [
      ...new Set(
        events
          .filter((e) => e.kind === "lesson-completed")
          .map((e) => e.contentId)
          .filter((contentId) => currentLessonIds.includes(contentId)),
      ),
    ];
    result.resumedLessons = new Set(
      events
        .filter((e) => e.kind === "lesson-resumed")
        .map((e) => e.instanceId),
    ).size;
    result.activeInstanceId =
      opens.filter((e) => !completed.has(e.instanceId)).at(-1)?.instanceId ??
      null;
    for (const event of events) {
      if (event.kind !== "feedback-generated") continue;
      result.answerAttempts++;
      const feedback = event.payload.feedback,
        skill = (result.bySkill[feedback.skillId] ??= {
          attempts: 0,
          incorrect: 0,
        });
      skill.attempts++;
      if (!feedback.correct) skill.incorrect++;
      const presented = events.find(
        (e) =>
          e.kind === "question-presented" &&
          e.instanceId === event.instanceId &&
          e.payload.questionId === event.payload.questionId,
      );
      if (
        presented?.kind === "question-presented" &&
        presented.payload.isFreshTransfer
      ) {
        result.transferAttempts++;
        if (feedback.correct) result.transferCorrect++;
      }
    }
    const mistakes = events
      .filter(
        (
          event,
        ): event is Extract<
          LearningPathEvent,
          { kind: "feedback-generated" }
        > =>
          event.kind === "feedback-generated" &&
          event.contentVersion === catalog.contentVersion &&
          !event.payload.feedback.correct &&
          events.some(
            (answer) =>
              answer.kind === "answer-submitted" &&
              answer.cursor < event.cursor &&
              answer.installationId === event.installationId &&
              answer.sessionId === event.sessionId &&
              answer.instanceId === event.instanceId &&
              answer.contentId === event.contentId &&
              answer.contentVersion === event.contentVersion &&
              answer.payload.questionId === event.payload.questionId &&
              answer.payload.requestId === event.payload.requestId,
          ),
      )
      .sort((a, b) => b.cursor - a.cursor);
    result.nextLessonContentId =
      lessons.find(
        (lesson) => !result.completedContentIds.includes(lesson.contentId),
      )?.contentId ?? null;
    for (const mistake of mistakes) {
      // Cursors order committed feedback independently of equal wall times.
      // The first catalog match breaks ties between lessons for that skill.
      const lesson = lessons.find(
        (item) => item.skillId === mistake.payload.feedback.skillId,
      );
      if (!lesson) continue;
      result.reviewSuggestion = {
        contentId: lesson.contentId,
        skillId: lesson.skillId,
        reason: "Review the skill from your most recent incorrect answer.",
      };
      break;
    }
    return result;
  }
  router.get("/", (_req, res) => res.json(getLearningPathCatalog()));
  router.get("/progress", (req, res) => {
    const timeZone = z
      .string()
      .min(1)
      .max(100)
      .refine((value) => {
        // Intl also accepts numeric offsets; the API requires a named IANA zone.
        if (!/^[A-Za-z][A-Za-z0-9._+-]*(?:\/[A-Za-z0-9._+-]+)*$/.test(value))
          return false;
        try {
          new Intl.DateTimeFormat("en-US", { timeZone: value });
          return true;
        } catch {
          return false;
        }
      }, "Use a supported IANA time zone.")
      .default("UTC")
      .parse(req.query.timeZone);
    res.json(progress(timeZone));
  });
  router.post("/instances", (req, res) => {
    const body = startLearningInstanceSchema.parse(req.body);
    const result = db
      .transaction(() => {
        const events = readEvents(),
          duplicate = events.find((e) => e.eventId === body.eventId);
        if (duplicate) {
          if (
            duplicate.kind !== "lesson-opened" ||
            duplicate.instanceId !== body.instanceId ||
            duplicate.sessionId !== body.sessionId ||
            duplicate.contentId !== body.contentId ||
            duplicate.contentVersion !== body.contentVersion ||
            ("entryPoint" in duplicate.payload
              ? duplicate.payload.entryPoint
              : undefined) !== body.entryPoint
          )
            conflict("Event ID was reused with changed content.");
          return state(body.instanceId, events);
        }
        if (events.some((e) => e.instanceId === body.instanceId))
          conflict("Instance ID already exists.");
        const catalog = getLearningPathCatalog();
        const schemaVersion = body.contentVersion === "1" ? 1 : 2;
        if (
          schemaVersion === 2 &&
          body.contentVersion !== catalog.contentVersion
        )
          conflict("Unknown or stale content version.");
        if (schemaVersion === 2 && !body.entryPoint)
          conflict("Choose how this practice instance was started.");
        const currentLessonIds = catalog.units.flatMap((unit) =>
          unit.lessons.map((lesson) => lesson.contentId),
        );
        if (schemaVersion === 2 && !currentLessonIds.includes(body.contentId))
          conflict("Unknown or stale content version.");
        const seed =
          schemaVersion === 2 ? uniqueExerciseSeed(events) : undefined;
        let lesson, transfer;
        try {
          lesson = getLessonDefinition(
            body.contentId,
            body.contentVersion,
            seed,
          );
          if (!lesson) throw new Error("Generated lesson unavailable.");
          const seen = events
            .filter(
              (e) =>
                e.kind === "question-presented" &&
                e.contentId === body.contentId &&
                e.contentVersion === body.contentVersion,
            )
            .map((e) =>
              e.kind === "question-presented" ? e.payload.questionId : "",
            );
          transfer = selectLearningPathTransfer(
            body.contentId,
            body.contentVersion,
            seen,
            seed,
          );
        } catch {
          if (schemaVersion !== 2)
            throw new PathError(503, "This lesson could not be loaded.");
          throw new PathError(
            503,
            "Practice could not be generated. Please retry.",
          );
        }
        const installation = db
          .prepare("SELECT id FROM usage_installation WHERE singleton=1")
          .get() as { id: string };
        const { entryPoint, ...identity } = body;
        const open = {
          ...identity,
          installationId: installation.id,
          schemaVersion: schemaVersion as 1 | 2,
        };
        append(open, body.eventId, {
          kind: "lesson-opened",
          payload: {
            questionOrder: [
              ...lesson!.coreQuestions.map((q) => q.question.id),
              transfer.questionId,
            ],
            selectionReason: transfer.reason,
            ...(schemaVersion === 2
              ? {
                  entryPoint: entryPoint!,
                  exerciseSeed: seed!,
                  generatorVersion: LEARNING_PATH_GENERATOR_VERSION,
                }
              : {}),
          },
        });
        return state(body.instanceId);
      })
      .immediate();
    res.json(result);
  });
  router.get("/instances/:instanceId", (req, res) =>
    res.json(state(req.params.instanceId)),
  );
  router.post("/instances/:instanceId/resumed", (req, res) => {
    const { eventId } = learningPathEventAckSchema.parse(req.body),
      instanceId = req.params.instanceId;
    res.json(
      db
        .transaction(() => {
          const open = opened(instanceId);
          if (!existingAck(eventId, instanceId, "lesson-resumed"))
            append(open, eventId, {
              kind: "lesson-resumed",
              payload: { reason: "reload" },
            });
          return state(instanceId);
        })
        .immediate(),
    );
  });
  router.post(
    "/instances/:instanceId/questions/:questionId/presented",
    (req, res) => {
      const { eventId } = learningPathEventAckSchema.parse(req.body),
        { instanceId, questionId } = req.params;
      res.json(
        db
          .transaction(() => {
            const events = readEvents(),
              open = opened(instanceId, events);
            if (
              !existingAck(
                eventId,
                instanceId,
                "question-presented",
                questionId,
              )
            ) {
              const current = state(instanceId, events);
              if (current.complete || current.question?.id !== questionId)
                conflict(
                  "Acknowledge feedback before presenting the next question.",
                );
              const question = current.question!;
              const fingerprint = scenarioFingerprint(open, questionId);
              if (open.schemaVersion === 2 && !fingerprint)
                throw new PathError(
                  503,
                  "This scenario could not be verified. Please retry.",
                );
              append(open, eventId, {
                kind: "question-presented",
                payload: {
                  questionId,
                  ...(open.schemaVersion === 2
                    ? {
                        isTransfer: question.isTransfer,
                        scenarioFingerprint: fingerprint!,
                        templateVersion: LEARNING_PATH_TEMPLATE_VERSION,
                      }
                    : {}),
                  isFreshTransfer:
                    !!question.isTransfer && fresh(questionId, open, events),
                },
              });
            }
            return state(instanceId);
          })
          .immediate(),
      );
    },
  );
  router.post(
    "/instances/:instanceId/questions/:questionId/answers",
    (req, res) => {
      const body = learningPathAnswerCommandSchema.parse(req.body),
        { instanceId, questionId } = req.params;
      const payloadHash = createHash("sha256")
        .update(
          JSON.stringify({
            instanceId,
            questionId,
            contentVersion: body.contentVersion,
            answer: body.answer,
          }),
        )
        .digest("hex");
      const response = db
        .transaction(() => {
          const receipt = db
            .prepare(
              "SELECT payload_hash,response_json FROM learning_path_answer_receipts WHERE request_id=?",
            )
            .get(body.requestId) as
            { payload_hash: string; response_json: string } | undefined;
          if (receipt) {
            if (receipt.payload_hash !== payloadHash)
              conflict("Request ID was reused with changed content.");
            return receipt.response_json;
          }
          if (
            db
              .prepare(
                "SELECT 1 FROM learning_path_answer_receipts WHERE instance_id=? AND question_id=?",
              )
              .get(instanceId, questionId)
          )
            conflict("This question already has a first answer.");
          const events = readEvents(),
            open = opened(instanceId, events),
            current = state(instanceId, events);
          if (body.contentVersion !== open.contentVersion)
            conflict("Stale content version.");
          if (
            current.complete ||
            current.question?.id !== questionId ||
            !events.some(
              (e) =>
                e.instanceId === instanceId &&
                e.kind === "question-presented" &&
                e.payload.questionId === questionId,
            )
          )
            conflict("Present the current question before answering.");
          const feedback = gradeLearningPathAnswer(
              open.contentId,
              open.contentVersion,
              questionId,
              body.answer,
              exerciseSeed(open),
            ),
            response = JSON.stringify(feedback);
          const cursor = append(open, randomUUID(), {
            kind: "answer-submitted",
            payload: {
              questionId,
              requestId: body.requestId,
              answer: body.answer,
            },
          });
          append(open, randomUUID(), {
            kind: "feedback-generated",
            payload: { questionId, requestId: body.requestId, feedback },
          });
          db.prepare(
            "INSERT INTO learning_path_answer_receipts(request_id,instance_id,question_id,payload_hash,event_cursor,response_json) VALUES(?,?,?,?,?,?)",
          ).run(
            body.requestId,
            instanceId,
            questionId,
            payloadHash,
            cursor,
            response,
          );
          return response;
        })
        .immediate();
      res.type("json").send(response);
    },
  );
  router.post(
    "/instances/:instanceId/questions/:questionId/feedback-shown",
    (req, res) => {
      const { eventId } = learningPathEventAckSchema.parse(req.body),
        { instanceId, questionId } = req.params;
      res.json(
        db
          .transaction(() => {
            const events = readEvents(),
              open = opened(instanceId, events);
            if (
              !existingAck(eventId, instanceId, "feedback-shown", questionId)
            ) {
              const current = state(instanceId, events),
                feedback = events.find(
                  (e) =>
                    e.instanceId === instanceId &&
                    e.kind === "feedback-generated" &&
                    e.payload.questionId === questionId,
                );
              if (current.question?.id !== questionId || !feedback)
                conflict(
                  "Submit the current answer before acknowledging feedback.",
                );
              append(open, eventId, {
                kind: "feedback-shown",
                payload: { questionId, feedbackEventId: feedback!.eventId },
              });
            }
            return state(instanceId);
          })
          .immediate(),
      );
    },
  );
  router.post("/instances/:instanceId/complete", (req, res) => {
    const { eventId } = learningPathEventAckSchema.parse(req.body),
      instanceId = req.params.instanceId;
    res.json(
      db
        .transaction(() => {
          const open = opened(instanceId);
          if (!existingAck(eventId, instanceId, "lesson-completed")) {
            const current = state(instanceId);
            if (current.question || current.complete)
              conflict(
                "Acknowledge every answer's feedback before completing.",
              );
            append(open, eventId, { kind: "lesson-completed", payload: {} });
          }
          return state(instanceId);
        })
        .immediate(),
    );
  });
  router.delete("/progress", (_req, res) => {
    db.transaction(() => clearLearningPathProgress(db)).immediate();
    res.json({ cleared: true });
  });
  router.get("/export", (req, res) => {
    const integer = z
      .string()
      .regex(/^\d+$/)
      .transform(Number)
      .pipe(z.number().int().safe().nonnegative());
    const query = z
      .object({
        afterCursor: integer.optional(),
        throughCursor: integer.optional(),
        limit: integer.pipe(z.number().min(1).max(1000)).optional(),
      })
      .strict()
      .parse(req.query);
    // Keep the high-water mark and page in one SQLite read snapshot.
    const result = db
      .transaction(() => {
        const events = readEvents(),
          high =
            (
              db
                .prepare(
                  "SELECT seq FROM sqlite_sequence WHERE name='learning_path_events'",
                )
                .get() as { seq: number } | undefined
            )?.seq ?? 0;
        const after = query.afterCursor ?? 0,
          through = query.throughCursor ?? high,
          limit = query.limit ?? 1000;
        if (
          after > through ||
          through > high ||
          (after > 0 && query.throughCursor === undefined)
        )
          throw new PathError(
            400,
            "Invalid export cursor bounds; retain throughCursor from the first page.",
          );
        const remaining = events.filter(
            (e) => e.cursor > after && e.cursor <= through,
          ),
          page = remaining.slice(0, limit);
        const installation = db
          .prepare("SELECT id FROM usage_installation WHERE singleton=1")
          .get() as { id: string };
        return {
          version: 1,
          installationId: installation.id,
          throughCursor: through,
          events: page,
          nextCursor: page.at(-1)?.cursor ?? after,
          done: remaining.length <= limit,
        };
      })
      .deferred();
    res.json(result);
  });
  router.use(
    (
      err: Error,
      _req: import("express").Request,
      res: import("express").Response,
      next: import("express").NextFunction,
    ) => {
      if (err instanceof PathError) {
        res.status(err.status).json({ error: err.message });
        return;
      }
      next(err);
    },
  );
  return router;
}
