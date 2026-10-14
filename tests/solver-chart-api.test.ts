import { it, expect } from "vitest";
import request from "supertest";
import { createApp } from "../apps/api/src/app";
import { openDatabase } from "../apps/api/src/database";
import { createTable } from "../packages/poker/src/table";
import { solverCharts } from "../apps/api/src/solver-charts";

it("keeps a failed solve visible during polling and retries only explicitly", async () => {
  const previous = process.env.POKER_SOLVER_DISABLED;
  process.env.POKER_SOLVER_DISABLED = "1";
  const db = openDatabase(":memory:");
  try {
    const getChart = solverCharts(db);
    const state = createTable("failed-solver", 2, 1);
    expect(getChart(state).status).toBe("queued");
    await new Promise((resolve) => setTimeout(resolve, 10));
    const failed = getChart(state);
    expect(failed.status).toBe("unavailable");
    expect(failed.message).toContain("disabled");
    expect(getChart(state)).toEqual(failed);
    expect(getChart(state, true).status).toBe("queued");
    await new Promise((resolve) => setTimeout(resolve, 10));
    expect(getChart(state).status).toBe("unavailable");
  } finally {
    if (previous === undefined) delete process.env.POKER_SOLVER_DISABLED;
    else process.env.POKER_SOLVER_DISABLED = previous;
    db.close();
  }
});
it("validates canonical revision and rejects private inputs without changing a hand", async () => {
  const db = openDatabase(":memory:");
  try {
    const app = createApp(db),
      s = createTable("solver-api", 2, 1);
    s.street = "flop";
    db.prepare("INSERT INTO bot_tables VALUES(?,?)").run(
      s.id,
      JSON.stringify(s),
    );
    const changes = db.prepare("SELECT total_changes() AS n").get();
    expect(
      (
        await request(app)
          .post(`/api/tables/${s.id}/solver-chart`)
          .send({ revision: 0, hole: ["As", "Ks"] })
      ).status,
    ).toBe(400);
    expect(
      (
        await request(app)
          .post(`/api/tables/${s.id}/solver-chart`)
          .send({ revision: 1 })
      ).status,
    ).toBe(409);
    const response = await request(app)
      .post(`/api/tables/${s.id}/solver-chart`)
      .send({ revision: 0 });
    expect(response.body.status).toBe("unavailable");
    expect(response.body.message).toContain("preflop");
    expect(db.prepare("SELECT total_changes() AS n").get()).toEqual(changes);
    expect(
      db.prepare("SELECT state FROM bot_tables WHERE id=?").get(s.id),
    ).toEqual({ state: JSON.stringify(s) });
  } finally {
    db.close();
  }
});
