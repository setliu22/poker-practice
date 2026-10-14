import { it, expect } from "vitest";
import request from "supertest";
import { randomUUID } from "node:crypto";
import {
  createTable,
  resetHand,
  runBots,
  act,
} from "../packages/poker/src/table";
import { createApp } from "../apps/api/src/app";
import { openDatabase } from "../apps/api/src/database";
it("restarts the same deal mid-hand and repeats bot responses to the same actions", () => {
  const initial = runBots(createTable("reset", 2, 1));
  const s = structuredClone(initial);
  act(s, 0, "call");
  runBots(s);
  const restarted = resetHand(s);
  expect(restarted.id).toBe(initial.id);
  expect(restarted.handNumber).toBe(initial.handNumber);
  expect(restarted.dealer).toBe(initial.dealer);
  expect(restarted.players.map((p) => p.hole)).toEqual(
    initial.players.map((p) => p.hole),
  );
  expect(restarted.runout).toEqual(initial.runout);
  expect(restarted.history).toEqual(initial.history);
  expect(restarted.reads).toEqual(initial.reads);
  act(restarted, 0, "call");
  runBots(restarted);
  expect(restarted.history).toEqual(s.history);
  expect(restarted.board).toEqual(s.board);
});
it("resets only the current hand, preserves older stats, is idempotent and rejects stale commands", async () => {
  const db = openDatabase(":memory:");
  try {
    const app = createApp(db),
      s = runBots(createTable("reset-api", 2, 1));
    act(s, 0, "fold");
    runBots(s);
    db.prepare("INSERT INTO bot_tables VALUES(?,?)").run(
      s.id,
      JSON.stringify(s),
    );
    for (const hand of [0, 1])
      db.prepare("INSERT INTO bot_hand_stats VALUES(?,?,?)").run(
        s.id,
        hand,
        JSON.stringify({ handNumber: hand, profit: 10 }),
      );
    const body = { revision: s.revision, actionId: randomUUID() };
    const a = await request(app)
      .post(`/api/tables/${s.id}/reset-hand`)
      .send(body);
    expect(a.status).toBe(200);
    expect(a.body.id).toBe(s.id);
    expect(a.body.complete).toBe(false);
    expect(
      db
        .prepare("SELECT hand_number FROM bot_hand_stats WHERE table_id=?")
        .all(s.id),
    ).toEqual([{ hand_number: 0 }]);
    const b = await request(app)
      .post(`/api/tables/${s.id}/reset-hand`)
      .send(body);
    expect(b.body).toEqual(a.body);
    expect(
      (
        await request(app)
          .post(`/api/tables/${s.id}/reset-hand`)
          .send({ ...body, actionId: randomUUID() })
      ).status,
    ).toBe(409);
  } finally {
    db.close();
  }
});
