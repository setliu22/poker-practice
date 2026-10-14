import { beforeEach, afterEach, describe, expect, it } from "vitest";
import request from "supertest";
import { createApp } from "../apps/api/src/app";
import { openDatabase } from "../apps/api/src/database";
import { createTable } from "../packages/poker/src/table";

let db: ReturnType<typeof openDatabase>, app: ReturnType<typeof createApp>;
beforeEach(() => {
  db = openDatabase(":memory:");
  app = createApp(db);
});
afterEach(() => db.close());
const stored = (id: string) =>
  (
    db.prepare("SELECT state FROM bot_tables WHERE id=?").get(id) as {
      state: string;
    }
  ).state;
const changes = () =>
  (db.prepare("SELECT total_changes() AS n").get() as { n: number }).n;
function save(id: string, players = 2) {
  const state = createTable(id, players, 1);
  db.prepare("INSERT INTO bot_tables VALUES(?,?)").run(
    id,
    JSON.stringify(state),
  );
  return state;
}
describe("read-only live odds endpoint", () => {
  it("does not mutate game, revision, commands, stats or DB rows; repeats share cached results", async () => {
    save("read-only", 3);
    const before = stored("read-only"),
      beforeChanges = changes();
    const a = await request(app)
      .post("/api/tables/read-only/odds")
      .send({ revision: 0 });
    const b = await request(app)
      .post("/api/tables/read-only/odds")
      .send({ revision: 0 });
    expect(a.status).toBe(200);
    expect(b.body).toEqual(a.body);
    expect(a.body).toMatchObject({
      revision: 0,
      handNumber: 1,
      street: "preflop",
      opponents: 2,
      source: "random-hands",
    });
    expect(stored("read-only")).toBe(before);
    expect(changes()).toBe(beforeChanges);
    expect(db.prepare("SELECT COUNT(*) AS n FROM bot_commands").get()).toEqual({
      n: 0,
    });
    expect(
      db.prepare("SELECT COUNT(*) AS n FROM bot_hand_stats").get(),
    ).toEqual({ n: 0 });
    expect(a.body).not.toHaveProperty("actualProbability");
  });
  it("validates revision, disallows hidden inputs, missing/finished/folded games", async () => {
    const s = save("validation");
    for (const body of [
      {},
      { revision: -1 },
      { revision: 0.5 },
      { revision: 0, cards: ["As", "Ks"] },
    ])
      expect(
        (await request(app).post("/api/tables/validation/odds").send(body))
          .status,
      ).toBe(400);
    expect(
      (
        await request(app)
          .post("/api/tables/validation/odds")
          .send({ revision: 1 })
      ).status,
    ).toBe(409);
    expect(
      (
        await request(app)
          .post("/api/tables/missing/odds")
          .send({ revision: 0 })
      ).status,
    ).toBe(404);
    s.players[0].folded = true;
    db.prepare("UPDATE bot_tables SET state=? WHERE id=?").run(
      JSON.stringify(s),
      s.id,
    );
    expect(
      (
        await request(app)
          .post("/api/tables/validation/odds")
          .send({ revision: 0 })
      ).status,
    ).toBe(400);
    s.players[0].folded = false;
    s.complete = true;
    db.prepare("UPDATE bot_tables SET state=? WHERE id=?").run(
      JSON.stringify(s),
      s.id,
    );
    expect(
      (
        await request(app)
          .post("/api/tables/validation/odds")
          .send({ revision: 0 })
      ).status,
    ).toBe(400);
  });
  it("keeps the API responsive and rejects estimates made stale by another action", async () => {
    const state = save("concurrent", 8);
    let finished = false;
    const promise = request(app)
      .post("/api/tables/concurrent/odds")
      .send({ revision: 0 })
      .then((r) => {
        finished = true;
        return r;
      });
    const health = await request(app).get("/api/health");
    expect(health.status).toBe(200);
    expect(finished).toBe(false);
    state.revision++;
    db.prepare("UPDATE bot_tables SET state=? WHERE id=?").run(
      JSON.stringify(state),
      state.id,
    );
    expect((await promise).status).toBe(409);
  });
});
