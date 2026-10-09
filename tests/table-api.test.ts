import { beforeEach, afterEach, describe, it, expect } from "vitest";
import request from "supertest";
import { randomUUID } from "node:crypto";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { openDatabase } from "../apps/api/src/database";
import { createApp } from "../apps/api/src/app";
import { createTable, type TableState } from "../packages/poker/src/table";
let db: ReturnType<typeof openDatabase>, app: ReturnType<typeof createApp>;
beforeEach(() => {
  db = openDatabase(":memory:");
  app = createApp(db);
});
afterEach(() => db.close());
describe("bot table API", () => {
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
    } finally {
      secondDb.close();
    }
  } finally {
    if (firstDb.open) firstDb.close();
    rmSync(dir, { recursive: true, force: true });
  }
});
