import { describe, expect, it } from "vitest";
import {
  livePreflopGuide,
  openingCharts,
  preflopGuide,
} from "../packages/poker/src/preflop-charts";
import {
  act,
  createTable,
  type DecisionFrame,
  type TableState,
} from "../packages/poker/src/table";
import { startingHandClass } from "../packages/poker/src/range-summary";
import { positionName } from "../packages/shared/src/positions";

function unopened(count = 6, dealer = 0): TableState {
  const state = createTable("opening-fixture", count, 18, dealer);
  while (!state.complete && state.actor !== 0) act(state, state.actor!, "fold");
  return state;
}
function frame(state = unopened(), action: DecisionFrame["action"] = "raise") {
  const result: DecisionFrame = {
    id: 0,
    street: state.street,
    board: state.board,
    players: state.players,
    dealer: state.dealer,
    currentBet: state.currentBet,
    minRaise: state.minRaise,
    pending: state.pending,
    lastActBet: state.lastActBet,
    action,
    amount: action === "raise" ? 25 : undefined,
    eventCount: state.policyEvents?.length ?? 0,
    actions: state.actions,
  };
  return result;
}

// Counted independently from the pinned upstream RANGES definitions, not by
// the TypeScript chart constructor or hand evaluator. Counts are classes/combos.
const sourceFixtures: [string, number, number][] = [
  ["preflopr-2_btn", 100, 682],
  ["preflopr-6_utg", 41, 244],
  ["preflopr-6_hj", 53, 318],
  ["preflopr-6_co", 64, 404],
  ["preflopr-6_btn", 83, 542],
  ["preflopr-6_sb", 60, 362],
  ["preflopr-9_utg", 17, 94],
  ["preflopr-9_utgplus1", 22, 124],
  ["preflopr-9_utgplus2", 30, 174],
  ["preflopr-9_mp", 39, 228],
  ["preflopr-9_hj", 55, 326],
  ["preflopr-9_co", 67, 416],
  ["preflopr-9_btn", 89, 574],
  ["preflopr-9_sb", 71, 446],
];

describe("licensed local preflop opening baselines", () => {
  it("preserves every direct source chart and independently known coverage", () => {
    expect(openingCharts).toHaveLength(14);
    for (const [id, classes, combinations] of sourceFixtures) {
      const chart = openingCharts.find((chart) => chart.id === id)!;
      expect(
        chart.cells.filter((cell) => cell.action === "raise"),
      ).toHaveLength(classes);
      expect(chart.openPercent).toBeCloseTo((combinations / 1326) * 100, 10);
      expect(chart.source.license).toBe("MIT");
      expect(chart.source.revision).toBe(
        "aed511d0451aea33a14f7e9204595fc2211f233f",
      );
      expect(chart.status).toBe("illustrative");
      expect(chart.limitations.join(" ")).toContain("not solver-derived");
      expect(chart.limitations.join(" ")).toContain(
        "not a verified strategy match",
      );
      expect(chart.assumptions.join(" ")).toContain(
        "The source does not specify this size",
      );
    }
  });

  it("uses a unique complete 169-class standard grid accounting for 1,326 hands", () => {
    for (const chart of openingCharts) {
      expect(chart.cells).toHaveLength(169);
      expect(new Set(chart.cells.map((cell) => cell.hand)).size).toBe(169);
      expect(chart.cells[0].hand).toBe("AA");
      expect(chart.cells[1].hand).toBe("AKs");
      expect(chart.cells[13].hand).toBe("AKo");
      expect(chart.cells[14].hand).toBe("KK");
      expect(chart.cells[168].hand).toBe("22");
      expect(
        chart.cells.reduce(
          (sum, cell) =>
            sum +
            (cell.hand.length === 2 ? 6 : cell.hand.endsWith("s") ? 4 : 12),
          0,
        ),
      ).toBe(1326);
    }
  });

  it("identifies independent suited/offsuit/pair fixtures and validates known blockers", () => {
    expect(startingHandClass(["As", "Kh"])).toBe("AKo");
    expect(startingHandClass(["Ks", "As"])).toBe("AKs");
    expect(startingHandClass(["Ad", "Ac"])).toBe("AA");
    const state = unopened(9, 0);
    state.players[0].hole = ["As", "2h"];
    const guide = livePreflopGuide(state);
    expect(guide.hand).toBe("A2o");
    expect(guide.suggestedAction).toBe("fold");
    expect(guide.raiseTo).toBeUndefined();
    state.players[0].hole = ["As", "As"];
    expect(livePreflopGuide(state).status).toBe("unavailable");
    state.players[0].hole = ["As", "2h"];
    state.board = ["As"];
    expect(livePreflopGuide(state).reason).toContain("invalid");
  });

  it("matches the exact original table count and rotating button for every included position", () => {
    for (const chart of openingCharts) {
      const dealer = Array.from(
        { length: chart.players },
        (_, seat) => seat,
      ).find(
        (seat) => positionName(0, seat, chart.players) === chart.position,
      )!;
      const state = unopened(chart.players, dealer);
      state.players[0].hole = ["As", "Ah"];
      const guide = livePreflopGuide(state);
      expect(guide.status).toBe("available");
      expect(guide.chart?.id).toBe(chart.id);
      expect(guide.position).toBe(chart.position);
      expect(guide.suggestedAction).toBe("raise");
      expect(guide.raiseTo).toBe(chart.position === "Small blind" ? 30 : 25);
      expect(guide.chart?.players).toBe(chart.players);
      expect(guide.comparison).toBeUndefined();
    }
  });

  it("does not silently substitute ranges at unsupported table sizes", () => {
    for (const count of [3, 4, 5, 7, 8]) {
      const guide = livePreflopGuide(unopened(count));
      expect(guide.status).toBe("unavailable");
      expect(guide.reason).toContain(`${count} players`);
      expect(guide.chart).toBeUndefined();
    }
  });

  it("requires first-action, unopened public history rather than only hand and position", () => {
    const missing = frame();
    missing.actions = undefined;
    expect(preflopGuide(missing).reason).toContain(
      "complete public action history",
    );
    const raised = frame();
    raised.actions = [
      { seat: 3, street: "preflop", action: "raise", amount: 36 },
    ];
    expect(preflopGuide(raised).reason).toContain("already raised");
    raised.actions.push({
      seat: 4,
      street: "preflop",
      action: "raise",
      amount: 130,
    });
    expect(preflopGuide(raised).chart).toBeUndefined();
    const limped = frame();
    limped.actions = [{ seat: 3, street: "preflop", action: "call" }];
    expect(preflopGuide(limped).reason).toContain("limped or called");
    const previous = frame();
    previous.actions?.push({ seat: 0, street: "preflop", action: "call" });
    expect(preflopGuide(previous).reason).toContain("not your first action");
  });

  it("rejects inconsistent or out-of-order public folds, hidden prior actions and missing turn state", () => {
    const corruptions: ((f: DecisionFrame) => void)[] = [
      (f) => f.actions!.reverse(),
      (f) => (f.actions![0].action = "check"),
      (f) => (f.actions![0].street = "flop"),
      (f) => (f.actions![0].amount = 10),
      (f) => f.actions!.pop(),
      (f) => (f.players[f.actions![0].seat].folded = false),
      (f) => (f.players[1].folded = true),
      (f) => (f.lastActBet[0] = 10),
      (f) => (f.lastActBet[3] = null),
      (f) => (f.pending = [0]),
      (f) => f.pending.push(0),
      (f) => (f.eventCount = 0),
      (f) => (f.currentBet = 20),
      (f) => (f.minRaise = 20),
      (f) => (f.players[5].seat = 6),
    ];
    for (const corrupt of corruptions) {
      const f = frame(unopened(6, 0));
      expect(preflopGuide(f).status).toBe("available");
      corrupt(f);
      expect(preflopGuide(f).status).toBe("unavailable");
    }
  });

  it("excludes changed depth, antes, unexpected chips, payouts and all-ins including folded seats", () => {
    const corruptions: ((f: DecisionFrame) => void)[] = [
      (f) => (f.players[0].stack = 500),
      (f) => (f.players[3].stack = 999),
      (f) => (f.players[3].contributed = 1),
      (f) => (f.players[3].streetBet = 1),
      (f) => (f.players[1].streetBet = 10),
      (f) => (f.players[2].contributed = 20),
      (f) => (f.players[0].payout = 15),
      (f) => (f.players[5].allIn = true),
    ];
    for (const corrupt of corruptions) {
      const f = frame();
      corrupt(f);
      expect(preflopGuide(f).status).toBe("unavailable");
      expect(preflopGuide(f).reason).toContain("100-big-blind");
    }
  });

  it("excludes big-blind decisions, all later streets, completed hands and other players' turns", () => {
    const bigBlind = frame(createTable("bb", 6, 18, 4));
    expect(preflopGuide(bigBlind).reason).toContain("big-blind");
    for (const [street, board] of [
      ["flop", ["2c", "3d", "4h"]],
      ["turn", ["2c", "3d", "4h", "5s"]],
      ["river", ["2c", "3d", "4h", "5s", "6c"]],
    ] as const) {
      const f = frame();
      f.street = street;
      f.players[0].hole = ["As", "Kh"];
      f.board = [...board];
      expect(preflopGuide(f).reason).toContain("later streets");
    }
    const finished = unopened();
    finished.complete = true;
    expect(livePreflopGuide(finished).status).toBe("unavailable");
    const otherTurn = unopened();
    otherTurn.actor = 1;
    expect(livePreflopGuide(otherTurn).status).toBe("unavailable");
  });

  it("compares action alignment separately from opening size without calling departures mistakes", () => {
    const f = frame();
    f.players[0].hole = ["As", "Ah"];
    expect(preflopGuide(f).comparison?.matches).toBe(true);
    f.amount = 80;
    const size = preflopGuide(f);
    expect(size.comparison?.matches).toBe(true);
    expect(size.comparison?.explanation).toContain(
      "does not compare the value",
    );
    expect(size.comparison?.explanation).toContain("80 chips");
    f.action = "call";
    const departure = preflopGuide(f);
    expect(departure.comparison?.matches).toBe(false);
    expect(departure.comparison?.explanation).toContain(
      "not a calculated mistake",
    );
    expect(departure.comparison?.explanation).toContain("raise to 25");
    f.players[0].hole = ["7s", "2h"];
    f.action = "fold";
    expect(preflopGuide(f).comparison?.matches).toBe(true);
  });

  it("is read-only and independent of private cards, future board and completed-hand reviews", () => {
    const state = unopened(9, 3);
    state.players[0].hole = ["As", "Ah"];
    const before = JSON.stringify(state);
    const expected = livePreflopGuide(state);
    expect(JSON.stringify(state)).toBe(before);
    for (const player of state.players.slice(1))
      Object.defineProperty(player, "hole", {
        get() {
          throw new Error("Private opponent cards were accessed");
        },
      });
    for (const property of ["runout", "rounds", "decisions", "review"])
      Object.defineProperty(state, property, {
        get() {
          throw new Error(`${property} was accessed`);
        },
      });
    expect(livePreflopGuide(state)).toEqual(expected);
    const result = preflopGuide(frame(state));
    expect(result.chart?.id).toBe(expected.chart?.id);
    expect(JSON.stringify(result)).not.toContain("hole");
    expect(JSON.stringify(result)).not.toContain("runout");
  });
});
