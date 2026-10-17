import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import request from "supertest";
import { randomUUID } from "node:crypto";
import { mkdtempSync, rmSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import Database from "better-sqlite3";
import { openDatabase } from "../apps/api/src/database";
import { createApp } from "../apps/api/src/app";
import * as learningContent from "../apps/api/src/learning-path-content";
import {
  learningPathEventSchema,
  learningPathInstanceStateSchema,
  learningPathProgressSchema,
} from "../packages/shared/src/learning-path";
let db: ReturnType<typeof openDatabase>,
  app: ReturnType<typeof createApp>,
  directory: string;
const base = "/api/v1/learning-path";
const ack = () => ({ eventId: randomUUID() });
const command = () => ({
  requestId: randomUUID(),
  contentVersion: "1",
  answer: { kind: "choice", choiceId: "check" },
});
async function start(overrides = {}) {
  const body = {
    ...ack(),
    instanceId: randomUUID(),
    sessionId: randomUUID(),
    contentId: "table-flow",
    contentVersion: "1",
    ...overrides,
  };
  const result = await request(app)
    .post(`${base}/instances`)
    .send(body)
    .expect(200);
  return { body, state: result.body };
}
function answer(instanceId: string, questionId: string, body = command()) {
  return request(app)
    .post(`${base}/instances/${instanceId}/questions/${questionId}/answers`)
    .send(body);
}
async function finish(instanceId: string) {
  let state = (
    await request(app).get(`${base}/instances/${instanceId}`).expect(200)
  ).body;
  while (state.question) {
    const root = `${base}/instances/${instanceId}/questions/${state.question.id}`;
    await request(app).post(`${root}/presented`).send(ack()).expect(200);
    await answer(instanceId, state.question.id).expect(200);
    state = (
      await request(app).post(`${root}/feedback-shown`).send(ack()).expect(200)
    ).body;
  }
  return request(app)
    .post(`${base}/instances/${instanceId}/complete`)
    .send(ack())
    .expect(200);
}
beforeEach(() => {
  directory = mkdtempSync(join(tmpdir(), "poker-path-test-"));
  db = openDatabase(join(directory, "test.sqlite"));
  app = createApp(db);
});
afterEach(() => {
  db.close();
  rmSync(directory, { recursive: true, force: true });
  vi.restoreAllMocks();
});
describe("local learning path ledger", () => {
  it("rebuilds distinct course completion and recommends the first unfinished lesson through repeats and restart", async () => {
    const progress = async () => {
      const result = (await request(app).get(`${base}/progress`).expect(200))
        .body;
      learningPathProgressSchema.parse(result);
      return result;
    };
    expect(await progress()).toMatchObject({
      completedLessons: 0,
      completedContentIds: [],
      nextLessonContentId: "table-flow",
    });
    const first = await start();
    const root = `${base}/instances/${first.body.instanceId}/questions/${first.state.question.id}`;
    await request(app).post(`${root}/presented`).send(ack()).expect(200);
    await answer(first.body.instanceId, first.state.question.id).expect(200);
    expect(await progress()).toMatchObject({
      completedContentIds: [],
      nextLessonContentId: "table-flow",
    });
    await request(app).post(`${root}/feedback-shown`).send(ack()).expect(200);
    await finish(first.body.instanceId);
    const repeat = await start();
    expect(await progress()).toMatchObject({
      completedLessons: 1,
      completedContentIds: ["table-flow"],
      nextLessonContentId: "hand-rankings",
    });
    await finish(repeat.body.instanceId);
    db.close();
    db = openDatabase(join(directory, "test.sqlite"));
    app = createApp(db);
    expect(await progress()).toMatchObject({
      completedLessons: 2,
      completedContentIds: ["table-flow"],
      nextLessonContentId: "hand-rankings",
    });
    // Direct access can complete a later lesson without skipping an earlier gap.
    for (const contentId of [
      "postflop-reasoning",
      "hand-rankings",
      "position-opening",
      "pot-odds-equity",
    ]) {
      const opened = await start({ contentId });
      await finish(opened.body.instanceId);
      if (contentId === "postflop-reasoning")
        expect((await progress()).nextLessonContentId).toBe("hand-rankings");
    }
    const complete = await progress();
    expect(complete.completedLessons).toBe(6);
    expect(complete.completedContentIds).toHaveLength(5);
    expect(new Set(complete.completedContentIds)).toEqual(
      new Set([
        "table-flow",
        "hand-rankings",
        "position-opening",
        "pot-odds-equity",
        "postflop-reasoning",
      ]),
    );
    expect(complete.nextLessonContentId).toBeNull();
    await request(app).delete(`${base}/progress`).expect(200);
    expect(await progress()).toMatchObject({
      completedContentIds: [],
      nextLessonContentId: "table-flow",
    });
  });
  it("requires presentation before answers and feedback acknowledgement before advancing or completing", async () => {
    const { body, state } = await start();
    learningPathInstanceStateSchema.parse(state);
    expect(JSON.stringify(state)).not.toMatch(
      /correctAnswer|gradingRule|takeaway/,
    );
    const root = `${base}/instances/${body.instanceId}`;
    await answer(body.instanceId, state.question.id).expect(409);
    await request(app)
      .post(`${root}/questions/facing-bet/presented`)
      .send(ack())
      .expect(409);
    await request(app)
      .post(`${root}/questions/${state.question.id}/feedback-shown`)
      .send(ack())
      .expect(409);
    await request(app).post(`${root}/complete`).send(ack()).expect(409);
    await request(app)
      .post(`${root}/questions/${state.question.id}/presented`)
      .send(ack())
      .expect(200);
    expect(
      (await answer(body.instanceId, state.question.id).expect(200)).body
        .correct,
    ).toBe(true);
    const pending = (await request(app).get(root)).body;
    expect(pending.question.id).toBe(state.question.id);
    expect(pending.feedback.correct).toBe(true);
    await request(app)
      .post(`${root}/questions/facing-bet/presented`)
      .send(ack())
      .expect(409);
    const advanced = (
      await request(app)
        .post(`${root}/questions/${state.question.id}/feedback-shown`)
        .send(ack())
        .expect(200)
    ).body;
    expect(advanced.question.id).toBe("facing-bet");
    expect(advanced.feedback).toBeNull();
  });
  it("replays exact answers and acknowledgements but rejects changed payloads, second answer IDs, and global event collisions", async () => {
    const { body, state } = await start();
    await request(app).post(`${base}/instances`).send(body).expect(200);
    await request(app)
      .post(`${base}/instances`)
      .send({ ...body, sessionId: randomUUID() })
      .expect(409);
    const other = await start();
    await request(app)
      .post(`${base}/instances/${other.body.instanceId}/resumed`)
      .send({ eventId: body.eventId })
      .expect(409);
    const root = `${base}/instances/${body.instanceId}/questions/${state.question.id}`;
    await request(app)
      .post(`${root}/presented`)
      .send({ eventId: body.eventId })
      .expect(409);
    const presented = ack();
    await request(app).post(`${root}/presented`).send(presented).expect(200);
    await request(app).post(`${root}/presented`).send(presented).expect(200);
    const cmd = command(),
      first = await answer(body.instanceId, state.question.id, cmd).expect(200);
    expect(
      (await answer(body.instanceId, state.question.id, cmd).expect(200)).text,
    ).toBe(first.text);
    await answer(body.instanceId, state.question.id, {
      ...cmd,
      answer: { kind: "choice", choiceId: "fold" },
    }).expect(409);
    await answer(body.instanceId, state.question.id).expect(409);
    await answer(other.body.instanceId, other.state.question.id, cmd).expect(
      409,
    );
    const shown = ack();
    await request(app).post(`${root}/feedback-shown`).send(shown).expect(200);
    await request(app).post(`${root}/feedback-shown`).send(shown).expect(200);
    await answer(body.instanceId, state.question.id, cmd).expect(200);
    expect(
      db.prepare("SELECT COUNT(*) n FROM learning_path_answer_receipts").get(),
    ).toEqual({ n: 1 });
    expect(
      db
        .prepare(
          "SELECT COUNT(*) n FROM learning_path_events WHERE kind='answer-submitted'",
        )
        .get(),
    ).toEqual({ n: 1 });
  });
  it("rejects stale versions and strict invalid answers without changing events", async () => {
    await request(app)
      .post(`${base}/instances`)
      .send({
        ...ack(),
        instanceId: randomUUID(),
        sessionId: randomUUID(),
        contentId: "table-flow",
        contentVersion: "future",
      })
      .expect(409);
    const { body, state } = await start();
    await request(app)
      .post(
        `${base}/instances/${body.instanceId}/questions/${state.question.id}/presented`,
      )
      .send(ack())
      .expect(200);
    await answer(body.instanceId, state.question.id, {
      ...command(),
      contentVersion: "future",
    }).expect(409);
    await request(app)
      .post(
        `${base}/instances/${body.instanceId}/questions/${state.question.id}/answers`,
      )
      .send({ ...command(), answer: { kind: "percent", value: 101 } })
      .expect(400);
    expect(
      db.prepare("SELECT COUNT(*) n FROM learning_path_answer_receipts").get(),
    ).toEqual({ n: 0 });
  });
  it("reconstructs state after restart, deduplicates resume, and recovers the latest incomplete instance", async () => {
    const first = await start(),
      second = await start();
    const resume = ack(),
      url = `${base}/instances/${first.body.instanceId}/resumed`;
    await request(app).post(url).send(resume).expect(200);
    await request(app).post(url).send(resume).expect(200);
    const before = (
      await request(app).get(`${base}/instances/${first.body.instanceId}`)
    ).body;
    db.close();
    db = openDatabase(join(directory, "test.sqlite"));
    app = createApp(db);
    expect(
      (await request(app).get(`${base}/instances/${first.body.instanceId}`))
        .body,
    ).toEqual(before);
    const progress = (await request(app).get(`${base}/progress`).expect(200))
      .body;
    learningPathProgressSchema.parse(progress);
    expect(progress).toMatchObject({
      startedLessons: 2,
      resumedLessons: 1,
      activeInstanceId: second.body.instanceId,
    });
    await finish(second.body.instanceId);
    expect(
      (await request(app).get(`${base}/progress`)).body.activeInstanceId,
    ).toBe(first.body.instanceId);
  });
  it("selects unseen transfers using presentations and counts only first-seen transfer performance", async () => {
    const seen = [];
    for (let i = 0; i < 3; i++) {
      const { body } = await start();
      await finish(body.instanceId);
      const events = (await request(app).get(`${base}/export`)).body.events;
      const transfer = events.filter(
        (e: any) =>
          e.instanceId === body.instanceId &&
          e.kind === "question-presented" &&
          e.payload.questionId.startsWith("transfer-"),
      )[0];
      seen.push(transfer);
    }
    expect(seen[0].payload.questionId).not.toBe(seen[1].payload.questionId);
    expect(seen.map((e) => e.payload.isFreshTransfer)).toEqual([
      true,
      true,
      false,
    ]);
    const progress = (await request(app).get(`${base}/progress`)).body;
    expect(progress).toMatchObject({
      completedLessons: 3,
      transferAttempts: 2,
      transferCorrect: 1,
      answerAttempts: 15,
    });
    expect(progress.reviewSuggestion).toMatchObject({
      contentId: "table-flow",
      skillId: "legal-actions",
    });
    expect(db.prepare("SELECT COUNT(*) n FROM usage_events").get()).toEqual({
      n: 0,
    });
  });
  it("suggests the most recent paired mistake rather than the most frequent skill, using cursor and catalog order", async () => {
    const catalog = learningContent.getLearningPathCatalog();
    catalog.units[0]!.lessons = [
      { contentId: "older-rules", title: "Older rules", skillId: "rules" },
      { contentId: "first-odds", title: "First odds lesson", skillId: "odds" },
      {
        contentId: "second-odds",
        title: "Second odds lesson",
        skillId: "odds",
      },
    ];
    vi.spyOn(learningContent, "getLearningPathCatalog").mockReturnValue(
      catalog,
    );
    const installation = db
      .prepare("SELECT id FROM usage_installation")
      .get() as { id: string };
    function factPair(
      skillId: string,
      contentId: string,
      correct = false,
      paired = true,
    ) {
      const envelope = {
        eventId: randomUUID(),
        schemaVersion: 1,
        installationId: installation.id,
        sessionId: randomUUID(),
        instanceId: randomUUID(),
        contentId,
        contentVersion: "1",
        createdAt: "2026-10-16T12:00:00.000Z",
      };
      const requestId = randomUUID(),
        questionId = "decision";
      const facts = [
        {
          kind: "lesson-opened",
          payload: {
            questionOrder: [questionId],
            selectionReason: "Projection fixture.",
          },
        },
        ...(paired
          ? [
              {
                kind: "answer-submitted",
                payload: {
                  questionId,
                  requestId,
                  answer: { kind: "choice", choiceId: "check" },
                },
              },
            ]
          : []),
        {
          kind: "feedback-generated",
          payload: {
            questionId,
            requestId,
            feedback: {
              correct,
              correctAnswer: { kind: "choice", choiceId: "call" },
              explanation: "Synthetic projection feedback.",
              takeaway: "Synthetic projection takeaway.",
              skillId,
            },
          },
        },
      ];
      db.transaction(() => {
        for (const fact of facts) {
          const event = learningPathEventSchema.parse({
            ...envelope,
            ...fact,
            eventId: randomUUID(),
            cursor: 1,
          });
          db.prepare(
            "INSERT INTO learning_path_events(event_id,schema_version,installation_id,session_id,instance_id,content_id,content_version,kind,created_at,payload) VALUES(?,?,?,?,?,?,?,?,?,?)",
          ).run(
            event.eventId,
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
        }
      })();
    }
    expect(
      (await request(app).get(`${base}/progress`)).body.reviewSuggestion,
    ).toBeNull();
    factPair("rules", "older-rules");
    factPair("rules", "older-rules");
    factPair("odds", "second-odds");
    // Equal wall times exercise cursor recency; two rules mistakes must lose
    // to the newer odds mistake, with the first matching catalog lesson chosen.
    expect(
      (await request(app).get(`${base}/progress`)).body.reviewSuggestion,
    ).toMatchObject({ contentId: "first-odds", skillId: "odds" });
    factPair("rules", "older-rules", true);
    factPair("rules", "older-rules", false, false);
    expect(
      (await request(app).get(`${base}/progress`)).body.reviewSuggestion,
    ).toMatchObject({ contentId: "first-odds", skillId: "odds" });
    expect(db.prepare("SELECT COUNT(*) n FROM usage_events").get()).toEqual({
      n: 0,
    });
  });
  it("rolls back both answer and feedback events when the receipt cannot commit", async () => {
    const { body, state } = await start();
    await request(app)
      .post(
        `${base}/instances/${body.instanceId}/questions/${state.question.id}/presented`,
      )
      .send(ack())
      .expect(200);
    db.exec(
      "CREATE TRIGGER fail_receipt BEFORE INSERT ON learning_path_answer_receipts BEGIN SELECT RAISE(ABORT, 'forced receipt failure'); END",
    );
    const log = vi.spyOn(console, "error").mockImplementation(() => {}),
      cmd = command();
    await answer(body.instanceId, state.question.id, cmd).expect(500);
    expect(
      db.prepare("SELECT COUNT(*) n FROM learning_path_events").get(),
    ).toEqual({ n: 2 });
    expect(
      db.prepare("SELECT COUNT(*) n FROM learning_path_answer_receipts").get(),
    ).toEqual({ n: 0 });
    db.exec("DROP TRIGGER fail_receipt");
    await answer(body.instanceId, state.question.id, cmd).expect(200);
    log.mockRestore();
  });
  it("pins export high water across appends and validates cursor bounds", async () => {
    await start();
    await start();
    const page = (await request(app).get(`${base}/export?limit=1`).expect(200))
      .body;
    expect(page).toMatchObject({
      version: 1,
      done: false,
      nextCursor: 1,
      throughCursor: 2,
    });
    await start();
    const next = (
      await request(app)
        .get(
          `${base}/export?limit=1&afterCursor=${page.nextCursor}&throughCursor=${page.throughCursor}`,
        )
        .expect(200)
    ).body;
    expect(next).toMatchObject({ done: true, nextCursor: 2, throughCursor: 2 });
    [...page.events, ...next.events].forEach((e) =>
      learningPathEventSchema.parse(e),
    );
    for (const query of [
      "limit=0",
      "limit=1001",
      "afterCursor=-1",
      "afterCursor=1",
      "afterCursor=3&throughCursor=2",
      "throughCursor=999",
    ])
      await request(app).get(`${base}/export?${query}`).expect(400);
  });
  it("protects event updates and clears the path separately or with all progress while preserving games and content", async () => {
    const catalogBeforeClear = (await request(app).get(base).expect(200)).body;
    const { body } = await start();
    await finish(body.instanceId);
    db.prepare("INSERT INTO read_lessons VALUES('old',0,'now')").run();
    db.prepare("INSERT INTO bot_tables VALUES('saved-game','{}')").run();
    expect(() =>
      db.prepare("UPDATE learning_path_events SET payload='{}'").run(),
    ).toThrow(/immutable/);
    await request(app).delete(`${base}/progress`).expect(200);
    expect(
      db.prepare("SELECT COUNT(*) n FROM learning_path_events").get(),
    ).toEqual({ n: 0 });
    expect(db.prepare("SELECT COUNT(*) n FROM read_lessons").get()).toEqual({
      n: 1,
    });
    expect(
      db.prepare("SELECT COUNT(*) n FROM learning_path_answer_receipts").get(),
    ).toEqual({ n: 0 });
    const next = await start();
    await finish(next.body.instanceId);
    await request(app).delete("/api/progress").expect(200);
    expect(
      db.prepare("SELECT COUNT(*) n FROM learning_path_events").get(),
    ).toEqual({ n: 0 });
    expect(db.prepare("SELECT COUNT(*) n FROM read_lessons").get()).toEqual({
      n: 0,
    });
    expect((await request(app).get(base).expect(200)).body).toEqual(
      catalogBeforeClear,
    );
  });
  it("migrates v12 additively without changing identity, lessons, games, usage or export sequence", () => {
    const path = join(directory, "v12.sqlite"),
      old = new Database(path);
    for (const name of [
      "001_initial",
      "002_bot_tables",
      "003_bot_games",
      "004_game_numbers",
      "005_solver_charts",
      "006_learning",
      "007_read_lesson",
      "008_generated_decisions",
      "009_cash_practice",
      "010_table_events",
      "011_usage",
      "012_usage_compatibility",
    ])
      old.exec(readFileSync(`apps/api/migrations/${name}.sql`, "utf8"));
    old.prepare("INSERT INTO read_lessons VALUES('old',0,'now')").run();
    old
      .prepare("INSERT INTO usage_installation VALUES(1,?,?,?)")
      .run(randomUUID(), "secret", "now");
    old.prepare("INSERT INTO bot_tables VALUES('game','{}')").run();
    old
      .prepare(
        "INSERT INTO usage_events VALUES(42,?,1,'api-unknown',?,NULL,'game',0,'decision-committed','now','{}')",
      )
      .run(randomUUID(), randomUUID());
    old
      .prepare("UPDATE sqlite_sequence SET seq=80 WHERE name='usage_events'")
      .run();
    old
      .prepare(
        "INSERT INTO learning_questions VALUES('existing',0,'now',NULL,NULL,NULL)",
      )
      .run();
    old.prepare("INSERT INTO usage_sessions VALUES('session','now')").run();
    const identity = old.prepare("SELECT * FROM usage_installation").get();
    old.close();
    const migrated = openDatabase(path);
    try {
      expect(
        migrated.prepare("SELECT * FROM usage_installation").get(),
      ).toEqual(identity);
      expect(migrated.prepare("SELECT * FROM read_lessons").all()).toEqual([
        { id: "old", variant: 0, created_at: "now" },
      ]);
      expect(
        migrated.prepare("SELECT * FROM learning_questions").all(),
      ).toEqual([
        {
          id: "existing",
          scenario: 0,
          created_at: "now",
          answer: null,
          feedback: null,
          answered_at: null,
        },
      ]);
      expect(migrated.prepare("SELECT * FROM usage_sessions").all()).toEqual([
        { id: "session", created_at: "now" },
      ]);
      expect(
        migrated.prepare("SELECT COUNT(*) n FROM bot_tables").get(),
      ).toEqual({ n: 1 });
      expect(
        migrated
          .prepare("SELECT seq FROM sqlite_sequence WHERE name='usage_events'")
          .get(),
      ).toEqual({ seq: 80 });
      expect(migrated.prepare("SELECT cursor FROM usage_events").get()).toEqual(
        { cursor: 42 },
      );
      expect(
        migrated.prepare("SELECT MAX(version) n FROM schema_migrations").get(),
      ).toEqual({ n: 13 });
      expect(
        migrated.prepare("SELECT COUNT(*) n FROM learning_path_events").get(),
      ).toEqual({ n: 0 });
    } finally {
      migrated.close();
    }
  });
});
