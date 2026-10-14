import { it, expect } from "vitest";
import { mkdtempSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import request from "supertest";
import { openDatabase } from "../apps/api/src/database";
import { createApp } from "../apps/api/src/app";
import {
  generateDecision,
  decisionSkills,
  selectDecisionSkill,
} from "../packages/poker/src/decision-generator";
import { gradeRead } from "../packages/poker/src/read-lesson";
import { validateCards } from "../packages/poker/src/index";
// CPU-bound exact-runout verification needs room for hosted-runner variance.
it("generates reproducible legal rank/board diversity for every skill and exact price answers", () => {
  let calls = 0,
    folds = 0,
    same = 0,
    changed = 0;
  for (const skill of decisionSkills) {
    const boards = new Set<string>(),
      rankBoards = new Set<string>();
    for (let seed = 0; seed < 12; seed++) {
      const q = generateDecision(seed, skill, "fixed");
      if (seed === 0) expect(generateDecision(seed, skill, "fixed")).toEqual(q);
      boards.add(q.board.join(""));
      rankBoards.add(q.board.map((c) => c[0]).join(""));
      for (const opponent of q.opponents)
        validateCards([...q.hole, ...q.board, ...opponent.cards], 7, 7);
      const equity = q.guide!.reduce(
        (sum, row) => sum + row.weight * row.equity,
        0,
      );
      const ev = (equity / 100) * (q.potBefore + 2 * q.bet) - q.bet;
      const counterEv =
        (equity / 100) * (q.potBefore + 2 * q.counterBet!) - q.counterBet!;
      const answer = gradeRead(
        q.variant,
        {
          step: "decision",
          pricePercent: (q.bet / (q.potBefore + 2 * q.bet)) * 100,
          action: ev > 0 ? "call" : "fold",
          counterAction: counterEv > 0 ? "call" : "fold",
          reason: "price",
        },
        q,
      );
      expect(answer.equity).toBeCloseTo(equity, 10);
      expect(answer.actionCorrect).toBe(true);
      expect(answer.counterCorrect).toBe(true);
      expect(q.bet).toBeGreaterThan(0);
      expect(q.counterBet).toBeGreaterThan(0);
      expect(q.counterBet).not.toBe(q.bet);
      if (ev > 0) calls++;
      else folds++;
      if (ev * counterEv > 0) same++;
      else changed++;
    }
    expect(boards.size).toBeGreaterThan(10);
    expect(rankBoards.size).toBeGreaterThan(8);
  }
  expect(calls).toBeGreaterThan(0);
  expect(folds).toBeGreaterThan(0);
  expect(same).toBeGreaterThan(0);
  expect(changed).toBeGreaterThan(0);
}, 60000);
it("uses only actual recorded errors to bias skill selection without excluding other skills", () => {
  const recent = [
    {
      skill: "conditional-overcards" as const,
      actionCorrect: false,
      counterCorrect: true,
      priceError: 12,
    },
  ];
  const count = (rows: typeof recent) =>
    Array.from(
      { length: 100 },
      (_, i) =>
        selectDecisionSkill(Math.floor((i * 4294967296) / 100), rows).skill,
    ).filter((skill) => skill === "conditional-overcards").length;
  expect(count(recent)).toBeGreaterThan(count([]));
  expect(selectDecisionSkill(0, recent).skill).toBe("flush-dominance");
  expect(selectDecisionSkill(4294967295, recent).skill).toBe("pair-and-draw");
});
it("persists generated snapshots, grades by ID, repeats cards, and retains legacy questions", async () => {
  const dir = mkdtempSync(join(tmpdir(), "generated-decisions-")),
    db = openDatabase(join(dir, "test.sqlite"));
  try {
    const app = createApp(db);
    const created = await request(app).post("/api/learning/read/").send({});
    expect(created.status).toBe(201);
    const q = created.body;
    expect(q.generatorVersion).toBe(1);
    const loaded = await request(app).get(`/api/learning/read/${q.id}`);
    expect(loaded.body).toEqual(q);
    const repeat = await request(app)
      .post("/api/learning/read/")
      .send({ repeatId: q.id });
    expect(repeat.status).toBe(201);
    expect(repeat.body.hole).toEqual(q.hole);
    expect(repeat.body.board).toEqual(q.board);
    expect(repeat.body.id).not.toBe(q.id);
    const equity = q.guide.reduce(
      (sum: number, row: { weight: number; equity: number }) =>
        sum + row.weight * row.equity,
      0,
    );
    const answered = await request(app)
      .post(`/api/learning/read/${q.id}/answer`)
      .send({
        step: "decision",
        pricePercent: 20,
        action: "fold",
        counterAction: "call",
        reason: "price",
      });
    expect(answered.status).toBe(200);
    expect(answered.body.equity).toBeCloseTo(equity, 10);
    const again = await request(app).get(`/api/learning/read/${q.id}`);
    expect(again.body.hole).toEqual(q.hole);
    expect(again.body.completed.decision).toEqual(answered.body);
    expect(
      (await request(app).post("/api/learning/read/").send({ variant: 2 })).body
        .hole,
    ).toEqual(["9h", "8h"]);
  } finally {
    db.close();
    rmSync(dir, { recursive: true, force: true });
  }
});

it("keeps straight-draw blockers off the flop instead of generating an already made straight", () => {
  const q = generateDecision(934831, "straight-redraws", "regression");
  const rankOrder = "23456789TJQKA";
  const held = new Set([...q.hole, ...q.board].map((card) => card[0]));
  for (let start = 0; start <= 8; start++)
    expect(
      [...rankOrder.slice(start, start + 5)].every((rank) => held.has(rank)),
    ).toBe(false);
  expect(["A", "2", "3", "4", "5"].every((rank) => held.has(rank))).toBe(false);
});
