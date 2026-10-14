import { it, expect } from "vitest";
import solver from "pokersolver";
import { best, compare, deck } from "../packages/poker/src/index";
import {
  readQuestion,
  updateRange,
  gradeRead,
  classifyTurn,
  weightedFlopEquity,
} from "../packages/poker/src/read-lesson";
import { openDatabase } from "../apps/api/src/database";
import { createApp } from "../apps/api/src/app";
import request from "supertest";
import { mkdtempSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
it("updates normalized priors using action likelihood, rejects impossible observations", () => {
  expect(updateRange([0.8, 0.2], [0.5, 1])).toEqual([2 / 3, 1 / 3]);
  expect(updateRange([0.8, 0.2], [1, 0.1])[1]).toBeCloseTo(1 / 41);
  expect(() => updateRange([0.8, 0.2], [0, 0])).toThrow("impossible");
  expect(() => updateRange([0.8, 0.8], [1, 1])).toThrow();
  expect(() => updateRange([1], [NaN])).toThrow();
});
it("distinguishes completing a flush, pairing, and a blocked heart", () => {
  const hero = ["9h", "8h"],
    flop = ["Ah", "Kh", "2c"];
  expect(classifyTurn(hero, flop, ["Ac", "Qd"], "4h")).toBe("ahead");
  expect(classifyTurn(hero, flop, ["Qh", "Jh"], "4h")).toBe("behind");
  expect(classifyTurn(hero, flop, ["Ac", "Qd"], "9c")).toBe("behind");
  expect(classifyTurn(hero, flop, ["Qh", "Jh"], "9c")).toBe("ahead");
  expect(classifyTurn(hero, flop, ["Qh", "Jh"], "Qh")).toBe("blocked");
  expect(
    compare(
      best([...hero, ...flop, "2d", "2s"]),
      best(["Qh", "Jh", ...flop, "2d", "2s"]),
    ),
  ).toBe(0);
});
it("checks every legal runout against independent pokersolver, including ties", () => {
  const hero = ["9h", "8h"],
    flop = ["Ah", "Kh", "2c"];
  const range = [
    { cards: ["Ac", "Qd"], weight: 0.5 },
    { cards: ["Qh", "Jh"], weight: 0.5 },
  ];
  const calculated = weightedFlopEquity(hero, flop, range);
  range.forEach((op, i) => {
    const left = deck.filter(
      (c) => ![...hero, ...flop, ...op.cards].includes(c),
    );
    let wins = 0,
      ties = 0,
      total = 0;
    for (let a = 0; a < left.length; a++)
      for (let b = a + 1; b < left.length; b++) {
        const board = [...flop, left[a], left[b]],
          h = solver.Hand.solve([...hero, ...board]),
          v = solver.Hand.solve([...op.cards, ...board]);
        const winners = solver.Hand.winners([h, v]);
        total++;
        if (winners.length === 2) ties++;
        else if (winners[0] === h) wins++;
      }
    expect(calculated.rows[i]).toMatchObject({ wins, ties, total });
  });
  expect(calculated.rows[0]).toMatchObject({ wins: 367, ties: 0, total: 990 });
  expect(calculated.rows[1]).toMatchObject({ wins: 153, ties: 13, total: 990 });
  expect(() =>
    weightedFlopEquity(hero, flop, [{ cards: ["Ah", "Qd"], weight: 1 }]),
  ).toThrow();
}, 20000);
it("uses updated equity including ties and the correct all-in price, changing the decision only with tendencies", () => {
  const f = gradeRead(0, {
    step: "decision",
    equityPercent: 30,
    action: "fold",
    reason: "price",
  });
  expect(f.required).toBeCloseTo((100 / 300) * 100);
  expect(f.equity).toBeCloseTo(30.084175084);
  expect(f.callEv).toBeCloseTo(-9.747474747);
  expect(f.actionCorrect).toBe(true);
  expect(f.equity).toBeCloseTo(f.winPercent! + f.tiePercent! / 2);
  const g = gradeRead(1, {
    step: "decision",
    equityPercent: 36.6,
    action: "call",
    reason: "hit",
  });
  expect(g.callEv).toBeGreaterThan(0);
  expect(g.actionCorrect).toBe(true);
  expect(g.reasonCorrect).toBe(false);
});
it("enforces steps, hides unsubmitted answers, persists, exports and clears learning attempts", async () => {
  const dir = mkdtempSync(join(tmpdir(), "read-lesson-"));
  let db = openDatabase(join(dir, "data.sqlite"));
  try {
    let app = createApp(db);
    const q = await request(app)
      .post("/api/learning/read")
      .send({ variant: 0 });
    expect(q.status).toBe(201);
    expect(q.body.completed).toEqual({});
    expect(q.body).not.toHaveProperty("equity");
    const url = `/api/learning/read/${q.body.id}/answer`;
    expect(
      (
        await request(app).post(url).send({
          step: "decision",
          equityPercent: 30,
          action: "fold",
          reason: "price",
        })
      ).status,
    ).toBe(409);
    expect(
      (await request(app).post(url).send({ step: "range", drawPercent: 101 }))
        .status,
    ).toBe(400);
    const r = await request(app)
      .post(url)
      .send({ step: "range", drawPercent: 33 });
    const again = await request(app)
      .post(url)
      .send({ step: "range", drawPercent: 80 });
    expect(again.body).toEqual(r.body);
    const beforeRetry = (await request(app).get("/api/learning/read/progress"))
      .body;
    const retryUrl = `/api/learning/read/${q.body.id}/retry-answer`;
    const retried = await request(app)
      .post(retryUrl)
      .send({ step: "range", drawPercent: 80 });
    expect(retried.status).toBe(200);
    expect(retried.body.errorPp).toBeCloseTo(80 - 100 / 3);
    expect(
      (await request(app).get("/api/learning/read/progress")).body,
    ).toEqual(beforeRetry);
    expect(
      (await request(app).get(`/api/learning/read/${q.body.id}`)).body.completed
        .range,
    ).toEqual(r.body);
    expect(
      (
        await request(app)
          .post(retryUrl)
          .send({ step: "range", drawPercent: -1 })
      ).status,
    ).toBe(400);
    expect(
      (
        await request(app)
          .post(retryUrl)
          .send({ step: "cards", outcomes: Array(6).fill("ahead") })
      ).status,
    ).toBe(409);
    expect(
      (
        await request(app)
          .post("/api/learning/read/missing/retry-answer")
          .send({ step: "range", drawPercent: 30 })
      ).status,
    ).toBe(404);

    await request(app)
      .post(url)
      .send({
        step: "cards",
        outcomes: ["ahead", "behind", "behind", "ahead", "ahead", "blocked"],
      });
    await request(app).post(url).send({
      step: "decision",
      equityPercent: 30,
      action: "fold",
      reason: "price",
    });
    db.close();
    db = openDatabase(join(dir, "data.sqlite"));
    app = createApp(db);
    expect(
      (await request(app).get(`/api/learning/read/${q.body.id}`)).body.completed
        .decision.actionCorrect,
    ).toBe(true);
    expect(
      (await request(app).get("/api/learning/read/progress")).body.completed,
    ).toBe(1);
    expect(
      (await request(app).get("/api/export")).body.readLessonAttempts,
    ).toHaveLength(3);
    await request(app).delete("/api/progress");
    expect(
      (await request(app).get("/api/learning/read/progress")).body.completed,
    ).toBe(0);
  } finally {
    db.close();
    rmSync(dir, { recursive: true, force: true });
  }
});
it("varies decision contexts and range weights while preserving both all-in price comparisons", () => {
  const titles = new Set<string>();
  let same = 0,
    changed = 0;
  for (let variant = 2; variant < 38; variant++) {
    const q = readQuestion(variant, "test");
    titles.add(q.title);
    const equity = q.guide!.reduce(
      (sum, row) => sum + row.weight * row.equity,
      0,
    );
    const ev = (equity / 100) * (q.potBefore + 2 * q.bet) - q.bet;
    const counterEv =
      (equity / 100) * (q.potBefore + 2 * q.counterBet!) - q.counterBet!;
    const result = gradeRead(variant, {
      step: "decision",
      pricePercent: (q.bet / (q.potBefore + 2 * q.bet)) * 100,
      action: ev > 0 ? "call" : "fold",
      counterAction: counterEv > 0 ? "call" : "fold",
      reason: "price",
    });
    expect(result.actionCorrect).toBe(true);
    expect(result.counterCorrect).toBe(true);
    expect(result.priceError).toBeCloseTo(0);
    expect(result.errorPp).toBeUndefined();
    expect(result.reasonCorrect).toBeUndefined();
    if (ev * counterEv > 0) same++;
    else changed++;
  }
  expect(titles.size).toBe(6);
  expect(same).toBeGreaterThan(0);
  expect(changed).toBeGreaterThan(0);
  expect(readQuestion(2, "a").opponents[0].prior).not.toBe(
    readQuestion(8, "b").opponents[0].prior,
  );
});
it("new decisions skip retired sections and omit skipped equity from history metrics", async () => {
  const dir = mkdtempSync(join(tmpdir(), "decision-practice-"));
  const db = openDatabase(join(dir, "test.sqlite"));
  try {
    const app = createApp(db);
    const created = await request(app)
      .post("/api/learning/read/")
      .send({ variant: 2 });
    expect(created.status).toBe(201);
    const answered = await request(app)
      .post(`/api/learning/read/${created.body.id}/answer`)
      .send({
        step: "decision",
        pricePercent: 20,
        action: "call",
        counterAction: "fold",
        reason: "price",
      });
    expect(answered.status).toBe(200);
    const progress = await request(app).get("/api/learning/read/progress");
    expect(progress.body.completed).toBe(1);
    expect(progress.body.equityError).toBeNull();
    expect(progress.body.reasonsCorrect).toBe(0);
    expect(
      (await request(app).post("/api/learning/read/").send({ variant: 0 }))
        .status,
    ).toBe(201);
  } finally {
    db.close();
    rmSync(dir, { recursive: true, force: true });
  }
});
