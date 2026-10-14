import { describe, it, expect } from "vitest";
import request from "supertest";
import { randomUUID } from "node:crypto";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  scoreDecision,
  saveHandStats,
  gameStats,
} from "../apps/api/src/game-stats";
import { openDatabase } from "../apps/api/src/database";
import { createApp } from "../apps/api/src/app";
import { createTable } from "../packages/poker/src/table";
import type { DecisionReview } from "../packages/shared/src/table";
function round(gap = 30, margin = 5, pot = 100): DecisionReview {
  return {
    analysisVersion: 2,
    comparisons: [
      {
        key: "raise",
        difference: gap,
        margin,
        samples: 640,
        clear: gap > margin,
      },
    ],
    street: "flop",
    chosenKey: "check",
    pot,
    values: [
      { key: "check", chips: 10, margin },
      { key: "raise", chips: 10 + gap, margin },
    ],
  } as DecisionReview;
}
describe("game decision scoring", () => {
  it("never converts precise bot-model estimates into poker-skill grades", () => {
    for (const r of [round(), round(8), round(200, 0), round(5, 0, 0)])
      expect(scoreDecision(r)).toMatchObject({
        street: "flop",
        loss: null,
        score: null,
        status: "model-only",
      });
  });
  it("keeps preflop reviews model-only, excludes unreviewable choices and ignores hindsight", () => {
    expect(scoreDecision({ ...round(), street: "preflop" })).toMatchObject({
      status: "model-only",
      score: null,
    });
    expect(scoreDecision({ ...round(), chosenKey: "missing" })).toBeNull();
    expect(scoreDecision({ ...round(), values: [] })).toBeNull();
    expect(
      scoreDecision({
        ...round(),
        actualProbability: {
          win: 100,
          tie: 0,
          lose: 0,
          share: 100,
          exact: true,
          samples: 1,
          note: "",
        },
      }),
    ).toEqual(scoreDecision(round()));
  });
  it("aggregates completed hands and profit without presenting model outcomes as scores", () => {
    const db = openDatabase(":memory:");
    try {
      const s = createTable("game", 2, 1);
      db.prepare("INSERT INTO bot_tables VALUES(?,?)").run(
        s.id,
        JSON.stringify(s),
      );
      db.prepare("INSERT INTO bot_games VALUES(?,?)").run(
        s.id,
        "2026-10-08T00:00:00Z",
      );
      saveHandStats(db, s);
      expect(gameStats(db)[0].hands).toBe(0);
      s.complete = true;
      s.players[0].stack = 1040;
      s.rounds = [
        round(),
        { ...round(0), street: "turn" },
        { ...round(), street: "preflop" },
      ];
      saveHandStats(db, s);
      saveHandStats(db, s);
      s.handNumber = 2;
      s.players[0].stack = 980;
      s.rounds = [{ ...round(60, 0), street: "river" }];
      saveHandStats(db, s);
      const game = gameStats(db)[0];
      expect(game.hands).toBe(2);
      expect(game.profit).toBe(20);
      expect(game.score).toBeNull();
      expect(game.decisions).toBe(4);
      expect(game.scoredDecisions).toBe(0);
      expect(game.unscoredDecisions).toBe(4);
      expect(game.modelLoss).toBe(0);
      expect(game.streets).toEqual([]);
      expect(game.history.map((h) => h.profit)).toEqual([-20, 40]);
      expect(game.history.every((h) => h.score === null)).toBe(true);
    } finally {
      db.close();
    }
  });
  it("persists separate games, completed profit and idempotent receipts across SQLite restarts", async () => {
    const dir = mkdtempSync(join(tmpdir(), "poker-games-"));
    let db = openDatabase(join(dir, "games.sqlite"));
    try {
      let app = createApp(db);
      const first = await request(app).post("/api/tables").send({ players: 2 });
      const command = { revision: 0, actionId: randomUUID(), action: "fold" };
      await request(app)
        .post(`/api/tables/${first.body.id}/actions`)
        .send(command);
      await request(app)
        .post(`/api/tables/${first.body.id}/actions`)
        .send(command);
      let games = (await request(app).get("/api/games")).body;
      expect(games[0]).toMatchObject({
        hands: 1,
        profit: -5,
        score: null,
        decisions: 1,
      });
      const next = await request(app)
        .post(`/api/tables/${first.body.id}/next`)
        .send({ revision: 1, actionId: randomUUID() });
      await request(app).post("/api/tables").send({ players: 3 });
      games = (await request(app).get("/api/games")).body;
      expect(games).toHaveLength(2);
      expect(
        games.find((g: { id: string }) => g.id === first.body.id).profit,
      ).toBe(-5 + (next.body.complete ? next.body.players[0].stack - 1000 : 0));
      expect(JSON.stringify(games)).not.toContain('"hole"');
      db.close();
      db = openDatabase(join(dir, "games.sqlite"));
      app = createApp(db);
      expect((await request(app).get("/api/games")).body).toEqual(games);
    } finally {
      db.close();
      rmSync(dir, { recursive: true, force: true });
    }
  });
});

describe("game management", () => {
  it("deletes only the selected game and its receipts/stats, with safe retries and stable numbering", async () => {
    const dir = mkdtempSync(join(tmpdir(), "poker-delete-"));
    let db = openDatabase(join(dir, "games.sqlite"));
    try {
      let app = createApp(db);
      const first = (
        await request(app).post("/api/tables").send({ players: 2 })
      ).body;
      const second = (
        await request(app).post("/api/tables").send({ players: 2 })
      ).body;
      const command = { revision: 0, actionId: randomUUID(), action: "fold" };
      await request(app).post(`/api/tables/${first.id}/actions`).send(command);
      expect(
        (
          await request(app)
            .delete(`/api/games/${first.id}`)
            .send({ revision: 1 })
        ).status,
      ).toBe(204);
      expect(
        (
          await request(app)
            .delete(`/api/games/${first.id}`)
            .send({ revision: 1 })
        ).status,
      ).toBe(204);
      for (const table of [
        "bot_tables",
        "bot_games",
        "bot_commands",
        "bot_hand_stats",
        "bot_game_numbers",
      ]) {
        const key = table === "bot_tables" ? "id" : "table_id";
        expect(
          db
            .prepare(`SELECT count(*) AS count FROM ${table} WHERE ${key}=?`)
            .get(first.id),
        ).toEqual({ count: 0 });
      }
      expect(
        (
          await request(app)
            .post(`/api/tables/${first.id}/actions`)
            .send(command)
        ).status,
      ).toBe(404);
      const third = (
        await request(app).post("/api/tables").send({ players: 3 })
      ).body;
      let games = (await request(app).get("/api/games")).body;
      expect(games.map((g: { gameNumber: number }) => g.gameNumber)).toEqual([
        3, 2,
      ]);
      expect((await request(app).get(`/api/tables/${second.id}`)).status).toBe(
        200,
      );
      db.close();
      db = openDatabase(join(dir, "games.sqlite"));
      app = createApp(db);
      expect((await request(app).get(`/api/tables/${first.id}`)).status).toBe(
        404,
      );
      expect((await request(app).get("/api/games")).body).toEqual(games);
      expect(games[0].id).toBe(third.id);
    } finally {
      db.close();
      rmSync(dir, { recursive: true, force: true });
    }
  });
  it("validates deletion and rejects stale revisions without changing a game", async () => {
    const db = openDatabase(":memory:");
    try {
      const app = createApp(db);
      const game = (await request(app).post("/api/tables").send({ players: 2 }))
        .body;
      for (const body of [
        {},
        { revision: -1 },
        { revision: 0, unexpected: true },
      ]) {
        expect(
          (await request(app).delete(`/api/games/${game.id}`).send(body))
            .status,
        ).toBe(400);
      }
      await request(app)
        .post(`/api/tables/${game.id}/actions`)
        .send({ revision: 0, actionId: randomUUID(), action: "fold" });
      expect(
        (
          await request(app)
            .delete(`/api/games/${game.id}`)
            .send({ revision: 0 })
        ).status,
      ).toBe(409);
      expect((await request(app).get("/api/games")).body[0]).toMatchObject({
        revision: 1,
        hands: 1,
        profit: -5,
      });
    } finally {
      db.close();
    }
  });
  it("rolls back dependent deletions when deleting the table fails", async () => {
    const db = openDatabase(":memory:");
    try {
      const app = createApp(db);
      const game = (await request(app).post("/api/tables").send({ players: 2 }))
        .body;
      await request(app)
        .post(`/api/tables/${game.id}/actions`)
        .send({ revision: 0, actionId: randomUUID(), action: "fold" });
      db.exec(
        "CREATE TRIGGER refuse_table_delete BEFORE DELETE ON bot_tables BEGIN SELECT RAISE(ABORT, 'test failure'); END",
      );
      const result = await request(app)
        .delete(`/api/games/${game.id}`)
        .send({ revision: 1 });
      expect(result.status).toBe(500);
      for (const table of [
        "bot_tables",
        "bot_games",
        "bot_commands",
        "bot_hand_stats",
        "bot_game_numbers",
      ]) {
        const key = table === "bot_tables" ? "id" : "table_id";
        expect(
          db
            .prepare(`SELECT count(*) AS count FROM ${table} WHERE ${key}=?`)
            .get(game.id),
        ).toEqual({ count: 1 });
      }
    } finally {
      db.close();
    }
  });
});

it.each([undefined, 1, 2, 3, 4])(
  "hides historical score version %s without needing its review frames",
  (scoringVersion) => {
    const db = openDatabase(":memory:");
    try {
      const state = createTable("legacy-score", 2, 1);
      db.prepare("INSERT INTO bot_tables VALUES(?,?)").run(
        state.id,
        JSON.stringify(state),
      );
      db.prepare("INSERT INTO bot_games VALUES(?,?)").run(
        state.id,
        "2026-10-08T00:00:00Z",
      );
      db.prepare("INSERT INTO bot_hand_stats VALUES(?,?,?)").run(
        state.id,
        1,
        JSON.stringify({
          scoringVersion,
          handNumber: 1,
          profit: 20,
          completedAt: "2026-10-08T01:00:00Z",
          decisions: [
            {
              street: "flop",
              score: 100,
              loss: 0,
              status: scoringVersion ? "scored" : undefined,
            },
          ],
        }),
      );
      expect(gameStats(db)[0]).toMatchObject({
        profit: 20,
        score: null,
        decisions: 1,
        scoredDecisions: 0,
        unscoredDecisions: 1,
      });
      expect(gameStats(db)[0].history[0]).toMatchObject({
        score: null,
        decisions: [{ status: "model-only", score: null, loss: null }],
      });
      expect(gameStats(db)[0].modelLoss).toBe(0);
      expect(gameStats(db)[0].streets).toEqual([]);
    } finally {
      db.close();
    }
  },
);
