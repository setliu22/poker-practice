import { beforeEach, afterEach, describe, it, expect, vi } from "vitest";
import request from "supertest";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { openDatabase } from "../apps/api/src/database";
import { createApp } from "../apps/api/src/app";
import type {
  CashAnswer,
  CashDrillSpecification,
  CashQuestion,
} from "../packages/shared/src/cash-practice";
import * as engine from "../packages/poker/src/cash-practice";

let db: ReturnType<typeof openDatabase>,
  app: ReturnType<typeof createApp>,
  dir: string,
  path: string;
const base = "/api/cash-practice";
beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), "cash-practice-"));
  path = join(dir, "test.sqlite");
  db = openDatabase(path);
  app = createApp(db);
});
afterEach(() => {
  vi.restoreAllMocks();
  db.close();
  rmSync(dir, { recursive: true, force: true });
});

/** Manual river fixture: half the range beats aces, half loses; call price is 5/25. */
function fixture(id: string): CashDrillSpecification {
  const initial: CashQuestion = {
    phase: "initial",
    skill: "bluff-catch",
    title: "Manual river call",
    tablePlayers: 3,
    activePlayers: 2,
    heroSeat: 0,
    dealerSeat: 0,
    startingStackBb: 100,
    effectiveStackBb: 92.75,
    seats: [
      {
        seat: 0,
        position: "Button",
        label: "You",
        status: "active",
        stackBb: 92.75,
      },
      {
        seat: 1,
        position: "Small blind",
        label: "SB",
        status: "folded",
        stackBb: 99.5,
      },
      {
        seat: 2,
        position: "Big blind",
        label: "BB",
        status: "active",
        stackBb: 87.75,
      },
    ],
    hole: ["As", "Ad"],
    board: ["Kc", "Qd", "9h", "5s", "2c"],
    potBb: 20,
    callBb: 5,
    betBb: 0,
    rakeBb: 0,
    history: [
      {
        street: "preflop",
        seat: 1,
        action: "small-blind",
        streetTotalBb: 0.5,
        label: "SB posts 0.5",
      },
      {
        street: "preflop",
        seat: 2,
        action: "big-blind",
        streetTotalBb: 1,
        label: "BB posts 1",
      },
      {
        street: "preflop",
        seat: 0,
        action: "raise",
        streetTotalBb: 2.5,
        label: "BTN raises 2.5",
      },
      {
        street: "preflop",
        seat: 1,
        action: "fold",
        streetTotalBb: 0.5,
        label: "SB folds",
      },
      {
        street: "preflop",
        seat: 2,
        action: "call",
        streetTotalBb: 2.5,
        label: "BB calls",
      },
      {
        street: "flop",
        seat: 2,
        action: "check",
        streetTotalBb: 0,
        label: "BB checks",
      },
      {
        street: "flop",
        seat: 0,
        action: "bet",
        streetTotalBb: 2,
        label: "BTN bets 2",
      },
      {
        street: "flop",
        seat: 2,
        action: "call",
        streetTotalBb: 2,
        label: "BB calls",
      },
      {
        street: "turn",
        seat: 2,
        action: "check",
        streetTotalBb: 0,
        label: "BB checks",
      },
      {
        street: "turn",
        seat: 0,
        action: "bet",
        streetTotalBb: 2.75,
        label: "BTN bets 2.75",
      },
      {
        street: "turn",
        seat: 2,
        action: "call",
        streetTotalBb: 2.75,
        label: "BB calls",
      },
      {
        street: "river",
        seat: 2,
        action: "bet",
        streetTotalBb: 5,
        label: "BB bets 5",
      },
    ],
    ranges: [
      {
        seat: 2,
        label: "Supplied betting range",
        combinations: [
          { cards: ["Kh", "Kd"], weight: 0.5 },
          { cards: ["Qs", "Jh"], weight: 0.5 },
        ],
      },
    ],
    options: [
      { action: "call", label: "Call 5 BB" },
      { action: "fold", label: "Fold" },
    ],
    reasons: [
      {
        id: "range-price",
        label: "Compare range share with the closing price",
      },
      { id: "hand-strength", label: "Aces must win" },
    ],
    estimatePrompt: "Required share percent?",
    assumptions: [
      "Calling closes the river; no later wagers.",
      "Fixed study rake 0 BB.",
    ],
  };
  return {
    version: 1,
    seed: 123,
    skill: "bluff-catch",
    initial,
    transfer: {
      ...initial,
      phase: "transfer",
      title: "Changed range",
      change: "The supplied range contains more sets.",
      ranges: [
        {
          ...initial.ranges[0],
          combinations: [
            { cards: ["Kh", "Kd"], weight: 0.9 },
            { cards: ["Qs", "Jh"], weight: 0.1 },
          ],
        },
      ],
    },
    fingerprint: id,
  };
}
function saveFixture(id: string) {
  db.prepare("INSERT INTO cash_drills VALUES(?,?,?,?,?,?,?)").run(
    id,
    new Date().toISOString(),
    3,
    "bluff-catch",
    JSON.stringify(fixture(id)),
    "Manual fixture",
    id,
  );
}
function answer(overrides: Partial<CashAnswer> = {}): CashAnswer {
  return {
    phase: "initial",
    action: "call",
    reasonId: "range-price",
    estimatePercent: 20,
    confidence: "very-sure",
    ...overrides,
  };
}

describe("cash practice API", () => {
  it("keeps private specifications and unearned follow-ups out of creation, reload and export", async () => {
    const created = await request(app)
      .post(`${base}/drills`)
      .send({ players: 9, skill: "bluff-catch" });
    expect(created.status).toBe(201);
    expect(created.body.initial.tablePlayers).toBe(9);
    expect(created.body.initial.activePlayers).toBe(2);
    expect(created.body.transfer).toBeNull();
    expect(created.body.answers).toEqual({});
    expect(created.body.feedback).toEqual({});
    for (const name of [
      "seed",
      "fingerprint",
      "specification",
      "expectedEstimate",
      "acceptedActions",
    ])
      expect(created.body).not.toHaveProperty(name);
    expect(
      (await request(app).get(`${base}/drills/${created.body.id}`)).body,
    ).toEqual(created.body);
    const backup = (await request(app).get("/api/export")).body;
    expect(backup.version).toBe(1);
    expect(backup.cashDrills).toEqual([created.body]);
    expect(backup.cashAnswers).toEqual([]);
    expect(JSON.stringify(backup.cashDrills)).not.toContain('"seed"');
    expect(JSON.stringify(backup.cashDrills)).not.toContain(
      '"expectedEstimate"',
    );
    const privateRow = db
      .prepare("SELECT specification FROM cash_drills")
      .get() as { specification: string };
    expect(JSON.parse(privateRow.specification)).toHaveProperty("seed");
    expect(JSON.parse(privateRow.specification).transfer.phase).toBe(
      "transfer",
    );
  });
  it("strictly validates inputs and enforces the staged legal answer boundary", async () => {
    for (const body of [
      { players: 1 },
      { players: 10 },
      { players: 8.5 },
      { players: 9, seed: 1 },
      { players: 2, skill: "multiway-call" },
    ])
      expect(
        (await request(app).post(`${base}/drills`).send(body)).status,
      ).toBe(400);
    expect((await request(app).get(`${base}/progress?players=10`)).status).toBe(
      400,
    );
    expect(
      (await request(app).get(`${base}/progress?players=9&seed=2`)).status,
    ).toBe(400);
    saveFixture("staged");
    const url = `${base}/drills/staged`;
    expect(
      (
        await request(app)
          .post(`${url}/answer`)
          .send(answer({ phase: "transfer" }))
      ).status,
    ).toBe(409);
    expect(
      (await request(app).post(`${url}/hint`).send({ phase: "transfer" }))
        .status,
    ).toBe(409);
    for (const input of [
      answer({ action: "bet" }),
      answer({ reasonId: "not-offered" }),
      answer({ estimatePercent: 101 }),
      { ...answer(), confidence: "certain" },
      { ...answer(), extra: true },
    ])
      expect(
        (await request(app).post(`${url}/answer`).send(input)).status,
      ).toBe(400);
    expect((await request(app).get(`${base}/drills/missing`)).status).toBe(404);
    expect(
      (await request(app).post(`${base}/drills/missing/answer`).send(answer()))
        .status,
    ).toBe(404);
    expect(
      (
        await request(app)
          .post(`${base}/drills/missing/hint`)
          .send({ phase: "initial" })
      ).status,
    ).toBe(404);
    expect((await request(app).get(`${base}/progress`)).body.attempts).toBe(0);
  });
  it("atomically stores one immutable first answer, unlocks transfer, and resumes across migrations/reopen", async () => {
    saveFixture("durable");
    const url = `${base}/drills/durable/answer`;
    const responses = await Promise.all([
      request(app).post(url).send(answer()),
      request(app).post(url).send(answer()),
    ]);
    expect(responses.map((r) => r.status)).toEqual([200, 200]);
    expect(responses[1].body).toEqual(responses[0].body);
    const first = responses[0].body;
    expect(first.transfer.phase).toBe("transfer");
    expect(first.feedback).not.toHaveProperty("transfer");
    expect(first.feedback.initial.selectedActionEvBb).toBeCloseTo(7.5);
    expect(first.feedback.initial.expectedEstimate).toBeCloseTo(20);
    expect(first.feedback.initial.correct).toBe(true);
    // A valid changed body cannot replace the original, even if not an option for this hand.
    expect(
      (
        await request(app)
          .post(url)
          .send(answer({ action: "bet", reasonId: "changed" }))
      ).body,
    ).toEqual(first);
    expect(
      (
        await request(app)
          .post(url)
          .send({ ...answer(), extra: true })
      ).status,
    ).toBe(400);
    db.close();
    db = openDatabase(path);
    app = createApp(db);
    expect((await request(app).get(`${base}/drills/durable`)).body).toEqual(
      first,
    );
    const follow = await request(app)
      .post(url)
      .send(answer({ phase: "transfer", action: "fold" }));
    expect(follow.body.feedback.transfer.correct).toBe(true);
    expect(
      follow.body.feedback.transfer.actionValues.find(
        (a: { action: string }) => a.action === "call",
      ).evBb,
    ).toBeCloseTo(-2.5);
    const progress = (await request(app).get(`${base}/progress`)).body;
    expect(progress).toMatchObject({
      attempts: 1,
      independentAttempts: 1,
      independentCorrect: 1,
      transferAttempts: 1,
      transferCorrect: 1,
    });
    expect(db.prepare("SELECT * FROM cash_answers").all()).toHaveLength(2);
  });
  it("tracks hints before answers, preserves unassisted answers after late hints, and separates guided progress", async () => {
    saveFixture("helped");
    saveFixture("fresh");
    const helped = `${base}/drills/helped`;
    const hint = await request(app)
      .post(`${helped}/hint`)
      .send({ phase: "initial" });
    expect(hint.status).toBe(200);
    expect(Object.keys(hint.body)).toEqual(["hint"]);
    await request(app).post(`${helped}/hint`).send({ phase: "initial" });
    expect((await request(app).get(helped)).body.assisted).toEqual(["initial"]);
    expect(
      (await request(app).post(`${helped}/answer`).send(answer())).body.feedback
        .initial.assisted,
    ).toBe(true);
    await request(app)
      .post(`${helped}/answer`)
      .send(answer({ phase: "transfer", action: "call", estimatePercent: 90 }));
    const fresh = await request(app)
      .post(`${base}/drills/fresh/answer`)
      .send(answer());
    await request(app)
      .post(`${base}/drills/fresh/hint`)
      .send({ phase: "initial" });
    expect((await request(app).get(`${base}/drills/fresh`)).body).toEqual(
      fresh.body,
    );
    const progress = (await request(app).get(`${base}/progress`)).body;
    expect(progress).toMatchObject({
      attempts: 2,
      independentAttempts: 1,
      independentCorrect: 1,
      assistedAttempts: 1,
      transferAttempts: 1,
      transferCorrect: 0,
      highConfidenceMistakes: 0,
    });
    expect(
      progress.skills.find((s: { skill: string }) => s.skill === "bluff-catch"),
    ).toMatchObject({
      actionMistakes: 0,
      reasonMistakes: 0,
      estimateMeanErrorPp: 0,
      reviewPriority: 0,
    });
    expect(db.prepare("SELECT * FROM cash_hints").all()).toHaveLength(2);
  });
  it("reports independent mistake dimensions and confidence, omitting assisted misses from prioritization", async () => {
    saveFixture("wrong");
    saveFixture("wrong-assisted");
    await request(app)
      .post(`${base}/drills/wrong/answer`)
      .send(
        answer({
          action: "fold",
          reasonId: "hand-strength",
          estimatePercent: 50,
        }),
      );
    await request(app)
      .post(`${base}/drills/wrong-assisted/hint`)
      .send({ phase: "initial" });
    await request(app)
      .post(`${base}/drills/wrong-assisted/answer`)
      .send(
        answer({
          action: "fold",
          reasonId: "hand-strength",
          estimatePercent: 100,
        }),
      );
    const progress = (await request(app).get(`${base}/progress`)).body;
    expect(progress).toMatchObject({
      attempts: 2,
      independentAttempts: 1,
      independentCorrect: 0,
      assistedAttempts: 1,
      highConfidenceMistakes: 1,
      recommendedSkill: "bluff-catch",
    });
    expect(
      progress.skills.find((s: { skill: string }) => s.skill === "bluff-catch"),
    ).toMatchObject({
      actionMistakes: 1,
      reasonMistakes: 1,
      estimateMeanErrorPp: 30,
      reviewPriority: 6,
    });
    expect(progress.nextSessionCue).toBe(engine.cashSkillCues["bluff-catch"]);
    expect(progress.recent).toHaveLength(2);
  });
  it("supports eight/full-ring and heads-up tables, excludes two-seat multiway, and generates genuinely fresh review", async () => {
    const fingerprints = new Set<string>();
    for (const players of [8, 9, 2, 9, 8, 2]) {
      const drill = await request(app)
        .post(`${base}/drills`)
        .send({ players, skill: "bluff-catch" });
      expect(drill.status).toBe(201);
      expect(drill.body.initial.tablePlayers).toBe(players);
      expect(drill.body.initial.seats).toHaveLength(players);
      const row = db
        .prepare("SELECT fingerprint FROM cash_drills WHERE id=?")
        .get(drill.body.id) as { fingerprint: string };
      expect(fingerprints.has(row.fingerprint)).toBe(false);
      fingerprints.add(row.fingerprint);
    }
    for (let i = 0; i < 6; i++) {
      const drill = await request(app)
        .post(`${base}/drills`)
        .send({ players: 2 });
      expect(drill.status).toBe(201);
      expect(drill.body.initial.skill).not.toBe("multiway-call");
    }
    expect(
      (await request(app).get(`${base}/progress?players=2`)).body
        .recommendedSkill,
    ).not.toBe("multiway-call");
  });
  it("bounds fresh-generation retries rather than silently repeating a recent revealed specification", async () => {
    const spec = fixture("collision");
    saveFixture("collision");
    const generate = vi
      .spyOn(engine, "generateCashDrill")
      .mockReturnValue(spec);
    const blocked = await request(app)
      .post(`${base}/drills`)
      .send({ players: 9, skill: "bluff-catch" });
    expect(blocked.status).toBe(503);
    expect(generate).toHaveBeenCalledTimes(32);
    expect(db.prepare("SELECT * FROM cash_drills").all()).toHaveLength(1);
  });
  it("uses only the latest 40 independent initial answers for review priority while retaining lifetime evidence", async () => {
    saveFixture("old-miss");
    await request(app)
      .post(`${base}/drills/old-miss/answer`)
      .send(answer({ action: "fold", estimatePercent: 90 }));
    for (let i = 0; i < 40; i++) {
      const id = `recent-correct-${i}`;
      saveFixture(id);
      await request(app).post(`${base}/drills/${id}/answer`).send(answer());
    }
    saveFixture("latest-guided");
    await request(app)
      .post(`${base}/drills/latest-guided/hint`)
      .send({ phase: "initial" });
    await request(app)
      .post(`${base}/drills/latest-guided/answer`)
      .send(answer({ action: "fold", estimatePercent: 90 }));
    await request(app)
      .post(`${base}/drills/latest-guided/answer`)
      .send(answer({ phase: "transfer", action: "call", estimatePercent: 90 }));
    const progress = (await request(app).get(`${base}/progress`)).body;
    expect(progress).toMatchObject({
      independentAttempts: 41,
      independentCorrect: 40,
      assistedAttempts: 1,
      highConfidenceMistakes: 1,
      recommendedSkill: null,
    });
    expect(
      progress.skills.find((s: { skill: string }) => s.skill === "bluff-catch")
        .reviewPriority,
    ).toBe(0);
  });
  it("never recommends a past multiway weakness for a two-seat table", async () => {
    const drill = await request(app)
      .post(`${base}/drills`)
      .send({ players: 9, skill: "multiway-call" });
    const q = drill.body.initial;
    const required = (100 * q.callBb) / (q.potBb + q.callBb - q.rakeBb);
    const submitted = await request(app)
      .post(`${base}/drills/${drill.body.id}/answer`)
      .send(
        answer({
          action: "fold",
          reasonId: "joint-share",
          estimatePercent: required < 50 ? 100 : 0,
        }),
      );
    expect(submitted.status).toBe(200);
    expect(submitted.body.feedback.initial.correct).toBe(false);
    expect(
      (await request(app).get(`${base}/progress?players=9`)).body
        .recommendedSkill,
    ).toBe("multiway-call");
    expect(
      (await request(app).get(`${base}/progress?players=2`)).body
        .recommendedSkill,
    ).toBeNull();
    for (let i = 0; i < 4; i++)
      expect(
        (await request(app).post(`${base}/drills`).send({ players: 2 })).body
          .initial.skill,
      ).not.toBe("multiway-call");
  });
  it("exports only earned feedback and clears new progress atomically without deleting bot data or legacy compatibility", async () => {
    saveFixture("backup");
    saveFixture("unanswered");
    await request(app)
      .post(`${base}/drills/backup/hint`)
      .send({ phase: "initial" });
    await request(app).post(`${base}/drills/backup/answer`).send(answer());
    const old = await request(app)
      .post("/api/exercises")
      .send({ mode: "pot-odds", seed: 42 });
    await request(app)
      .post(`/api/exercises/${old.body.id}/answer`)
      .send({ answer: 25, timeMs: 0 });
    const backup = (await request(app).get("/api/export")).body;
    expect(backup).toHaveProperty("attempts");
    expect(backup.attempts).toHaveLength(1);
    expect(backup.cashAnswers).toHaveLength(1);
    expect(backup.cashHints).toHaveLength(1);
    expect(
      backup.cashDrills.find((d: { id: string }) => d.id === "backup").feedback
        .initial.assisted,
    ).toBe(true);
    expect(
      backup.cashDrills.find((d: { id: string }) => d.id === "unanswered")
        .transfer,
    ).toBeNull();
    const table = await request(app).post("/api/tables").send({ players: 2 });
    expect(table.status).toBe(201);
    const botRowsBefore = db.prepare("SELECT * FROM bot_tables").all();
    expect(botRowsBefore).toHaveLength(1);
    const gamesBefore = (await request(app).get("/api/games")).body;
    expect((await request(app).delete("/api/progress")).status).toBe(200);
    for (const table of ["cash_drills", "cash_answers", "cash_hints"])
      expect(db.prepare(`SELECT * FROM ${table}`).all()).toHaveLength(0);
    expect((await request(app).get(`${base}/progress`)).body.attempts).toBe(0);
    expect((await request(app).get(`${base}/drills/backup`)).status).toBe(404);
    expect((await request(app).get("/api/games")).body).toEqual(gamesBefore);
    expect(db.prepare("SELECT * FROM bot_tables").all()).toEqual(botRowsBefore);
    expect((await request(app).get("/api/progress")).body.total).toBe(0);
  });
});
