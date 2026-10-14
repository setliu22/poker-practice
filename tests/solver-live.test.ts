import { it, expect } from "vitest";
import request from "supertest";
import { createApp } from "../apps/api/src/app";
import { openDatabase } from "../apps/api/src/database";
import { createTable, act } from "../packages/poker/src/table";
it.runIf(process.env.TEST_GTOPEN === "1")(
  "real local solver follows unopened, limped and raised hands; caches persist without advancing play",
  async () => {
    const db = openDatabase(":memory:");
    try {
      const app = createApp(db);
      for (const action of ["unopened", "call", "raise"] as const) {
        const s = createTable(
          `live-${action}`,
          2,
          1,
          action === "unopened" ? 0 : 1,
        );
        if (action !== "unopened")
          act(s, 1, action, action === "raise" ? 36 : undefined);
        const before = JSON.stringify(s);
        db.prepare("INSERT INTO bot_tables VALUES(?,?)").run(s.id, before);
        let chart: any,
          deadline = Date.now() + 60000;
        do {
          chart = (
            await request(app)
              .post(`/api/tables/${s.id}/solver-chart`)
              .send({ revision: s.revision })
          ).body;
          if (["ready", "unavailable"].includes(chart.status)) break;
          await new Promise((r) => setTimeout(r, 250));
        } while (Date.now() < deadline);
        expect(chart.status, chart.message).toBe("ready");
        expect(chart.cells).toHaveLength(169);
        expect(chart.converged).toBe(true);
        if (action === "call")
          expect(chart.actions.some((a: any) => a.kind === "check")).toBe(true);
        if (action === "raise")
          expect(chart.actions.some((a: any) => a.label === "Call 26")).toBe(
            true,
          );
        expect(
          db.prepare("SELECT state FROM bot_tables WHERE id=?").get(s.id),
        ).toEqual({ state: before });
        const restarted = createApp(db);
        const cached = await request(restarted)
          .post(`/api/tables/${s.id}/solver-chart`)
          .send({ revision: s.revision });
        expect(cached.status).toBe(200);
        expect(cached.body).toEqual(chart);
      }
      expect(
        db.prepare("SELECT COUNT(*) AS n FROM bot_commands").get(),
      ).toEqual({ n: 0 });
      expect(
        db.prepare("SELECT COUNT(*) AS n FROM bot_hand_stats").get(),
      ).toEqual({ n: 0 });
    } finally {
      db.close();
    }
  },
  180000,
);

it.runIf(process.env.TEST_GTOPEN === "1")(
  "real three-player limp chart preserves every competitor and rejects oversized nine-seat trees",
  async () => {
    const db = openDatabase(":memory:");
    try {
      const app = createApp(db),
        s = createTable("live-multiway", 3, 1, 1);
      act(s, 1, "call");
      act(s, 2, "call");
      db.prepare("INSERT INTO bot_tables VALUES(?,?)").run(
        s.id,
        JSON.stringify(s),
      );
      let chart: any,
        deadline = Date.now() + 90000;
      do {
        chart = (
          await request(app)
            .post(`/api/tables/${s.id}/solver-chart`)
            .send({ revision: s.revision })
        ).body;
        if (["ready", "unavailable"].includes(chart.status)) break;
        await new Promise((r) => setTimeout(r, 300));
      } while (Date.now() < deadline);
      expect(chart.status, chart.message).toBe("ready");
      expect(chart.positions).toHaveLength(3);
      expect(chart.path).toHaveLength(2);
      expect(chart.actions.some((a: any) => a.kind === "check")).toBe(true);
      const nine = createTable("live-nine", 9, 1);
      nine.actor = 0;
      db.prepare("INSERT INTO bot_tables VALUES(?,?)").run(
        nine.id,
        JSON.stringify(nine),
      );
      do {
        chart = (
          await request(app)
            .post(`/api/tables/${nine.id}/solver-chart`)
            .send({ revision: 0 })
        ).body;
        if (chart.status === "unavailable") break;
        await new Promise((r) => setTimeout(r, 300));
      } while (Date.now() < deadline);
      expect(chart.status).toBe("unavailable");
      expect(chart.message).toContain("No smaller-table chart was substituted");
    } finally {
      db.close();
    }
  },
  150000,
);
