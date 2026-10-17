import { Router } from "express";
import type Database from "better-sqlite3";
import { createHash, randomUUID } from "node:crypto";
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
  selectLearningPathTransfer,
} from "./learning-path-content.js";

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
export function learningPathRoutes(db: Database.Database): Router {
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
    if (!getLessonDefinition(event.contentId, event.contentVersion))
      conflict("This content version is unavailable.");
    return event;
  }
  function fresh(
    questionId: string,
    open: Opened,
    events: LearningPathEvent[],
  ) {
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
      lesson = getLessonDefinition(open.contentId, open.contentVersion)!;
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
      ? getPublicQuestion(open.contentId, open.contentVersion, id)
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
    >,
    eventId: string,
    fact: EventFact,
  ) {
    // Validate the whole persisted fact, including nested payload, before writing.
    const event = learningPathEventSchema.parse({
      ...open,
      ...fact,
      eventId,
      schemaVersion: 1,
      cursor: 1,
      createdAt: new Date().toISOString(),
    });
    const result = db
      .prepare(
        `INSERT INTO learning_path_events(event_id,schema_version,installation_id,session_id,instance_id,content_id,content_version,kind,created_at,payload) VALUES(?,?,?,?,?,?,?,?,?,?)`,
      )
      .run(
        eventId,
        1,
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
  function progress(): LearningPathProgress {
    const events = readEvents(),
      opens = events.filter((e): e is Opened => e.kind === "lesson-opened");
    const result: LearningPathProgress = {
      startedLessons: opens.length,
      completedLessons: 0,
      completedContentIds: [],
      nextLessonContentId: null,
      resumedLessons: 0,
      answerAttempts: 0,
      transferAttempts: 0,
      transferCorrect: 0,
      activeInstanceId: null,
      bySkill: {},
      reviewSuggestion: null,
    };
    const completed = new Set(
      events
        .filter((e) => e.kind === "lesson-completed")
        .map((e) => e.instanceId),
    );
    result.completedLessons = completed.size;
    result.completedContentIds = [
      ...new Set(
        events
          .filter((e) => e.kind === "lesson-completed")
          .map((e) => e.contentId),
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
    const lessons = getLearningPathCatalog().units.flatMap(
      (unit) => unit.lessons,
    );
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
  router.get("/progress", (_req, res) => res.json(progress()));
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
            duplicate.contentVersion !== body.contentVersion
          )
            conflict("Event ID was reused with changed content.");
          return state(body.instanceId, events);
        }
        if (events.some((e) => e.instanceId === body.instanceId))
          conflict("Instance ID already exists.");
        const lesson = getLessonDefinition(body.contentId, body.contentVersion);
        if (!lesson) conflict("Unknown or stale content version.");
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
        const transfer = selectLearningPathTransfer(
          body.contentId,
          body.contentVersion,
          seen,
        );
        const installation = db
          .prepare("SELECT id FROM usage_installation WHERE singleton=1")
          .get() as { id: string };
        append({ ...body, installationId: installation.id }, body.eventId, {
          kind: "lesson-opened",
          payload: {
            questionOrder: [
              ...lesson!.coreQuestions.map((q) => q.question.id),
              transfer.questionId,
            ],
            selectionReason: transfer.reason,
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
              append(open, eventId, {
                kind: "question-presented",
                payload: {
                  questionId,
                  isFreshTransfer:
                    !!current.question?.isTransfer &&
                    fresh(questionId, open, events),
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
