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
  valueModel,
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
    const fold = s.rounds![0].comparisons!.find((c) => c.key === "fold")!;
    expect(fold.difference).toBe(-20);
    expect(fold.margin).toBe(0);
    expect(fold.samples).toBe(0);
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
  it("conditions a multiway joint range on collisions without sequential-seat bias", () => {
    const f = frame(3);
    f.board = ["2c", "3d", "7h", "9s", "Jc"];
    f.players[0].hole = ["Qs", "Qh"];
    const ranges = new Map([
      [
        1,
        [
          { cards: ["Ks", "Kh"], weight: 0.9 },
          { cards: ["Ts", "Th"], weight: 0.1 },
        ],
      ],
      [
        2,
        [
          { cards: ["Ks", "Kd"], weight: 0.9 },
          { cards: ["8s", "8h"], weight: 0.1 },
        ],
      ],
    ]);
    // KK/KK is illegal. Of legal mass .09 + .09 + .01, hero only wins .01.
    // Sequentially renormalizing the second seat would incorrectly give 1%.
    const result = probability(f, ranges, 330);
    expect(result.share).toBeCloseTo(100 / 19, -0.5);
  });
  it("reports paired comparisons without claiming an inconclusive action was good", () => {
    const s = createTable("paired-review", 2, 1);
    act(s, 0, "call");
    runBots(s);
    analyzeTable(s);
    const r = s.rounds![0];
    expect(r.analysisVersion).toBe(3);
    expect(r.comparisons).toHaveLength(r.values.length - 1);
    for (const c of r.comparisons!) {
      const chosen = r.values.find((v) => v.key === r.chosenKey)!;
      const alternative = r.values.find((v) => v.key === c.key)!;
      expect(c.difference).toBeCloseTo(alternative.chips - chosen.chips);
      expect(c.samples).toBe(640);
      expect(c.clear).toBe(c.difference > c.margin);
      expect(c.margin).toBeGreaterThanOrEqual(0);
    }
    expect(r.model).toContain("not incorrect bot assumptions");
    expect(r.values.every((v) => !("outcomes" in v))).toBe(true);
    if (!r.comparisons!.some((c) => c.clear))
      expect(r.explanation).toContain("not evidence your action was good");
    const copy = structuredClone(s);
    copy.rounds![0].analysisVersion = 1;
    copy.rounds![0].verdict = "stale";
    analyzeTable(copy);
    expect(copy.rounds).toEqual(s.rounds);
  });
  it("enumerates river bets, folds, calls and bot raises with independently calculated payouts", () => {
    const f = frame();
    f.policyVersion = 1;
    f.board = ["2c", "3d", "7h", "9s", "Jc"];
    f.players[0].hole = ["As", "Ah"];
    f.players.forEach((p) => {
      p.contributed = 50;
      p.streetBet = 0;
      p.stack = 950;
    });
    f.players[1].style = "Tight";
    f.currentBet = 0;
    f.pending = [0, 1];
    f.action = "raise";
    f.amount = 50;
    const evaluate = (cards: string[], seed = 1) =>
      valueModel(f, new Map([[1, [{ cards, weight: 1 }]]]), seed);
    const weak = evaluate(["Ks", "Kh"]);
    // Legacy tight policy raises a pair 1.3%; otherwise checks, or folds
    // when facing this price. River pot100: check -> raise45 -> call45.
    expect(weak.find((v) => v.key === "check")!.chips).toBeCloseTo(
      100 + 0.013 * 45,
    );
    // Bet50 -> opponent folds98.7%, or raises to118 then hero calls.
    expect(weak.find((v) => v.key === "raise")!.chips).toBeCloseTo(
      0.987 * 100 + 0.013 * 218,
    );
    expect(weak.find((v) => v.key === "raise")!.allFold).toBeCloseTo(98.7);
    const strong = evaluate(["7s", "7d"]);
    // Trips raise65%, otherwise call35%; hero loses every showdown.
    expect(strong.find((v) => v.key === "check")!.chips).toBeCloseTo(
      -0.65 * 45,
    );
    expect(strong.find((v) => v.key === "raise")!.chips).toBeCloseTo(
      -0.35 * 50 - 0.65 * 118,
    );
    expect(strong.find((v) => v.key === "fold")!.chips).toBe(0);
    expect(evaluate(["Ks", "Kh"], 999)).toEqual(weak);
    for (const v of [...weak, ...strong]) {
      expect(v.exact).toBe(true);
      expect(v.samples).toBe(0);
      expect(v.margin).toBe(0);
    }
    // With only50left, a bet is all-in: no opponent raise is legal.
    f.players.forEach((p) => {
      p.stack = 50;
      p.contributed = 950;
    });
    expect(evaluate(["7s", "7d"]).find((v) => v.key === "raise")!.chips).toBe(
      -50,
    );
  });
});
