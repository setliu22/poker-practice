import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import request from "supertest";
import { randomUUID } from "node:crypto";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createApp } from "../apps/api/src/app";
import { openDatabase } from "../apps/api/src/database";
import { createTable, runBots, tableView } from "../packages/poker/src/table";
import { readEvents } from "../apps/api/src/table-journal";
import { reconstructTable } from "../packages/poker/src/table-events";
import type { DecisionDataset } from "../packages/shared/src/decision-dataset";
let db: ReturnType<typeof openDatabase>, app: ReturnType<typeof createApp>;
beforeEach(() => {
  db = openDatabase(":memory:");
  app = createApp(db);
});
afterEach(() => db.close());
const command = (revision: number, extra = {}) => ({
  revision,
  actionId: randomUUID(),
  ...extra,
});
async function start(players = 2) {
  const result = await request(app).post("/api/v1/tables").send({ players });
  expect(result.status).toBe(201);
  return result.body;
}
function snapshot() {
  return [
    "bot_tables",
    "bot_commands",
    "bot_command_requests",
    "bot_table_events",
    "bot_decision_labels",
    "bot_hand_stats",
  ].map((table) => db.prepare(`SELECT * FROM ${table} ORDER BY rowid`).all());
}
describe("durable decision events and versioned commands", () => {
  it("records all opening bot actions and reconstructs the actual deal without policy rerolls", async () => {
    const view = await start(9);
    const state = reconstructTable(readEvents(db, view.id));
    expect(tableView(state)).toEqual(view);
    expect(
      readEvents(db, view.id).filter((event) => event.kind === "action"),
    ).toHaveLength(state.actions!.length);
    expect(readEvents(db, view.id)[0].kind).toBe("checkpoint");
    expect(
      state.players.reduce((sum, p) => sum + p.stack + p.contributed, 0),
    ).toBe(9000);
    expect(() =>
      db
        .prepare("UPDATE bot_table_events SET payload='{}' WHERE table_id=?")
        .run(view.id),
    ).toThrow(/immutable/);
    expect(() =>
      db.prepare("DELETE FROM bot_table_events WHERE table_id=?").run(view.id),
    ).toThrow(/deleting their game/);
  });
  it("retries exactly once across API versions and rejects changed route/payload keys and competing revisions", async () => {
    const view = await start();
    const body = command(view.revision, { action: "fold" });
    const result = await request(app)
      .post(`/api/v1/tables/${view.id}/actions`)
      .send(body);
    expect(result.status).toBe(200);
    const saved = snapshot();
    const retry = await request(app)
      .post(`/api/tables/${view.id}/actions`)
      .send(body);
    expect(retry.body).toEqual(result.body);
    expect(snapshot()).toEqual(saved);
    for (const [route, payload] of [
      ["actions", { ...body, action: "call" }],
      ["next", { revision: body.revision, actionId: body.actionId }],
    ] as const)
      expect(
        (
          await request(app)
            .post(`/api/v1/tables/${view.id}/${route}`)
            .send(payload)
        ).status,
      ).toBe(409);
    expect(snapshot()).toEqual(saved);
    const next = command(result.body.revision);
    const contenders = await Promise.all([
      request(app).post(`/api/v1/tables/${view.id}/next`).send(next),
      request(app)
        .post(`/api/v1/tables/${view.id}/next`)
        .send(command(result.body.revision)),
    ]);
    expect(contenders.map((r) => r.status).sort()).toEqual([200, 409]);
  });
  it("rejects illegal raises, malformed/stale inputs without changing any game record", async () => {
    const view = await start(),
      saved = snapshot();
    for (const body of [
      command(view.revision, { action: "raise", amount: 1 }),
      command(view.revision + 1, { action: "fold" }),
      { ...command(view.revision, { action: "fold" }), runout: ["As"] },
    ]) {
      expect([400, 409]).toContain(
        (
          await request(app)
            .post(`/api/v1/tables/${view.id}/actions`)
            .send(body)
        ).status,
      );
      expect(snapshot()).toEqual(saved);
    }
  });
  it("masks completed-source hindsight and branches from a decision without changing source records", async () => {
    const initial = await start();
    const finished = (
      await request(app)
        .post(`/api/v1/tables/${initial.id}/actions`)
        .send(command(0, { action: "fold" }))
    ).body;
    const sourceBefore = snapshot();
    const history = await request(app).get(
      `/api/v1/tables/${initial.id}/events`,
    );
    expect(history.status).toBe(200);
    const hero = history.body.events.find(
      (event: { heroDecision: boolean }) => event.heroDecision,
    );
    expect(hero.board).toEqual([]);
    expect(hero.legal.toCall).toBe(5);
    const past = await request(app).get(
      `/api/v1/tables/${initial.id}/events/${hero.sequence}`,
    );
    expect(past.body.players[0].hole).toEqual(initial.players[0].hole);
    expect(past.body.players[1]).not.toHaveProperty("hole");
    for (const secret of [
      "seed",
      "runout",
      "decisions",
      "reads",
      "policyEvents",
    ])
      expect(past.body).not.toHaveProperty(secret);
    expect(past.body.rounds).toEqual([]);
    expect(past.body.board).toEqual([]);
    expect(past.body.history).toEqual(initial.history);
    expect(snapshot()).toEqual(sourceBefore); // all history reads are read-only
    const input = command(finished.revision, { sequence: hero.sequence });
    const branch = await request(app)
      .post(`/api/v1/tables/${initial.id}/branch`)
      .send(input);
    expect(branch.status).toBe(201);
    expect(branch.body.id).not.toBe(initial.id);
    expect(branch.body.branchOf).toEqual({
      tableId: initial.id,
      sequence: hero.sequence,
      handNumber: 1,
    });
    expect(branch.body.players[1]).not.toHaveProperty("hole");
    expect(branch.body.history).toEqual(initial.history);
    expect(branch.body.revision).toBe(0);
    const retry = await request(app)
      .post(`/api/v1/tables/${initial.id}/branch`)
      .send(input);
    expect(retry.status).toBe(200);
    expect(retry.body).toEqual(branch.body);
    const alternate = await request(app)
      .post(`/api/v1/tables/${branch.body.id}/actions`)
      .send(command(0, { action: "call" }));
    expect(alternate.status).toBe(200);
    expect(
      (await request(app).get(`/api/v1/tables/${initial.id}`)).body,
    ).toEqual(finished);
    expect(
      (
        await request(app).get(`/api/v1/tables/${branch.body.id}/decisions`)
      ).body.examples.every(
        (e: { practice: boolean; eligibleForTraining: boolean }) =>
          e.practice && !e.eligibleForTraining,
      ),
    ).toBe(true);
  });
  it("retains previous hands and pre-reset decisions, allows old-hand branches and rejects stale branches", async () => {
    const initial = await start();
    const finished = (
      await request(app)
        .post(`/api/v1/tables/${initial.id}/actions`)
        .send(command(0, { action: "fold" }))
    ).body;
    const firstEvents = readEvents(db, initial.id);
    const decision = firstEvents.find(
      (e) => e.kind === "action" && e.payload.seat === 0,
    )!;
    const next = (
      await request(app)
        .post(`/api/v1/tables/${initial.id}/next`)
        .send(command(finished.revision))
    ).body;
    const reset = await request(app)
      .post(`/api/v1/tables/${initial.id}/reset-hand`)
      .send(command(next.revision));
    expect(reset.status).toBe(200);
    expect(readEvents(db, initial.id).slice(0, firstEvents.length)).toEqual(
      firstEvents,
    );
    const stale = await request(app)
      .post(`/api/v1/tables/${initial.id}/branch`)
      .send(command(finished.revision, { sequence: decision.sequence }));
    expect(stale.status).toBe(409);
    const branch = await request(app)
      .post(`/api/v1/tables/${initial.id}/branch`)
      .send(command(reset.body.revision, { sequence: decision.sequence }));
    expect(branch.status).toBe(201);
    expect(branch.body.handNumber).toBe(1);
    expect(branch.body.players[0].hole).toEqual(initial.players[0].hole);
    const invalid = await request(app)
      .post(`/api/v1/tables/${initial.id}/branch`)
      .send(command(reset.body.revision, { sequence: 1 }));
    expect(invalid.status).toBe(400);
  });
  it("rolls back events, projection, statistics and branch creation when receipt persistence fails", async () => {
    const initial = await start();
    const saved = snapshot();
    db.exec(
      "CREATE TRIGGER receipt_failure BEFORE INSERT ON bot_commands BEGIN SELECT RAISE(ABORT,'injected receipt failure'); END",
    );
    const log = vi.spyOn(console, "error").mockImplementation(() => {});
    try {
      const result = await request(app)
        .post(`/api/v1/tables/${initial.id}/actions`)
        .send(command(0, { action: "fold" }));
      expect(result.status).toBe(500);
      expect(snapshot()).toEqual(saved);
      db.exec("DROP TRIGGER receipt_failure");
      const done = (
        await request(app)
          .post(`/api/v1/tables/${initial.id}/actions`)
          .send(command(0, { action: "fold" }))
      ).body;
      const seq = readEvents(db, initial.id).find(
        (e) => e.kind === "action" && e.payload.seat === 0,
      )!.sequence;
      const beforeBranch = snapshot();
      db.exec(
        "CREATE TRIGGER receipt_failure BEFORE INSERT ON bot_commands BEGIN SELECT RAISE(ABORT,'injected receipt failure'); END",
      );
      expect(
        (
          await request(app)
            .post(`/api/v1/tables/${initial.id}/branch`)
            .send(command(done.revision, { sequence: seq }))
        ).status,
      ).toBe(500);
      expect(snapshot()).toEqual(beforeBranch);
    } finally {
      log.mockRestore();
    }
  });
  it("exports public decision-time features, explicit labels and a model-flagged practice link without outcome leakage", async () => {
    const initial = await start();
    await request(app)
      .post(`/api/v1/tables/${initial.id}/actions`)
      .send(command(0, { action: "fold" }));
    const seq = readEvents(db, initial.id).find(
      (e) => e.kind === "action" && e.payload.seat === 0,
    )!.sequence;
    // Independent label fixture: test selection/export semantics without claiming
    // that a randomly dealt fold must be a supported modeled error.
    db.prepare("DELETE FROM bot_decision_labels WHERE table_id=?").run(
      initial.id,
    );
    db.prepare("INSERT INTO bot_decision_labels VALUES(?,?,?)").run(
      initial.id,
      seq,
      JSON.stringify({
        source: "conditional-bot-model",
        analysisVersion: 7,
        modelRating: {
          version: 1,
          status: "estimated",
          score: 50,
          scoreInterval: [40, 60],
          regretBb: 1,
          regretIntervalBb: [0.5, 1.5],
          explanation: "Conditional fixture",
        },
      }),
    );
    const saved = snapshot();
    const response = await request(app).get(
      `/api/v1/tables/${initial.id}/decisions`,
    );
    const dataset = response.body as DecisionDataset;
    expect(dataset.practiceCandidates).toEqual([seq]);
    expect(dataset.examples).toHaveLength(1);
    const row = dataset.examples[0];
    expect(row.eligibleForTraining).toBe(true);
    expect(row.label?.modeledGap).toBe(true);
    expect(row.features).toEqual({
      street: "preflop",
      hero: initial.players[0].hole,
      board: [],
      pot: 15,
      toCall: 5,
      stack: 995,
      opponents: 1,
      dealer: 0,
      history: initial.history,
    });
    expect(row.chosen).toEqual({ action: "fold" });
    expect(row.groupId).toBe(`${initial.id}/1`);
    expect(JSON.stringify(dataset)).not.toMatch(
      /runout|seed|actualCards|profit|payout|actualProbability/,
    );
    expect(snapshot()).toEqual(saved);
  });
  it("imports existing saves once as honest partial checkpoints; deletion removes local journal and receipts", async () => {
    const old = runBots(createTable("legacy", 2, 7));
    db.prepare("INSERT INTO bot_tables VALUES(?,?)").run(
      old.id,
      JSON.stringify(old),
    );
    app = createApp(db);
    app = createApp(db);
    expect(readEvents(db, old.id)).toHaveLength(1);
    const history = (await request(app).get(`/api/v1/tables/${old.id}/events`))
      .body;
    expect(history.events[0]).toMatchObject({
      reason: "legacy",
      partial: true,
    });
    const done = (
      await request(app)
        .post(`/api/v1/tables/${old.id}/actions`)
        .send(command(0, { action: "fold" }))
    ).body;
    const dataset = (
      await request(app).get(`/api/v1/tables/${old.id}/decisions`)
    ).body;
    expect(dataset.examples[0].eligibleForTraining).toBe(false);
    expect(
      (
        await request(app)
          .delete(`/api/games/${old.id}`)
          .send({ revision: done.revision })
      ).status,
    ).toBe(204);
    for (const table of [
      "bot_table_events",
      "bot_decision_labels",
      "bot_command_requests",
      "bot_commands",
    ])
      expect(
        db
          .prepare(`SELECT COUNT(*) AS n FROM ${table} WHERE table_id=?`)
          .get(old.id),
      ).toEqual({ n: 0 });
  });
  it("recovers genuinely old mid-hand action metadata before journaling the next action", async () => {
    const legacy = runBots(createTable("old-format", 3, 42, 1, 1, 0, 1));
    expect(legacy.actor).toBe(0);
    for (const key of [
      "analysisVersion",
      "actions",
      "decisions",
      "policyEvents",
      "reads",
      "startingReads",
    ] as const)
      delete legacy[key];
    db.prepare("INSERT INTO bot_tables VALUES(?,?)").run(
      legacy.id,
      JSON.stringify(legacy),
    );
    app = createApp(db);
    const result = await request(app)
      .post(`/api/v1/tables/${legacy.id}/actions`)
      .send(command(0, { action: "fold" }));
    expect(result.status).toBe(200);
    const fresh = await request(createApp(db)).get(
      `/api/v1/tables/${legacy.id}`,
    );
    expect(fresh.status).toBe(200);
    expect(fresh.body).toEqual(result.body);
    const actions = readEvents(db, legacy.id).filter(
      (event) => event.kind === "action",
    );
    expect(actions[0]).toMatchObject({ payload: { seat: 0, action: "fold" } });
    expect(
      (await request(app).get(`/api/v1/tables/${legacy.id}/events`)).status,
    ).toBe(200);
  });
  it("reads calculations from a corrupt projection without writing or revealing private journal data", async () => {
    const initial = await start();
    db.prepare("UPDATE bot_tables SET state='invalid cache' WHERE id=?").run(
      initial.id,
    );
    const before = snapshot();
    const guide = await request(app)
      .post(`/api/tables/${initial.id}/guide`)
      .send({ revision: 0 });
    expect(guide.status).toBe(200);
    const context = await request(app)
      .post(`/api/tables/${initial.id}/assistant`)
      .send({ revision: 0, layer: "context" });
    expect(context.status).toBe(200);
    expect(snapshot()).toEqual(before);
    expect(JSON.stringify(context.body)).not.toMatch(/runout|actualCards|seed/);
  });
});
it("rebuilds a lost state projection from journal after reopening SQLite and replays persisted receipts", async () => {
  const directory = mkdtempSync(join(tmpdir(), "poker-events-"));
  const path = join(directory, "practice.sqlite");
  const first = openDatabase(path);
  let second: ReturnType<typeof openDatabase> | undefined;
  try {
    const firstApp = createApp(first);
    const initial = (
      await request(firstApp).post("/api/v1/tables").send({ players: 2 })
    ).body;
    const body = command(initial.revision, { action: "fold" });
    const done = (
      await request(firstApp)
        .post(`/api/v1/tables/${initial.id}/actions`)
        .send(body)
    ).body;
    first
      .prepare("UPDATE bot_tables SET state='invalid cache' WHERE id=?")
      .run(initial.id);
    first.close();
    second = openDatabase(path);
    const secondApp = createApp(second);
    const listed = (await request(secondApp).get("/api/games")).body.find(
      (game: { id: string }) => game.id === initial.id,
    );
    expect(listed).toMatchObject({
      revision: done.revision,
      players: 2,
      currentHand: 1,
      inProgress: false,
    });
    expect(
      (await request(secondApp).get(`/api/v1/tables/${initial.id}`)).body,
    ).toEqual(done);
    expect(
      (
        await request(secondApp)
          .post(`/api/v1/tables/${initial.id}/actions`)
          .send(body)
      ).body,
    ).toEqual(done);
    expect(
      readEvents(second, initial.id).filter(
        (e) => e.kind === "action" && e.payload.seat === 0,
      ),
    ).toHaveLength(1);
  } finally {
    if (first.open) first.close();
    second?.close();
    rmSync(directory, { recursive: true, force: true });
  }
});
