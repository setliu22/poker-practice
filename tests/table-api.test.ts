import { beforeEach, afterEach, describe, it, expect } from "vitest";
import request from "supertest";
import { randomUUID } from "node:crypto";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { openDatabase } from "../apps/api/src/database";
import { createApp } from "../apps/api/src/app";
import { saveHandStats } from "../apps/api/src/game-stats";
import {
  createTable,
  act,
  runBots,
  type TableState,
} from "../packages/poker/src/table";
let db: ReturnType<typeof openDatabase>, app: ReturnType<typeof createApp>;
beforeEach(() => {
  db = openDatabase(":memory:");
  app = createApp(db);
});
afterEach(() => db.close());
describe("bot table API", () => {
  it("creates an exact replay as a separate persistent game without rewriting the original result", async () => {
    const reads = [
      { seat: 0, decisions: 12, facing: 8, folds: 4, calls: 3, raises: 1 },
    ];
    const original = createTable(randomUUID(), 2, 123, 0, 4, 8, 2, reads);
    act(original, 0, "fold");
    const originalState = JSON.stringify(original);
    db.prepare("INSERT INTO bot_tables VALUES(?,?)").run(
      original.id,
      originalState,
    );
    db.prepare("INSERT INTO bot_games VALUES(?,?)").run(
      original.id,
      "2026-01-01T00:00:00.000Z",
    );
    db.prepare("INSERT INTO bot_game_numbers(table_id) VALUES(?)").run(
      original.id,
    );
    saveHandStats(db, original);
    const originalStats = db
      .prepare("SELECT data FROM bot_hand_stats WHERE table_id=?")
      .get(original.id);
    const input = { revision: original.revision, actionId: randomUUID() };
    const result = await request(app)
      .post(`/api/tables/${original.id}/replay`)
      .send(input);
    expect(result.status).toBe(201);
    expect(result.body.id).not.toBe(original.id);
    expect(result.body.replayOf).toEqual({
      tableId: original.id,
      handNumber: 4,
    });
    expect(result.body.revision).toBe(0);
    expect(result.body.complete).toBe(false);
    expect(result.body.handNumber).toBe(4);
    expect(result.body.dealer).toBe(0);
    expect(result.body.players[0].hole).toEqual(original.players[0].hole);
    expect(
      result.body.players.slice(1).every((p: { hole?: string[] }) => !p.hole),
    ).toBe(true);
    for (const hidden of [
      "seed",
      "runout",
      "reads",
      "startingReads",
      "analysisIdentity",
    ])
      expect(result.body).not.toHaveProperty(hidden);
    const storedReplay = JSON.parse(
      (
        db
          .prepare("SELECT state FROM bot_tables WHERE id=?")
          .get(result.body.id) as { state: string }
      ).state,
    ) as TableState;
    expect(storedReplay.startingReads).toEqual(reads);
    expect(storedReplay.reads).toEqual(reads);
    expect(storedReplay.seed).toBe(original.seed);
    expect(storedReplay.runout).toEqual(original.runout);
    expect(storedReplay.players.map((p) => p.hole)).toEqual(
      original.players.map((p) => p.hole),
    );
    expect(storedReplay.analysisIdentity).toBe(original.id);
    expect(
      db.prepare("SELECT state FROM bot_tables WHERE id=?").get(original.id),
    ).toEqual({ state: originalState });
    expect(
      db
        .prepare("SELECT data FROM bot_hand_stats WHERE table_id=?")
        .get(original.id),
    ).toEqual(originalStats);
    const games = (await request(app).get("/api/games")).body;
    expect(games).toHaveLength(2);
    expect(
      games.find((game: { id: string }) => game.id === original.id).profit,
    ).toBe(-5);
    expect(
      games.find((game: { id: string }) => game.id === result.body.id).profit,
    ).toBe(0);
    const played = await request(app)
      .post(`/api/tables/${result.body.id}/actions`)
      .send({ revision: 0, actionId: randomUUID(), action: "fold" });
    expect(played.status).toBe(200);
    expect(played.body.players.map((p: { stack: number }) => p.stack)).toEqual(
      original.players.map((p) => p.stack),
    );
    const retry = await request(app)
      .post(`/api/tables/${original.id}/replay`)
      .send(input);
    expect(retry.status).toBe(200);
    expect(retry.body).toEqual(result.body);
    expect(
      (
        db.prepare("SELECT COUNT(*) AS count FROM bot_tables").get() as {
          count: number;
        }
      ).count,
    ).toBe(2);
    app = createApp(db);
    expect(
      (await request(app).post(`/api/tables/${original.id}/replay`).send(input))
        .body,
    ).toEqual(result.body);
    expect(
      (
        await request(app).get(`/api/tables/${result.body.id}`)
      ).body.players.map((p: { stack: number }) => p.stack),
    ).toEqual(original.players.map((p) => p.stack));
  });
  it("validates replay inputs and requires a current completed hand", async () => {
    const active = createTable(randomUUID(), 2, 123);
    db.prepare("INSERT INTO bot_tables VALUES(?,?)").run(
      active.id,
      JSON.stringify(active),
    );
    expect(
      (
        await request(app)
          .post(`/api/tables/${active.id}/replay`)
          .send({ revision: 0, actionId: randomUUID() })
      ).status,
    ).toBe(400);
    expect(
      (
        await request(app)
          .post(`/api/tables/${active.id}/replay`)
          .send({ revision: 99, actionId: randomUUID() })
      ).status,
    ).toBe(409);
    expect(
      (
        await request(app)
          .post(`/api/tables/${active.id}/replay`)
          .send({ revision: 0, actionId: "not-an-id" })
      ).status,
    ).toBe(400);
    expect(
      (
        await request(app)
          .post(`/api/tables/${active.id}/replay`)
          .send({ revision: 0, actionId: randomUUID(), seed: 1 })
      ).status,
    ).toBe(400);
    expect(
      (
        await request(app)
          .post("/api/tables/missing/replay")
          .send({ revision: 0, actionId: randomUUID() })
      ).status,
    ).toBe(404);
    expect(
      db.prepare("SELECT state FROM bot_tables WHERE id=?").get(active.id),
    ).toEqual({ state: JSON.stringify(active) });
    expect(
      (
        db.prepare("SELECT COUNT(*) AS count FROM bot_commands").get() as {
          count: number;
        }
      ).count,
    ).toBe(0);
  });
  it("preserves legacy policy versions and the original starting bot responses", async () => {
    const original = runBots(createTable(randomUUID(), 3, 42, 1, 3, 0, 1));
    const initial = structuredClone(original);
    if (!original.complete) {
      act(original, 0, "fold");
      runBots(original);
    }
    expect(original.complete).toBe(true);
    delete original.policyVersion;
    db.prepare("INSERT INTO bot_tables VALUES(?,?)").run(
      original.id,
      JSON.stringify(original),
    );
    const result = await request(app)
      .post(`/api/tables/${original.id}/replay`)
      .send({ revision: 0, actionId: randomUUID() });
    expect(result.status).toBe(201);
    const replay = JSON.parse(
      (
        db
          .prepare("SELECT state FROM bot_tables WHERE id=?")
          .get(result.body.id) as { state: string }
      ).state,
    ) as TableState;
    expect(replay.policyVersion).toBe(1);
    expect(replay.history).toEqual(initial.history);
    expect(replay.players).toEqual(initial.players);
    expect(replay.runout).toEqual(initial.runout);
  });
  it("validates player count and keeps bot cards private", async () => {
    for (const players of [1, 10, 2.5])
      expect(
        (await request(app).post("/api/tables").send({ players })).status,
      ).toBe(400);
    const r = await request(app).post("/api/tables").send({ players: 9 });
    expect(r.status).toBe(201);
    expect(r.body.players).toHaveLength(9);
    expect(r.body.players[1].name).toBe("Mara");
    expect(r.body.players[1].profile.style).toBe("Patient trapper");
    expect(JSON.stringify(r.body)).not.toContain("tuning");
    expect(r.body).not.toHaveProperty("reads");
    expect(r.body).not.toHaveProperty("policyEvents");
    expect(r.body).not.toHaveProperty("seed");
    if (!r.body.complete)
      expect(
        r.body.players.slice(1).every((p: { hole?: string[] }) => !p.hole),
      ).toBe(true);
  });
  it("retrieves saved tables through a fresh app and rejects unknown ids", async () => {
    const r = await request(app).post("/api/tables").send({ players: 2 });
    app = createApp(db);
    expect((await request(app).get("/api/tables/" + r.body.id)).body).toEqual(
      r.body,
    );
    expect((await request(app).get("/api/tables/unknown")).status).toBe(404);
  });
  it("grades actions on the server, replays identical commands and rejects stale revisions", async () => {
    const r = await request(app).post("/api/tables").send({ players: 2 });
    const body = { revision: 0, actionId: randomUUID(), action: "fold" };
    const first = await request(app)
      .post(`/api/tables/${r.body.id}/actions`)
      .send(body);
    expect(first.status).toBe(200);
    expect(first.body.complete).toBe(true);
    const again = await request(app)
      .post(`/api/tables/${r.body.id}/actions`)
      .send(body);
    expect(again.body).toEqual(first.body);
    expect(
      (
        await request(app)
          .post(`/api/tables/${r.body.id}/actions`)
          .send({ ...body, actionId: randomUUID() })
      ).status,
    ).toBe(409);
  });
  it("deals next hands once, rotating the dealer and resetting stacks", async () => {
    const s = createTable(randomUUID(), 2, 1);
    s.reads = [
      { seat: 0, decisions: 20, facing: 15, folds: 10, calls: 3, raises: 2 },
    ];
    s.complete = true;
    s.actor = null;
    db.prepare("INSERT INTO bot_tables VALUES(?,?)").run(
      s.id,
      JSON.stringify(s),
    );
    const body = { revision: 0, actionId: randomUUID() };
    const r = await request(app).post(`/api/tables/${s.id}/next`).send(body);
    expect(r.status).toBe(200);
    expect(r.body.handNumber).toBe(2);
    expect(r.body.dealer).toBe(1);
    expect(r.body.players[1].name).toBe("Mara");
    expect(
      (await request(app).post(`/api/tables/${s.id}/next`).send(body)).body,
    ).toEqual(r.body);
    const stored = JSON.parse(
      (
        db.prepare("SELECT state FROM bot_tables WHERE id=?").get(s.id) as {
          state: string;
        }
      ).state,
    ) as TableState;
    expect(stored.startingReads).toEqual(s.reads);
    expect(stored.policyVersion).toBe(2);
    expect(
      stored.players.reduce(
        (sum, p) => sum + p.stack + (stored.complete ? 0 : p.contributed),
        0,
      ),
    ).toBe(2000);
  });
  it("does not advance after invalid actions or unfinished next-hand requests", async () => {
    const r = await request(app).post("/api/tables").send({ players: 2 });
    const id = r.body.id;
    expect(
      (
        await request(app)
          .post(`/api/tables/${id}/next`)
          .send({ revision: 0, actionId: randomUUID() })
      ).status,
    ).toBe(400);
    expect(
      (
        await request(app).post(`/api/tables/${id}/actions`).send({
          revision: 0,
          actionId: randomUUID(),
          action: "raise",
          amount: 5000,
        })
      ).status,
    ).toBe(400);
    expect((await request(app).get(`/api/tables/${id}`)).body.revision).toBe(0);
  });
});

it("retains a completed bot hand and idempotency receipts after reopening SQLite", async () => {
  const dir = mkdtempSync(join(tmpdir(), "poker-table-"));
  const file = join(dir, "table.sqlite");
  const firstDb = openDatabase(file);
  try {
    const firstApp = createApp(firstDb);
    const created = await request(firstApp)
      .post("/api/tables")
      .send({ players: 2 });
    const body = { revision: 0, actionId: randomUUID(), action: "fold" };
    const finished = await request(firstApp)
      .post(`/api/tables/${created.body.id}/actions`)
      .send(body);
    const replayInput = {
      revision: finished.body.revision,
      actionId: randomUUID(),
    };
    const replay = await request(firstApp)
      .post(`/api/tables/${created.body.id}/replay`)
      .send(replayInput);
    expect(replay.status).toBe(201);
    firstDb.close();
    const secondDb = openDatabase(file);
    try {
      const secondApp = createApp(secondDb);
      expect(
        (await request(secondApp).get(`/api/tables/${created.body.id}`)).body,
      ).toEqual(finished.body);
      expect(
        (
          await request(secondApp)
            .post(`/api/tables/${created.body.id}/actions`)
            .send(body)
        ).body,
      ).toEqual(finished.body);
      expect(
        (await request(secondApp).get(`/api/tables/${replay.body.id}`)).body,
      ).toEqual(replay.body);
      expect(
        (
          await request(secondApp)
            .post(`/api/tables/${created.body.id}/replay`)
            .send(replayInput)
        ).body,
      ).toEqual(replay.body);
      expect((await request(secondApp).get("/api/games")).body).toHaveLength(2);
    } finally {
      secondDb.close();
    }
  } finally {
    if (firstDb.open) firstDb.close();
    rmSync(dir, { recursive: true, force: true });
  }
});
