import { beforeEach, afterEach, describe, expect, it } from "vitest";
import { randomUUID } from "node:crypto";
import express from "express";
import request from "supertest";
import { openDatabase } from "../apps/api/src/database";
import { createTable } from "../packages/poker/src/table";
import {
  createExposureReceipt,
  initializeUsage,
  recordDecisionUsage,
  usageRoutes,
} from "../apps/api/src/usage";
import { readFileSync } from "node:fs";
let db: ReturnType<typeof openDatabase>, app: express.Express;
const tableId = "legacy-valid-game-id",
  sessionId = randomUUID();
beforeEach(() => {
  db = openDatabase(":memory:");
  db.exec(readFileSync("apps/api/migrations/011_usage.sql", "utf8"));
  initializeUsage(db);
  const state = createTable(tableId, 2, 7);
  db.prepare("INSERT INTO bot_tables VALUES(?,?)").run(
    tableId,
    JSON.stringify(state),
  );
  app = express();
  app.use(express.json());
  app.use("/usage", usageRoutes(db));
  app.use(
    (
      error: Error,
      _req: express.Request,
      res: express.Response,
      _next: express.NextFunction,
    ) => {
      res.status(400).json({ error: error.message });
    },
  );
});
afterEach(() => db.close());
const decision = () => ({
  tableId,
  revision: 0,
  actionId: randomUUID(),
  sequence: 1,
  handNumber: 1,
  action: "call" as const,
  practice: false,
  partial: false,
  sessionId,
});
function all() {
  return db.prepare("SELECT * FROM usage_events ORDER BY cursor").all();
}
describe("durable local usage", () => {
  it("records commands atomically and idempotently; unknown assistance stays unknown", async () => {
    const input = decision();
    db.transaction(() => recordDecisionUsage(db, input))();
    db.transaction(() => recordDecisionUsage(db, input))();
    expect(all()).toHaveLength(1);
    expect(() =>
      db.transaction(() => {
        recordDecisionUsage(db, decision());
        throw new Error("rollback");
      })(),
    ).toThrow("rollback");
    expect(all()).toHaveLength(1);
    expect(() => recordDecisionUsage(db, { ...input, action: "fold" })).toThrow(
      /different event/,
    );
    const response = await request(app).get("/usage/summary");
    expect(response.body).toMatchObject({
      decisions: 1,
      exposures: 0,
      decisionsWithKnownExposure: 0,
      decisionsWithUnknownAssistance: 1,
    });
  });
  it("preserves table-scoped action IDs across games", async () => {
    const input = decision();
    const otherId = "another-game";
    db.prepare("INSERT INTO bot_tables VALUES(?,?)").run(
      otherId,
      JSON.stringify(createTable(otherId, 2, 9)),
    );
    recordDecisionUsage(db, input);
    recordDecisionUsage(db, { ...input, tableId: otherId });
    expect(all()).toHaveLength(2);
    recordDecisionUsage(db, input);
    expect(all()).toHaveLength(2);
  });
  it("requires signed actual-display acknowledgements and does not mutate while predicting", async () => {
    const before = all();
    const receipt = createExposureReceipt(db, {
      tableId,
      revision: 0,
      assessment: {
        kind: "fast",
        action: "raise",
        amount: 20,
        modelId: "pilot-v1",
        result: "modeled-gap",
        probability: 0.9,
      },
    });
    expect(all()).toEqual(before);
    expect(
      (
        await request(app)
          .post("/usage/exposures")
          .send({ receipt: `${receipt}x`, sessionId })
      ).status,
    ).toBe(400);
    const ack = () =>
      request(app).post("/usage/exposures").send({ receipt, sessionId });
    expect((await ack()).status).toBe(200);
    expect((await ack()).status).toBe(200);
    expect(all()).toHaveLength(1);
    expect(
      (
        await request(app)
          .post("/usage/exposures")
          .send({ receipt, sessionId: randomUUID() })
      ).status,
    ).toBe(409);
    recordDecisionUsage(db, decision());
    expect((await request(app).get("/usage/summary")).body).toMatchObject({
      decisionsWithKnownExposure: 1,
      decisionsWithUnknownAssistance: 0,
    });
    const body = (await request(app).get("/usage/export")).body;
    expect(body.events[0].payload).toMatchObject({ kind: "fast", amount: 20 });
    expect(JSON.stringify(body)).not.toMatch(
      /receipt_secret|seed|opponentHole/,
    );
  });
  it("keeps missing-session and late acknowledgements out of known assistance", async () => {
    const input = decision();
    const receipt = createExposureReceipt(db, {
      tableId,
      revision: 0,
      assessment: { kind: "odds" },
    });
    recordDecisionUsage(db, input);
    recordDecisionUsage(db, { ...decision(), sessionId: undefined });
    await request(app).post("/usage/exposures").send({ receipt, sessionId });
    const summary = (await request(app).get("/usage/summary")).body;
    expect(summary).toMatchObject({
      decisionsWithKnownExposure: 0,
      decisionsWithUnknownAssistance: 2,
      bySource: { humanUi: 2, apiUnknown: 1 },
    });
    const exported = (await request(app).get("/usage/export")).body.events;
    expect(exported[1].source).toBe("api-unknown");
  });
  it("downloads a full consistent SQLite snapshot through the data API", async () => {
    recordDecisionUsage(db, decision());
    const response = await request(app).get("/usage/backup");
    expect(response.status).toBe(200);
    expect(response.headers["x-backup-sha256"]).toMatch(/^[a-f0-9]{64}$/);
    expect(response.headers["content-disposition"]).toContain(
      "poker-practice.sqlite",
    );
    expect(Buffer.from(response.body).subarray(0, 16).toString()).toBe(
      "SQLite format 3\0",
    );
    expect(all()).toHaveLength(1);
  });
  it("validates view/session payloads, stale views and changed idempotency keys", async () => {
    const input = { eventId: randomUUID(), sessionId, tableId, revision: 0 };
    expect(
      (
        await request(app)
          .post("/usage/viewed")
          .send({ ...input, seed: 42 })
      ).status,
    ).toBe(400);
    expect(
      (await request(app).post("/usage/sessions").send({ id: sessionId }))
        .status,
    ).toBe(200);
    expect(
      (await request(app).post("/usage/sessions").send({ id: sessionId }))
        .status,
    ).toBe(200);
    expect(
      (
        await request(app)
          .post("/usage/viewed")
          .send({ ...input, revision: 1 })
      ).status,
    ).toBe(409);
    expect((await request(app).post("/usage/viewed").send(input)).status).toBe(
      200,
    );
    expect((await request(app).post("/usage/viewed").send(input)).status).toBe(
      200,
    );
    expect(
      (
        await request(app)
          .post("/usage/viewed")
          .send({ ...input, sessionId: randomUUID() })
      ).status,
    ).toBe(409);
    expect(all()).toHaveLength(1);
  });
  it("exports a bounded public snapshot and resumes without including later inserts", async () => {
    for (let i = 0; i < 3; i++) recordDecisionUsage(db, decision());
    const first = (await request(app).get("/usage/export?limit=2")).body;
    expect(first.events).toHaveLength(2);
    expect(first.hasMore).toBe(true);
    recordDecisionUsage(db, decision());
    const rest = (
      await request(app).get(
        `/usage/export?after=${first.next}&through=${first.through}&limit=2`,
      )
    ).body;
    expect(rest.events).toHaveLength(1);
    expect(rest.hasMore).toBe(false);
    expect((await request(app).get("/usage/export?limit=1001")).status).toBe(
      400,
    );
    expect((await request(app).get("/usage/export?after=-1")).status).toBe(400);
  });
  it("deletes a game's usage and allows forgetting telemetry without erasing gameplay", async () => {
    recordDecisionUsage(db, decision());
    expect(() =>
      db.prepare("UPDATE usage_events SET revision=3").run(),
    ).toThrow(/immutable/);
    const oldId = (await request(app).get("/usage/summary")).body
      .installationId;
    const receipt = createExposureReceipt(db, {
      tableId,
      revision: 0,
      assessment: { kind: "odds" },
    });
    expect((await request(app).delete("/usage")).status).toBe(200);
    expect(all()).toHaveLength(0);
    expect(db.prepare("SELECT * FROM bot_tables").all()).toHaveLength(1);
    expect(
      (await request(app).get("/usage/summary")).body.installationId,
    ).not.toBe(oldId);
    expect(
      (await request(app).post("/usage/exposures").send({ receipt, sessionId }))
        .status,
    ).toBe(400);
    recordDecisionUsage(db, decision());
    db.prepare("DELETE FROM bot_tables WHERE id=?").run(tableId);
    expect(all()).toHaveLength(0);
  });
});
