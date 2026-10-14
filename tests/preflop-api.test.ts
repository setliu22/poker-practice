import { afterEach, beforeEach, describe, expect, it } from "vitest";
import request from "supertest";
import { createApp } from "../apps/api/src/app";
import { openDatabase } from "../apps/api/src/database";
import { act, createTable, type TableState } from "../packages/poker/src/table";
import { randomUUID } from "node:crypto";

let db: ReturnType<typeof openDatabase>, app: ReturnType<typeof createApp>;
beforeEach(() => {
  db = openDatabase(":memory:");
  app = createApp(db);
});
afterEach(() => db.close());
function save(state: TableState) {
  db.prepare("INSERT INTO bot_tables VALUES(?,?)").run(
    state.id,
    JSON.stringify(state),
  );
  db.prepare("INSERT INTO bot_games VALUES(?,?)").run(
    state.id,
    "2026-01-01T00:00:00Z",
  );
  db.prepare("INSERT INTO bot_game_numbers(table_id) VALUES(?)").run(state.id);
}
function stored(id: string) {
  return db.prepare("SELECT state FROM bot_tables WHERE id=?").get(id);
}
function changes() {
  return (db.prepare("SELECT total_changes() AS n").get() as { n: number }).n;
}

describe("local preflop guide API", () => {
  it("serves attributed illustrative charts locally with no misleading unsupported fallbacks", async () => {
    const result = await request(app).get("/api/preflop-charts");
    expect(result.status).toBe(200);
    expect(result.body).toHaveLength(14);
    expect(
      new Set(result.body.map((c: { players: number }) => c.players)),
    ).toEqual(new Set([2, 6, 9]));
    for (const chart of result.body) {
      expect(chart.status).toBe("illustrative");
      expect(chart.source.license).toBe("MIT");
      expect(chart.source.revision).toBe(
        "aed511d0451aea33a14f7e9204595fc2211f233f",
      );
      expect(chart.cells).toHaveLength(169);
      expect(chart.position).not.toBe("Big blind");
      expect(chart.limitations.join(" ")).toMatch(/solver/i);
    }
  });
  it("returns the same guide repeatedly without changing a hand, commands, stats or SQL rows", async () => {
    save(createTable("guide", 2, 3));
    const before = stored("guide"),
      beforeChanges = changes();
    const first = await request(app)
      .post("/api/tables/guide/guide")
      .send({ revision: 0 });
    const second = await request(app)
      .post("/api/tables/guide/guide")
      .send({ revision: 0 });
    expect(first.status).toBe(200);
    expect(first.body.status).toBe("available");
    expect(second.body).toEqual(first.body);
    expect(stored("guide")).toEqual(before);
    expect(changes()).toBe(beforeChanges);
    expect(db.prepare("SELECT COUNT(*) AS n FROM bot_commands").get()).toEqual({
      n: 0,
    });
    expect(
      db.prepare("SELECT COUNT(*) AS n FROM bot_hand_stats").get(),
    ).toEqual({ n: 0 });
    for (const property of [
      "players",
      "runout",
      "seed",
      "actualCards",
      "actualProbability",
      "comparison",
    ])
      expect(first.body).not.toHaveProperty(property);
  });
  it("validates requests and rejects stale, missing, completed and off-turn games", async () => {
    const state = createTable("validation", 2, 3);
    save(state);
    for (const body of [
      {},
      { revision: -1 },
      { revision: 0.5 },
      { revision: 0, cards: ["As", "Ks"] },
    ])
      expect(
        (await request(app).post("/api/tables/validation/guide").send(body))
          .status,
      ).toBe(400);
    expect(
      (
        await request(app)
          .post("/api/tables/validation/guide")
          .send({ revision: 1 })
      ).status,
    ).toBe(409);
    expect(
      (
        await request(app)
          .post("/api/tables/missing/guide")
          .send({ revision: 0 })
      ).status,
    ).toBe(404);
    state.actor = 1;
    db.prepare("UPDATE bot_tables SET state=? WHERE id=?").run(
      JSON.stringify(state),
      state.id,
    );
    expect(
      (
        await request(app)
          .post("/api/tables/validation/guide")
          .send({ revision: 0 })
      ).status,
    ).toBe(400);
    state.actor = 0;
    state.complete = true;
    db.prepare("UPDATE bot_tables SET state=? WHERE id=?").run(
      JSON.stringify(state),
      state.id,
    );
    expect(
      (
        await request(app)
          .post("/api/tables/validation/guide")
          .send({ revision: 0 })
      ).status,
    ).toBe(400);
    state.complete = false;
    state.players[0].folded = true;
    db.prepare("UPDATE bot_tables SET state=? WHERE id=?").run(
      JSON.stringify(state),
      state.id,
    );
    expect(
      (
        await request(app)
          .post("/api/tables/validation/guide")
          .send({ revision: 0 })
      ).status,
    ).toBe(400);
  });
  it("explains unsupported postflop spots instead of assigning a generic button chart", async () => {
    const state = createTable("flop", 2, 3);
    act(state, 0, "call");
    act(state, 1, "check");
    act(state, 1, "check");
    expect(state.street).toBe("flop");
    expect(state.actor).toBe(0);
    save(state);
    const before = stored("flop"),
      beforeChanges = changes();
    const result = await request(app)
      .post("/api/tables/flop/guide")
      .send({ revision: 0 });
    expect(result.status).toBe(200);
    expect(result.body.status).toBe("unavailable");
    expect(result.body.reason).toMatch(/preflop|postflop/i);
    expect(result.body).not.toHaveProperty("chart");
    expect(stored("flop")).toEqual(before);
    expect(changes()).toBe(beforeChanges);
  });
  it("persists a comparison in the decision review without awarding a poker-skill score", async () => {
    const state = createTable("review", 2, 3);
    state.players[0].hole = ["As", "Ah"];
    state.players[1].hole = ["Kd", "Qd"];
    state.runout = ["2s", "3h", "4d", "7c", "8s"];
    save(state);
    const result = await request(app)
      .post("/api/tables/review/actions")
      .send({ revision: 0, actionId: randomUUID(), action: "fold" });
    expect(result.status).toBe(200);
    expect(result.body.rounds[0].analysisVersion).toBe(7);
    expect(result.body.rounds[0].preflopGuide).toMatchObject({
      status: "available",
      hand: "AA",
      suggestedAction: "raise",
      comparison: { chosenAction: "fold", matches: false },
    });
    const reopened = await request(app).get("/api/tables/review");
    expect(reopened.body.rounds[0].preflopGuide).toEqual(
      result.body.rounds[0].preflopGuide,
    );
    const games = (await request(app).get("/api/games")).body;
    expect(games).toHaveLength(1);
    for (const game of games) expect(game.score).toBeNull();
    expect(games[0].modelRating).toBeDefined();
    const saved = JSON.parse(
      (stored(state.id) as { state: string }).state,
    ) as TableState;
    delete saved.rounds![0].modelRating;
    db.prepare("UPDATE bot_tables SET state=? WHERE id=?").run(
      JSON.stringify(saved),
      state.id,
    );
    const repaired = await request(app).get("/api/tables/review");
    expect(repaired.body.rounds[0].modelRating).toEqual(
      result.body.rounds[0].modelRating,
    );
  });
});
