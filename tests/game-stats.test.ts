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
  it("scores independently known pot-normalized loss after allowing sampling uncertainty", () => {
    expect(scoreDecision(round())).toEqual({
      street: "flop",
      loss: 20,
      score: 80,
    });
    expect(scoreDecision(round(8))).toEqual({
      street: "flop",
      loss: 0,
      score: 100,
    });
    expect(scoreDecision(round(200, 0))).toEqual({
      street: "flop",
      loss: 200,
      score: 0,
    });
    expect(scoreDecision(round(5, 0, 0))?.score).toBe(50);
  });
  it("excludes preflop and unreviewable choices and ignores hindsight", () => {
    expect(scoreDecision({ ...round(), street: "preflop" })).toBeNull();
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
  it("aggregates completed hands, profit and street scores without double counting or including unfinished hands", () => {
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
      expect(game.score).toBe(73);
      expect(game.decisions).toBe(3);
      expect(game.modelLoss).toBe(80);
      expect(game.streets).toEqual([
        { street: "flop", score: 80, decisions: 1 },
        { street: "turn", score: 100, decisions: 1 },
        { street: "river", score: 40, decisions: 1 },
      ]);
      expect(game.history.map((h) => h.profit)).toEqual([-20, 40]);
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
        decisions: 0,
      });
      await request(app)
        .post(`/api/tables/${first.body.id}/next`)
        .send({ revision: 1, actionId: randomUUID() });
      await request(app).post("/api/tables").send({ players: 3 });
      games = (await request(app).get("/api/games")).body;
      expect(games).toHaveLength(2);
      expect(
        games.find((g: { id: string }) => g.id === first.body.id).profit,
      ).toBe(-5);
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
