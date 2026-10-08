import { describe, expect, it } from "vitest";
import {
  act,
  createTable,
  runBots,
  tableView,
  type DecisionFrame,
} from "../packages/poker/src/table";
import {
  analyzeTable,
  inferredRange,
  probability,
  recoverFrames,
} from "../packages/poker/src/table-review";
function frame(count = 2): DecisionFrame {
  const s = createTable("fixture", count, 44);
  return {
    id: 0,
    street: "river",
    board: ["Tc", "Jc", "Qc", "Kc", "Ac"],
    players: s.players,
    dealer: 0,
    currentBet: 0,
    minRaise: 10,
    pending: [0],
    lastActBet: s.players.map(() => null),
    action: "check",
    eventCount: 0,
  };
}
describe("decision review calculations", () => {
  it("enumerates river ties and divides multiway ties by the number of winners", () => {
    const f = frame(3);
    f.players[0].hole = ["2d", "3d"];
    f.players[1].hole = ["4d", "5d"];
    f.players[2].hole = ["6d", "7d"];
    const p = probability(f, new Map(), 1, true);
    expect(p.exact).toBe(true);
    expect(p.tie).toBe(100);
    expect(p.win).toBe(0);
    expect(p.share).toBeCloseTo(100 / 3);
  });
  it("enumerates a known turn result: AA loses only to the two remaining kings", () => {
    const f = frame();
    f.board = ["2c", "3d", "7h", "9s"];
    f.players[0].hole = ["As", "Ah"];
    f.players[1].hole = ["Ks", "Kh"];
    const p = probability(f, new Map(), 1, true);
    expect(p.exact).toBe(true);
    expect(p.share).toBeCloseTo((100 * 42) / 44);
    expect(p.lose).toBeCloseTo((100 * 2) / 44);
  });
  it("normalizes legal ranges, removes blockers and ignores later bot actions and actual hidden cards", () => {
    const s = createTable("range", 2, 1),
      f = frame();
    f.players = s.players;
    f.board = [];
    f.eventCount = 0;
    const range = inferredRange(s, f, 1);
    expect(range).toHaveLength(1225);
    expect(range.reduce((v, c) => v + c.weight, 0)).toBeCloseTo(1);
    expect(
      range.every((c) =>
        c.cards.every((card) => !f.players[0].hole.includes(card)),
      ),
    ).toBe(true);
    runBots(s);
    f.players[1].hole = ["As", "Ah"];
    expect(inferredRange(s, f, 1)).toEqual(range);
  });
  it("weights a bot range by its earlier action likelihood", () => {
    const s = createTable("range", 2, 1),
      f = frame();
    f.players = s.players;
    f.board = [];
    f.eventCount = 1;
    s.policyEvents = [
      {
        seat: 1,
        action: "call",
        observation: {
          board: [],
          style: "Tight",
          pot: 100,
          currentBet: 50,
          streetBet: 0,
          playersLeft: 2,
          legal: {
            toCall: 50,
            canCheck: false,
            canRaise: false,
            minRaiseTo: 60,
            maxRaiseTo: 1000,
          },
        },
      },
    ];
    const range = inferredRange(s, f, 1);
    expect(range.length).toBeLessThan(1225);
    expect(
      range.some((c) => c.cards.includes("2c") && c.cards.includes("7d")),
    ).toBe(false);
  });
  it("hides hindsight until completion, caches reviews, and reveals folded cards afterwards", () => {
    const s = createTable("privacy", 2, 1);
    act(s, 0, "call");
    runBots(s);
    analyzeTable(s);
    expect(s.complete).toBe(false);
    expect(tableView(s).rounds).toHaveLength(1);
    expect(tableView(s).rounds![0].actualCards).toBeUndefined();
    expect(tableView(s).rounds![0].actualProbability).toBeUndefined();
    const original = structuredClone(s.rounds);
    analyzeTable(s);
    expect(s.rounds).toEqual(original);
    act(s, 0, "fold");
    analyzeTable(s);
    expect(tableView(s).players[1].hole).toHaveLength(2);
    expect(tableView(s).rounds![0].actualProbability).toBeDefined();
    expect(s.rounds![1].values.find((v) => v.key === "fold")!.chips).toBe(0);
  });
  it("does not use actual bot cards or the future runout to evaluate an earlier decision", () => {
    const s = createTable("no-hindsight", 2, 1);
    act(s, 0, "call");
    runBots(s);
    const other = structuredClone(s);
    other.runout = ["Ac", "Kc", "Qc", "Jc", "Tc"];
    other.decisions![0].players[1].hole = ["2c", "3c"];
    analyzeTable(s);
    analyzeTable(other);
    expect(other.rounds).toEqual(s.rounds);
  });
  it("calculates a closing river call exactly and excludes sunk contributions", () => {
    const s = createTable("river-call", 2, 1);
    s.street = "river";
    s.board = ["Tc", "Jc", "Qc", "Kc", "Ac"];
    s.runout = [...s.board];
    s.players[0].hole = ["2d", "3d"];
    s.players[1].hole = ["4d", "5d"];
    s.players[0].contributed = 20;
    s.players[0].stack = 980;
    s.players[0].streetBet = 0;
    s.players[1].contributed = 30;
    s.players[1].stack = 970;
    s.players[1].streetBet = 10;
    s.currentBet = 10;
    s.pending = [0];
    s.actor = 0;
    s.lastActBet = [null, 10];
    act(s, 0, "call");
    analyzeTable(s);
    const call = s.rounds![0].values.find((v) => v.key === "call")!;
    expect(call.exact).toBe(true);
    expect(call.chips).toBe(20); // half of 60 minus new call of 10
    expect(s.rounds![0].callThreshold).toBeCloseTo(100 / 6);
    expect(s.rounds![0].rangeProbability.share).toBeCloseTo(50);
  });
  it("recovers decision snapshots from an older saved hand history", () => {
    const s = createTable("old", 2, 1);
    act(s, 0, "call");
    runBots(s);
    act(s, 0, "fold");
    const expected = structuredClone(s.decisions);
    delete s.analysisVersion;
    delete s.decisions;
    delete s.policyEvents;
    recoverFrames(s);
    expect(s.decisions).toEqual(expected);
  });
});
