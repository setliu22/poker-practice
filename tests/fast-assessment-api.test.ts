import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { randomUUID } from "node:crypto";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import request from "supertest";
import { openDatabase } from "../apps/api/src/database";
import { createApp } from "../apps/api/src/app";
import { createTable, runBots } from "../packages/poker/src/table";
let db: ReturnType<typeof openDatabase>, app: ReturnType<typeof createApp>;
beforeEach(() => {
  db = openDatabase(":memory:");
  app = createApp(db);
});
afterEach(() => db.close());
async function start() {
  const r = await request(app).post("/api/v1/tables").send({ players: 2 });
  expect(r.status).toBe(201);
  return r.body;
}
function allRows() {
  return (
    db
      .prepare(
        "SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' ORDER BY name",
      )
      .all() as { name: string }[]
  ).map(({ name }) => [
    name,
    db.prepare(`SELECT * FROM "${name}" ORDER BY rowid`).all(),
  ]);
}
async function assess(id: string, action = "call", revision = 0) {
  return request(app)
    .post(`/api/v1/tables/${id}/fast-assessment`)
    .send({ revision, action });
}
describe("local fast assessment and durable usage integration", () => {
  it("predicts without writing any table, changing the game, or exposing private state", async () => {
    const view = await start(),
      before = allRows();
    const response = await assess(view.id);
    expect(response.status).toBe(200);
    expect(response.body.status).toMatch(/ready|uncertain/);
    expect(response.body.probability).toBeGreaterThanOrEqual(0);
    expect(response.body.probability).toBeLessThanOrEqual(1);
    expect(response.body).toMatchObject({
      revision: 0,
      handNumber: 1,
      featureVersion: 1,
    });
    expect(response.body.usageReceipt).toEqual(expect.any(String));
    expect(JSON.stringify(response.body)).not.toMatch(
      /runout|actualCards|receipt_secret|actualProbability/,
    );
    expect(allRows()).toEqual(before);
    expect((await request(app).get(`/api/v1/tables/${view.id}`)).body).toEqual(
      view,
    );
  });
  it("rejects stale, illegal and malformed queries and reports unsupported valid contexts honestly", async () => {
    const view = await start(),
      before = allRows();
    expect((await assess(view.id, "check")).status).toBe(400);
    expect((await assess(view.id, "call", 99)).status).toBe(409);
    expect(
      (
        await request(app)
          .post(`/api/v1/tables/${view.id}/fast-assessment`)
          .send({ revision: 0, action: "raise", amount: 1 })
      ).status,
    ).toBe(400);
    expect(
      (
        await request(app)
          .post(`/api/v1/tables/${view.id}/fast-assessment`)
          .send({ revision: 0, action: "call", seed: 1 })
      ).status,
    ).toBe(400);
    expect((await assess("missing")).status).toBe(404);
    expect(allRows()).toEqual(before);
    const other = runBots(createTable(randomUUID(), 3, 1));
    expect(other.actor).toBe(0);
    db.prepare("INSERT INTO bot_tables VALUES(?,?)").run(
      other.id,
      JSON.stringify(other),
    );
    const unsupported = await assess(other.id, "fold");
    expect(unsupported.status).toBe(200);
    expect(unsupported.body).toMatchObject({
      status: "unsupported",
      probability: null,
      label: null,
    });
  });
  it("records acknowledged exposure and one committed public decision atomically across retries", async () => {
    const view = await start(),
      session = randomUUID(),
      eventId = randomUUID();
    await request(app).post("/api/v1/usage/sessions").send({ id: session });
    const viewed = {
      eventId,
      sessionId: session,
      tableId: view.id,
      revision: 0,
    };
    expect(
      (await request(app).post("/api/v1/usage/viewed").send(viewed)).status,
    ).toBe(200);
    const result = await assess(view.id);
    const shown = { receipt: result.body.usageReceipt, sessionId: session };
    expect(
      (await request(app).post("/api/v1/usage/exposures").send(shown)).status,
    ).toBe(200);
    const input = { revision: 0, actionId: randomUUID(), action: "fold" };
    const first = await request(app)
      .post(`/api/v1/tables/${view.id}/actions`)
      .set("X-Practice-Session", session)
      .send(input);
    expect(first.status).toBe(200);
    expect(
      (
        await request(app)
          .post(`/api/v1/tables/${view.id}/actions`)
          .set("X-Practice-Session", session)
          .send(input)
      ).body,
    ).toEqual(first.body);
    expect(
      (await request(app).post("/api/v1/usage/exposures").send(shown)).status,
    ).toBe(200);
    const summary = (await request(app).get("/api/v1/usage/summary")).body;
    expect(summary).toMatchObject({
      decisions: 1,
      viewed: 1,
      exposures: 1,
      decisionsWithKnownExposure: 1,
      decisionsWithUnknownAssistance: 0,
    });
    const exported = (await request(app).get("/api/v1/usage/export")).body;
    expect(exported.events).toHaveLength(3);
    const action = exported.events.find(
      (event: { kind: string }) => event.kind === "decision-committed",
    );
    expect(action).toMatchObject({
      source: "human-ui",
      sessionId: session,
      revision: 0,
      eventId: input.actionId,
    });
    expect(action.payload).toMatchObject({
      handNumber: 1,
      action: "fold",
      practice: false,
      partial: false,
      publicFeatures: {
        street: "preflop",
        board: [],
        hero: view.players[0].hole,
        pot: 15,
        toCall: 5,
        dealer: 0,
        history: view.history,
      },
    });
    const linked = db
      .prepare(
        "SELECT kind,payload FROM bot_table_events WHERE table_id=? AND sequence=?",
      )
      .get(view.id, action.payload.sequence) as {
      kind: string;
      payload: string;
    };
    expect(linked.kind).toBe("action");
    expect(JSON.parse(linked.payload)).toMatchObject({
      seat: 0,
      action: "fold",
    });
    expect(JSON.stringify(exported)).not.toMatch(
      /runout|receipt_secret|actualCards|actualProbability/,
    );
  });
  it("keeps absent and late acknowledgement unknown, including sessionless API usage", async () => {
    const view = await start();
    const prediction = await assess(view.id);
    const body = { revision: 0, actionId: randomUUID(), action: "fold" };
    expect(
      (await request(app).post(`/api/v1/tables/${view.id}/actions`).send(body))
        .status,
    ).toBe(200);
    expect(
      (
        await request(app)
          .post("/api/v1/usage/exposures")
          .send({ receipt: prediction.body.usageReceipt })
      ).status,
    ).toBe(200);
    const summary = (await request(app).get("/api/v1/usage/summary")).body;
    expect(summary).toMatchObject({
      decisions: 1,
      decisionsWithKnownExposure: 0,
      decisionsWithUnknownAssistance: 1,
    });
    expect(
      (await request(app).get("/api/v1/usage/export")).body.events.every(
        (event: { source: string }) => event.source === "api-unknown",
      ),
    ).toBe(true);
  });
  it("rolls back gameplay, journal, labels and receipts if usage persistence fails", async () => {
    const view = await start(),
      before = allRows();
    db.exec(
      "CREATE TRIGGER usage_failure BEFORE INSERT ON usage_events WHEN NEW.kind='decision-committed' BEGIN SELECT RAISE(ABORT,'injected usage failure'); END",
    );
    const log = vi.spyOn(console, "error").mockImplementation(() => {});
    try {
      const response = await request(app)
        .post(`/api/v1/tables/${view.id}/actions`)
        .send({ revision: 0, actionId: randomUUID(), action: "fold" });
      expect(response.status).toBe(500);
      expect(allRows()).toEqual(before);
    } finally {
      log.mockRestore();
    }
  });
  it("preserves per-game idempotency when command UUIDs match and rejects malformed session headers", async () => {
    const first = await start(),
      second = await start(),
      actionId = randomUUID();
    const before = allRows();
    const bad = await request(app)
      .post(`/api/v1/tables/${first.id}/actions`)
      .set("X-Practice-Session", "invalid")
      .send({ revision: 0, actionId, action: "fold" });
    expect(bad.status).toBe(400);
    expect(allRows()).toEqual(before);
    for (const table of [first, second])
      expect(
        (
          await request(app)
            .post(`/api/v1/tables/${table.id}/actions`)
            .send({ revision: 0, actionId, action: "fold" })
        ).status,
      ).toBe(200);
    expect(
      (await request(app).get("/api/v1/usage/summary")).body.decisions,
    ).toBe(2);
  });
  it("issues read-only existing-tool exposure receipts in headers while preserving JSON contracts", async () => {
    const view = await start(),
      before = allRows();
    const guide = await request(app)
      .post(`/api/tables/${view.id}/guide`)
      .send({ revision: 0 });
    expect(guide.status).toBe(200);
    expect(guide.headers["x-practice-receipt"]).toEqual(expect.any(String));
    expect(guide.body).not.toHaveProperty("usageReceipt");
    expect(allRows()).toEqual(before);
    const shown = await request(app)
      .post("/api/v1/usage/exposures")
      .send({ receipt: guide.headers["x-practice-receipt"] });
    expect(shown.status).toBe(200);
    expect(
      (await request(app).get("/api/v1/usage/summary")).body.exposures,
    ).toBe(1);
  });
  it("cascades game-specific usage on deletion while keeping other games", async () => {
    const a = await start(),
      b = await start();
    for (const table of [a, b])
      await request(app)
        .post(`/api/v1/tables/${table.id}/actions`)
        .send({ revision: 0, actionId: randomUUID(), action: "fold" });
    expect(
      (await request(app).delete(`/api/games/${a.id}`).send({ revision: 1 }))
        .status,
    ).toBe(204);
    const events = (await request(app).get("/api/v1/usage/export")).body.events;
    expect(events).toHaveLength(1);
    expect(events[0].tableId).toBe(b.id);
  });
});
it("preserves the installation, session, exposures and exact decision link across SQLite reopen", async () => {
  const dir = mkdtempSync(join(tmpdir(), "poker-usage-integrated-")),
    file = join(dir, "practice.sqlite");
  let first: ReturnType<typeof openDatabase> | undefined,
    second: ReturnType<typeof openDatabase> | undefined;
  try {
    first = openDatabase(file);
    const firstApp = createApp(first);
    const view = (
      await request(firstApp).post("/api/v1/tables").send({ players: 2 })
    ).body;
    const session = randomUUID(),
      input = { revision: 0, actionId: randomUUID(), action: "fold" };
    const done = await request(firstApp)
      .post(`/api/v1/tables/${view.id}/actions`)
      .set("X-Practice-Session", session)
      .send(input);
    expect(done.status).toBe(200);
    const before = (await request(firstApp).get("/api/v1/usage/export")).body;
    first.close();
    first = undefined;
    second = openDatabase(file);
    const secondApp = createApp(second);
    expect((await request(secondApp).get("/api/v1/usage/export")).body).toEqual(
      before,
    );
    expect(
      (
        await request(secondApp)
          .post(`/api/v1/tables/${view.id}/actions`)
          .set("X-Practice-Session", session)
          .send(input)
      ).body,
    ).toEqual(done.body);
    expect(
      (await request(secondApp).get("/api/v1/usage/summary")).body.decisions,
    ).toBe(1);
  } finally {
    first?.close();
    second?.close();
    rmSync(dir, { recursive: true, force: true });
  }
});
