import { beforeEach, afterEach, describe, it, expect } from "vitest";
import request from "supertest";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createApp } from "../apps/api/src/app";
import { openDatabase } from "../apps/api/src/database";
import { generate, grade } from "../apps/api/src/exercises";
import { scenarios } from "../apps/api/src/scenarios";
import { equity, validateCards } from "../packages/poker/src/index";
import { modes, exerciseSchema } from "../packages/shared/src/index";
let db: ReturnType<typeof openDatabase>,
  app: ReturnType<typeof createApp>,
  dir: string,
  path: string;
beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), "poker-"));
  path = join(dir, "test.sqlite");
  db = openDatabase(path);
  app = createApp(db);
});
afterEach(() => {
  db.close();
  rmSync(dir, { recursive: true, force: true });
});
describe("exercises and authored decisions", () => {
  it("all modes validate and generation is reproducible", () => {
    for (const mode of modes)
      for (let seed = 0; seed < 20; seed++) {
        const a = generate(mode, seed, "fixture");
        expect(generate(mode, seed, "fixture")).toEqual(a);
        expect(exerciseSchema.safeParse(a.exercise).success).toBe(true);
      }
  });
  it("targeted who-wins includes six exact hand-comparison cases", () => {
    const found = new Set<string>();
    for (let s = 0; s < 100; s++)
      found.add(generate("who-wins", s, "id").exercise.sourceId);
    for (const id of [
      "wheel",
      "flush-kicker",
      "two-pair-kicker",
      "full-house",
      "board-only",
      "equal-hands",
    ])
      expect(found.has(id)).toBe(true);
  });
  it("12 original decisions have legal cards and accept supported answers", () => {
    expect(scenarios).toHaveLength(12);
    for (const [i, s] of scenarios.entries()) {
      validateCards([...s.exercise.hero!, ...s.exercise.board!], 6, 7);
      expect(s.exercise.provenance).toBe("original educational example");
      for (const answer of s.accepted)
        expect(
          grade(
            {
              exercise: { ...s.exercise, id: "x", mode: "decision" },
              seed: 0,
              scenarioIndex: i,
            },
            answer,
          ).correct,
        ).toBe(true);
    }
  });
  it("independently checks defined decision range equities", () => {
    const ranges = [
      {
        i: 0,
        range: [
          ["Ah", "Jc"],
          ["Ad", "Tc"],
          ["Ks", "Qh"],
          ["9d", "9h"],
        ],
        expected: 75,
      },
      {
        i: 1,
        range: [
          ["Kc", "Tc"],
          ["9h", "9d"],
          ["As", "Tc"],
          ["Ah", "8h"],
        ],
        expected: 50,
      },
      {
        i: 2,
        range: [
          ["As", "Ad"],
          ["9h", "9c"],
          ["Qh", "Jh"],
          ["Jd", "Td"],
        ],
        expected: 50,
      },
      {
        i: 3,
        range: [
          ["As", "Ad"],
          ["Ah", "Ac"],
          ["9h", "9c"],
          ["6s", "6d"],
          ["Qh", "Jh"],
        ],
        expected: 20,
      },
      {
        i: 6,
        range: [
          ["Kc", "Jc"],
          ["Ah", "Td"],
          ["Qh", "Js"],
          ["Kh", "Qh"],
        ],
        expected: 75,
      },
    ];
    for (const r of ranges) {
      const s = scenarios[r.i].exercise;
      expect(equity(s.hero!, s.board!, r.range).equity).toBe(r.expected);
    }
  });
  it("returns graduated equity feedback with no binary label", () => {
    const s = generate("equity", 2, "x");
    const f = grade(s, 0);
    expect(f.kind).toBe("estimate");
    expect(f.correct).toBeUndefined();
    expect(f.rangeResults).toHaveLength(4);
  });
});
describe("local API", () => {
  it("health and modes", async () => {
    expect((await request(app).get("/api/health")).body.status).toBe("ok");
    expect((await request(app).get("/api/modes")).body).toHaveLength(5);
  });
  it("does not disclose answers before submission", async () => {
    for (const mode of modes) {
      const r = await request(app)
        .post("/api/exercises")
        .send({ mode, seed: 1 });
      expect(r.status).toBe(201);
      expect(Object.keys(r.body)).not.toEqual(
        expect.arrayContaining(["accepted"]),
      );
      expect(r.body.feedback).toBeUndefined();
      expect(r.body.scenarioIndex).toBeUndefined();
      expect(r.body.equity).toBeUndefined();
    }
  });
  it("validates requests and mode-specific answers", async () => {
    expect(
      (await request(app).post("/api/exercises").send({ mode: "fake" })).status,
    ).toBe(400);
    expect(
      (
        await request(app)
          .post("/api/exercises")
          .send({ mode: "equity", seed: -1 })
      ).status,
    ).toBe(400);
    const { body: e } = await request(app)
      .post("/api/exercises")
      .send({ mode: "pot-odds", seed: 1 });
    expect(
      (
        await request(app)
          .post(`/api/exercises/${e.id}/answer`)
          .send({ answer: 101, timeMs: 0 })
      ).status,
    ).toBe(400);
    expect(
      (
        await request(app)
          .post(`/api/exercises/${e.id}/answer`)
          .send({ answer: "Call", timeMs: 0 })
      ).status,
    ).toBe(400);
    expect(
      (
        await request(app)
          .post("/api/exercises/no/answer")
          .send({ answer: 25, timeMs: 0 })
      ).status,
    ).toBe(404);
  });
  it("grades server-side, persists across reopening, and duplicate submissions return original feedback", async () => {
    const { body: e } = await request(app)
      .post("/api/exercises")
      .send({ mode: "pot-odds", seed: 42 });
    const body = { answer: 25, timeMs: 1500 };
    const first = await request(app)
      .post(`/api/exercises/${e.id}/answer`)
      .send(body);
    expect(first.status).toBe(200);
    const second = await request(app)
      .post(`/api/exercises/${e.id}/answer`)
      .send({ ...body, answer: 90 });
    expect(second.body.replayed).toBe(true);
    expect(second.body.feedback).toEqual(first.body.feedback);
    db.close();
    db = openDatabase(path);
    app = createApp(db);
    expect((await request(app).get("/api/progress")).body.total).toBe(1);
    const attempts = (await request(app).get("/api/attempts")).body;
    expect(attempts).toHaveLength(1);
    expect(attempts[0].answer).toBe(25);
    expect(attempts[0].timeMs).toBe(1500);
    expect(attempts[0].sourceId).toBe(e.sourceId);
  });
  it("resumes grading a stored unanswered exercise after restart", async () => {
    const { body: e } = await request(app)
      .post("/api/exercises")
      .send({ mode: "who-wins", seed: 8 });
    db.close();
    db = openDatabase(path);
    app = createApp(db);
    expect(
      (
        await request(app)
          .post(`/api/exercises/${e.id}/answer`)
          .send({ answer: "Tie", timeMs: 0 })
      ).status,
    ).toBe(200);
  });
  it("keeps metrics separate, exports, and clears", async () => {
    for (const mode of ["pot-odds", "equity", "who-wins"]) {
      const { body: e } = await request(app)
        .post("/api/exercises")
        .send({ mode, seed: 2 });
      await request(app)
        .post(`/api/exercises/${e.id}/answer`)
        .send({ answer: mode === "who-wins" ? "Tie" : 0, timeMs: 0 });
    }
    const p = (await request(app).get("/api/progress")).body;
    expect(p.total).toBe(3);
    expect(p.numeric).toHaveLength(2);
    expect(p.categorical).toHaveLength(3);
    expect(p.sessions[0].attempts).toBe(3);
    expect((await request(app).get("/api/export")).body.attempts).toHaveLength(
      3,
    );
    expect((await request(app).delete("/api/progress")).status).toBe(200);
    expect((await request(app).get("/api/progress")).body.total).toBe(0);
  });
  it("targets recent mistakes with an explained rule", async () => {
    const { body: e } = await request(app)
      .post("/api/exercises")
      .send({ mode: "pot-odds", seed: 2 });
    await request(app)
      .post(`/api/exercises/${e.id}/answer`)
      .send({ answer: 0, timeMs: 0 });
    const target = (
      await request(app)
        .post("/api/exercises")
        .send({ mode: "who-wins", seed: 3, targetWeak: true })
    ).body;
    expect(target.mode).toBe("pot-odds");
    expect(target.selection).toContain("Pot odds");
    const mix = (
      await request(app)
        .post("/api/exercises")
        .send({ mode: "who-wins", seed: 4, targetWeak: true })
    ).body;
    expect(mix.mode).toBe("who-wins");
  });
  it("rejects incomplete comparison arrays", async () => {
    const { body: e } = await request(app)
      .post("/api/exercises")
      .send({ mode: "what-beats-me" });
    expect(
      (
        await request(app)
          .post(`/api/exercises/${e.id}/answer`)
          .send({ answer: ["beats"], timeMs: 0 })
      ).status,
    ).toBe(400);
  });
});
describe("submission edge cases", () => {
  it("accepts 0.5-point rounding and rejects larger errors", () => {
    const s = generate("pot-odds", 42, "x");
    const e = s.exercise,
      required = (e.call! / (e.pot! + e.bet! + e.call!)) * 100;
    expect(grade(s, required + 0.49).correct).toBe(true);
    expect(grade(s, required + 0.51).correct).toBe(false);
  });
  it("simultaneous submissions store one attempt", async () => {
    const { body: e } = await request(app)
      .post("/api/exercises")
      .send({ mode: "pot-odds", seed: 42 });
    const responses = await Promise.all(
      [1, 2].map(() =>
        request(app)
          .post(`/api/exercises/${e.id}/answer`)
          .send({ answer: 25, timeMs: 0 }),
      ),
    );
    expect(responses.map((r) => r.status)).toEqual([200, 200]);
    expect(responses.filter((r) => r.body.replayed)).toHaveLength(1);
    expect((await request(app).get("/api/attempts")).body).toHaveLength(1);
  });
});
describe("skill-specific generation", () => {
  it("every targeted skill appears in the selected exercise", () => {
    const targets = {
      "who-wins": [
        "Kicker",
        "Straight",
        "Flush",
        "Full house",
        "Split pot",
        "Range comparison",
      ],
      "what-beats-me": [
        "Flush",
        "Full house",
        "Split pot",
        "Kicker",
        "Range comparison",
      ],
      equity: ["Flush", "Range comparison"],
    };
    for (const [mode, tags] of Object.entries(targets))
      for (const tag of tags)
        for (let seed = 0; seed < 8; seed++)
          expect(
            generate(mode as "equity", seed, "target", "river", tag).exercise
              .tags,
          ).toContain(tag);
  });
});
