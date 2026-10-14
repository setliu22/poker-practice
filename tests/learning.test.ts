import { describe, it, expect } from "vitest";
import request from "supertest";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  gradeLearning,
  learningScenarios,
} from "../packages/poker/src/learning";
import { openDatabase } from "../apps/api/src/database";
import { createApp } from "../apps/api/src/app";
const answer = {
  action: "bet" as const,
  reason: "weaker-call" as const,
  timeMs: 1000,
};
describe("value betting lesson", () => {
  it("matches independently calculated payouts for all eight situations", () => {
    const fixtures = [
      [80, 200 / 3, "bet"],
      [160 / 3, 200 / 3, "check"],
      [105, 90, "bet"],
      [67.5, 90, "check"],
      [60, 160 / 3, "bet"],
      [140 / 3, 160 / 3, "check"],
      [50, 60, "check"],
      [190 / 3, 60, "bet"],
    ] as const;
    expect(learningScenarios).toHaveLength(fixtures.length);
    fixtures.forEach(([bet, check, best], i) => {
      const f = gradeLearning(i, answer);
      expect(f.betEv).toBeCloseTo(bet);
      expect(f.checkEv).toBeCloseTo(check);
      expect(f.best).toBe(best);
    });
  });
  it("grades reasoning independently from the chosen move", () => {
    const f = gradeLearning(1, { ...answer, action: "check" });
    expect(f.actionCorrect).toBe(true);
    expect(f.reasonCorrect).toBe(false);
    expect(
      gradeLearning(1, { ...answer, reason: "stronger-only" }).reasonCorrect,
    ).toBe(true);
  });
  it("does not grade a positive betting result as best when checking earns more", () => {
    const f = gradeLearning(6, answer);
    expect(f.betEv).toBeGreaterThan(0);
    expect(f.best).toBe("check");
  });
  it("keeps canonical answers on the server, validates, persists and submits idempotently", async () => {
    const dir = mkdtempSync(join(tmpdir(), "poker-learning-"));
    let db = openDatabase(join(dir, "db.sqlite"));
    try {
      let app = createApp(db);
      expect(
        (await request(app).post("/api/learning/questions").send({ index: 99 }))
          .status,
      ).toBe(400);
      const q = await request(app)
        .post("/api/learning/questions")
        .send({ index: 4 });
      expect(q.status).toBe(201);
      expect(q.body).not.toHaveProperty("best");
      expect(q.body).not.toHaveProperty("betEv");
      const path = `/api/learning/questions/${q.body.id}/answer`;
      expect(
        (
          await request(app)
            .post(path)
            .send({ ...answer, reason: "unknown" })
        ).status,
      ).toBe(400);
      const f = await request(app).post(path).send(answer);
      expect(f.body.actionCorrect).toBe(true);
      const duplicate = await request(app)
        .post(path)
        .send({ ...answer, action: "check" });
      expect(duplicate.body).toEqual(f.body);
      db.close();
      db = openDatabase(join(dir, "db.sqlite"));
      app = createApp(db);
      const p = await request(app).get("/api/learning/progress");
      expect(p.body.attempts).toBe(1);
      expect(p.body.transferBothCorrect).toBe(1);
      const exported = await request(app).get("/api/export");
      expect(exported.body.learningAttempts).toHaveLength(1);
      await request(app).delete("/api/progress");
      expect(
        (await request(app).get("/api/learning/progress")).body.attempts,
      ).toBe(0);
    } finally {
      db.close();
      rmSync(dir, { recursive: true, force: true });
    }
  });
});
