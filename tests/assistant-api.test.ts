import { it, expect } from "vitest";
import request from "supertest";
import { createApp } from "../apps/api/src/app";
import { openDatabase } from "../apps/api/src/database";
import { createTable } from "../packages/poker/src/table";
it("assistant worker is read-only and endpoint rejects hidden inputs and stale revisions", async () => {
  const db = openDatabase(":memory:");
  try {
    const app = createApp(db),
      s = createTable("assistant", 2, 1);
    db.prepare("INSERT INTO bot_tables VALUES(?,?)").run(
      s.id,
      JSON.stringify(s),
    );
    const changes = () => db.prepare("SELECT total_changes() AS n").get();
    const before = changes();
    for (const layer of ["context", "behavior"]) {
      const response = await request(app)
        .post("/api/tables/assistant/assistant")
        .send({ revision: 0, layer });
      expect(response.status, JSON.stringify(response.body)).toBe(200);
    }
    expect(changes()).toEqual(before);
    expect(
      db.prepare("SELECT state FROM bot_tables WHERE id=?").get(s.id),
    ).toEqual({ state: JSON.stringify(s) });
    expect(
      (
        await request(app)
          .post("/api/tables/assistant/assistant")
          .send({ revision: 1 })
      ).status,
    ).toBe(409);
    expect(
      (
        await request(app)
          .post("/api/tables/assistant/assistant")
          .send({ revision: 0, hiddenCards: ["As", "Ks"] })
      ).status,
    ).toBe(400);
    expect(
      (
        await request(app)
          .post("/api/tables/assistant/assistant")
          .send({ revision: 0, action: "raise", amount: 1, layer: "behavior" })
      ).status,
    ).toBe(422);
  } finally {
    db.close();
  }
}, 30000);
