import { describe, it, expect } from "vitest";
import { createTable, act, resetHand } from "../packages/poker/src/table";
import {
  solverSpot,
  chartFromNode,
  actionIndex,
  nodeSchema,
} from "../packages/poker/src/solver-spot";
function fixture() {
  return {
    kind: "action",
    actor: 0,
    pot: 1.5,
    invested: [0.5, 1],
    live: [true, true],
    actions: [
      { kind: "fold", to: 0, label: "Fold", freq: 0.1 },
      { kind: "call", to: 1, label: "Limp 1", freq: 0.3 },
      { kind: "raise", to: 2.5, label: "Raise 2.5", freq: 0.6 },
    ],
    strategy: [
      ...Array(169).fill(0.1),
      ...Array(169).fill(0.3),
      ...Array(169).fill(0.6),
    ],
    reach: Array(169).fill(1),
    strategy_note: null,
    low_reach: false,
    publication: {
      published_iteration: 25,
      accuracy_iteration: 25,
      gap_total: 0.01,
      target_gap: 0.05,
      converged: true,
      multiway_model: "coupled_deck_v1",
    },
  };
}
describe("GTOpen public-spot adapter", () => {
  it("preserves 2–9 actual seats and button-relative action order", () => {
    for (let n = 2; n <= 9; n++)
      for (let dealer = 0; dealer < n; dealer++) {
        const s = createTable("seats", n, 1, dealer);
        s.actor = 0;
        const spot = solverSpot(s);
        expect(spot.config.positions).toHaveLength(n);
        expect(spot.config.posts.reduce<number>((a, b) => a + b, 0)).toBe(1.5);
        expect(spot.config.posts.at(-1)).toBe(1);
        expect(spot.seats[spot.hero]).toBe(0);
      }
  });
  it("never accesses hidden cards, actual runout, seed or reviews", () => {
    const s = createTable("privacy", 2, 1);
    for (const k of ["seed", "runout", "review", "decisions"])
      Object.defineProperty(s, k, {
        get() {
          throw new Error(`private ${k}`);
        },
      });
    Object.defineProperty(s.players[1], "hole", {
      get() {
        throw new Error("hidden");
      },
    });
    const spot = solverSpot(s);
    expect(spot.publicState.players[1].hole).toEqual([]);
    expect(JSON.stringify(spot.config)).not.toContain("hole");
  });
  it("retains limps, folds, exact raise sizes and prior raises", () => {
    const s = createTable("line", 3, 1);
    s.actor = 0;
    s.actions = [
      { seat: 1, street: "preflop", action: "call" },
      { seat: 2, street: "preflop", action: "raise", amount: 36 },
      { seat: 0, street: "preflop", action: "raise", amount: 130 },
    ];
    const spot = solverSpot(s);
    expect(spot.history.map((a) => a.action)).toEqual([
      "call",
      "raise",
      "raise",
    ]);
    expect(spot.config.open_raises_by_seat[spot.seats.indexOf(2)]).toContain(
      3.6,
    );
    expect(spot.config.raise_mults_by_seat[spot.hero]).toContain(130 / 36);
    expect(spot.config.max_raises).toBe(3);
  });
  it("maps independent known AK suited/offsuit indices and preserves mixed frequencies", () => {
    const s = createTable("chart", 2, 1),
      spot = solverSpot(s),
      node = fixture();
    node.strategy[167] = 0.9;
    node.strategy[169 + 167] = 0.1;
    node.strategy[338 + 167] = 0;
    const chart = chartFromNode(spot, node, [], 0);
    expect(chart.cells).toHaveLength(169);
    expect(chart.cells!.find((c) => c.hand === "AKs")!.frequencies).toEqual([
      90, 10, 0,
    ]);
    expect(chart.cells!.find((c) => c.hand === "AKo")!.frequencies).toEqual([
      10, 30, 60,
    ]);
    expect(chart.actions![2].amount).toBe(25);
  });
  it("rejects mismatched actors, pots, folds, illegal sizes, zero iterations and absent strategy", () => {
    const spot = solverSpot(createTable("bad", 2, 1));
    for (const patch of [
      { actor: 1 },
      { pot: 2 },
      { live: [true, false] },
      { strategy_note: "No reach" },
      { low_reach: true },
      { strategy: Array(507).fill(0) },
      { publication: { ...fixture().publication, published_iteration: 0 } },
      {
        actions: [
          ...fixture().actions.slice(0, 2),
          { kind: "raise", to: 1.5, label: "Illegal", freq: 0.6 },
        ],
      },
    ])
      expect(() =>
        chartFromNode(spot, { ...fixture(), ...patch }, [], 0),
      ).toThrow();
  });
  it("matches call totals and never silently substitutes missing raises", () => {
    const node = nodeSchema.parse(fixture());
    expect(actionIndex(node, { action: "call" }, 10)).toBe(1);
    expect(actionIndex(node, { action: "raise", amount: 25 }, 10)).toBe(2);
    expect(() =>
      actionIndex(node, { action: "raise", amount: 36 }, 10),
    ).toThrow(/No substitute/);
  });
  it("rejects unequal initial stacks, postflop and completed hands", () => {
    const s = createTable("invalid", 2, 1);
    s.players[1].stack--;
    expect(() => solverSpot(s)).toThrow(/equal starting stacks/);
    s.players[1].stack++;
    s.street = "flop";
    expect(() => solverSpot(s)).toThrow(/preflop/);
    s.street = "preflop";
    s.complete = true;
    expect(() => solverSpot(s)).toThrow();
  });
});
