import { describe, it, expect } from "vitest";
import { createTable, legalActions } from "../packages/poker/src/table";
import {
  assistantSnapshot,
  assistantContext,
  assistantAnalysis,
  interval,
} from "../packages/poker/src/decision-assistant";

describe("public decision assistant", () => {
  it("does not read private cards, runout, seed or completed reviews", () => {
    const s = createTable("privacy", 2, 1);
    for (const key of ["runout", "seed", "review", "decisions"])
      Object.defineProperty(s, key, {
        get() {
          throw new Error(`private ${key}`);
        },
      });
    Object.defineProperty(s.players[1], "hole", {
      get() {
        throw new Error("hidden cards");
      },
    });
    const snapshot = assistantSnapshot(s);
    expect(snapshot.players[1].hole).toEqual([]);
    expect(snapshot.runout).toEqual([]);
    expect(assistantContext(s).competing).toBe(2);
  });
  it("reports actual table context and never substitutes a six-max chart", () => {
    const s = createTable("eight", 8, 1);
    s.actor = 0;
    const context = assistantContext(s);
    expect(context.tableSize).toBe(8);
    expect(context.guide.status).not.toBe("available");
    expect(context.effective).toHaveLength(7);
    expect(context.intuition.join(" ")).toContain("showdown equity");
  });
  it("excludes folded opponents and distinguishes a re-raised pot", async () => {
    const s = createTable("folded", 3, 1);
    s.actor = 0;
    s.players[2].folded = true;
    s.pending = [0, 1];
    s.actions = [
      { street: "preflop", seat: 1, action: "raise", amount: 36 },
      { street: "preflop", seat: 2, action: "raise", amount: 130 },
    ] as typeof s.actions;
    s.history.push(
      { street: "preflop", seat: 1, text: "Raises to 36" },
      { street: "preflop", seat: 2, text: "Raises to 130" },
    );
    const context = assistantContext(s);
    expect(context.competing).toBe(2);
    expect(context.stillToAct).toBe(1);
    expect(context.guide.status).not.toBe("available");
    expect(context.history.at(-1)?.text).toContain("3-bet");
    const result = await assistantAnalysis(s, {
      revision: 0,
      layer: "behavior",
      action: "fold",
      continuation: "theo",
    });
    expect(result.opponents.map((p) => p.seat)).toEqual([1]);
    expect(result.immediateAllFold).toBe(0);
  });
  it("uses independently known Wilson bounds", () => {
    expect(interval(0, 0)).toEqual([0, 100]);
    expect(interval(50, 100)[0]).toBeCloseTo(40.383, 2);
    expect(interval(50, 100)[1]).toBeCloseTo(59.617, 2);
  });
  it("is reproducible, read-only and partitions sequential responses", async () => {
    const s = createTable("responses", 2, 1),
      before = JSON.stringify(s);
    const input = {
      revision: 0,
      layer: "behavior" as const,
      action: "raise" as const,
      amount: legalActions(s)!.minRaiseTo,
      continuation: "theo" as const,
    };
    const a = await assistantAnalysis(s, input);
    s.players[1].hole = ["As", "Ks"];
    s.runout = ["2c", "3c", "4c", "5c", "6c"];
    const b = await assistantAnalysis(s, input);
    expect(a).toEqual(b);
    expect(a.branches.reduce((n, branch) => n + branch.percent, 0)).toBeCloseTo(
      100,
    );
    const p = a.opponents[0];
    expect(p.fold + p.call + p.raise + p.check).toBeCloseTo(100);
    expect(p.range.matrix).toHaveLength(169);
    expect(p.observed.foldInterval).toEqual([0, 100]);
    s.players[1].hole = JSON.parse(before).players[1].hole;
    s.runout = JSON.parse(before).runout;
    expect(JSON.stringify(s)).toBe(before);
  }, 30000);
  it("advanced EV sources sum to return and fold has zero incremental EV", async () => {
    const s = createTable("advanced", 2, 1);
    const a = await assistantAnalysis(s, {
      revision: 0,
      layer: "advanced",
      action: "call",
      continuation: "check-fold",
    });
    expect(a.equity?.opponents).toBe(1);
    expect(a.values!.find((v) => v.key === "fold")!.chips).toBe(0);
    for (const value of a.values!)
      if (value.sources) {
        expect(
          value.sources.reduce((n, p) => n + p.probability, 0),
        ).toBeCloseTo(100);
        expect(
          value.sources.reduce((n, p) => n + p.contribution, 0),
        ).toBeCloseTo(value.chips);
      }
  }, 60000);
});

it("automatic advice works across all streets with explicit public boards", async () => {
  for (const [street, count] of [
    ["preflop", 0],
    ["flop", 3],
    ["turn", 4],
    ["river", 5],
  ] as const) {
    const s = createTable(`advice-${street}`, 2, 1);
    s.street = street;
    s.board = s.runout.slice(0, count);
    if (count) {
      s.currentBet = 0;
      s.minRaise = 10;
      s.players.forEach((p) => (p.streetBet = 0));
      s.actor = 0;
      s.pending = [0, 1];
      s.lastActBet = [null, null];
    }
    const before = JSON.stringify(s);
    const response = await assistantAnalysis(s, {
      revision: 0,
      layer: "advice",
      action: count ? "check" : "call",
      continuation: "theo",
    });
    expect(response.recommendation?.label).toBeTruthy();
    expect(
      response.values?.some((v) => v.key === response.recommendation?.key),
    ).toBe(true);
    expect(JSON.stringify(s)).toBe(before);
    expect(response.equity).toBeUndefined();
  }
}, 60000);
