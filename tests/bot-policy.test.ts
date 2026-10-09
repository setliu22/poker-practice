import { describe, expect, it } from "vitest";
import { random, deal } from "../packages/poker/src/index";
import {
  personalities,
  publicProfile,
  handFeatures,
  type BotObservation,
} from "../packages/poker/src/bot-policy";
import {
  act,
  botDistribution,
  botAction,
  botObservation,
  createTable,
  runBots,
  tableView,
} from "../packages/poker/src/table";
import {
  inferredRange,
  analyzeTable,
} from "../packages/poker/src/table-review";
function observation(overrides: Partial<BotObservation> = {}): BotObservation {
  return {
    policyVersion: 2,
    botId: "theo",
    hole: ["As", "Kd"],
    board: ["Ac", "7h", "2s"],
    style: "Tight-aggressive",
    pot: 100,
    currentBet: 0,
    streetBet: 0,
    playersLeft: 2,
    seat: 1,
    dealer: 1,
    tableSize: 2,
    activeSeats: [0, 1],
    stack: 900,
    effectiveStack: 900,
    history: [],
    reads: [],
    legal: {
      toCall: 0,
      canCheck: true,
      canRaise: true,
      minRaiseTo: 10,
      maxRaiseTo: 900,
    },
    ...overrides,
  };
}
const raise = (o: BotObservation) =>
  botDistribution(o)
    .filter((v) => v.action === "raise")
    .reduce((n, v) => n + v.probability, 0);
const call = (o: BotObservation) =>
  botDistribution(o).find((v) => v.action === "call")?.probability ?? 0;
const facing = {
  toCall: 50,
  canCheck: false,
  canRaise: true,
  minRaiseTo: 100,
  maxRaiseTo: 900,
};
describe("contextual bot personalities", () => {
  it("never folds an unbeatable shared straight or quads, but does not lock a flush-vulnerable straight", () => {
    for (const board of [
      ["Tc", "Jd", "Qh", "Ks", "Ac"],
      ["2c", "2d", "2h", "2s", "Ac"],
    ]) {
      const o = observation({ hole: ["7d", "8d"], board, legal: facing });
      expect(handFeatures(o.hole, board).lockedBoard).toBe(true);
      expect(call(o)).toBe(1);
      expect(raise(o)).toBe(0);
    }
    expect(
      handFeatures(["7d", "8d"], ["Tc", "Jc", "Qc", "Ks", "Ah"]).lockedBoard,
    ).toBe(false);
    // A king-high straight board can lose to an ace in the opponent's hand.
    expect(
      handFeatures(["7d", "8d"], ["9c", "Td", "Jh", "Qs", "Kc"]).lockedBoard,
    ).toBe(false);
  });
  it("recognizes nut-flush draws when the ace or higher suited cards are on the board", () => {
    expect(
      handFeatures(["Kh", "2c"], ["Ah", "7h", "8d", "3h"]).nutFlushDraw,
    ).toBe(true);
    expect(
      handFeatures(["Qh", "2c"], ["Ah", "Kh", "8d", "3h"]).nutFlushDraw,
    ).toBe(true);
    expect(
      handFeatures(["Qh", "2c"], ["Ah", "7h", "8d", "3h"]).nutFlushDraw,
    ).toBe(false);
  });
  it("counts a bet already in front of an opponent toward the effective stack", () => {
    const s = createTable("effective", 2, 9);
    act(s, 0, "raise", 900);
    const o = botObservation(s);
    // Hero has 100 behind plus 900 committed; bot has 990 behind and 10 committed.
    expect(o.stack).toBe(990);
    expect(o.effectiveStack).toBe(990);
    expect(o.legal.toCall).toBe(890);
  });
  it("deals eight distinct named opponents with public, non-secret profiles", () => {
    const s = createTable("roster", 9, 1),
      bots = tableView(s).players.slice(1);
    expect(new Set(bots.map((p) => p.name)).size).toBe(8);
    expect(new Set(bots.map((p) => p.style)).size).toBe(8);
    expect(
      bots.every((p) => p.profile?.tendencies.length === 3 && !p.hole),
    ).toBe(true);
    expect(JSON.stringify(bots)).not.toContain("tuning");
    expect(publicProfile("mara")?.style).toBe("Patient trapper");
  });
  it("gives every profile a normalized distribution of legal, distinct sizes over seeded contexts", () => {
    const rng = random(72);
    for (const p of personalities)
      for (let i = 0; i < 40; i++) {
        const cards = deal(i + 100, 7),
          board = cards.slice(2, 2 + [0, 3, 4, 5][i % 4]);
        const stack = 10 + Math.floor(rng() * 990),
          toCall = i % 3 ? Math.min(stack, 25) : 0;
        const o = observation({
          botId: p.id,
          hole: cards.slice(0, 2),
          board,
          stack,
          legal: {
            toCall,
            canCheck: toCall === 0,
            canRaise: stack > toCall,
            minRaiseTo: Math.min(stack, 50),
            maxRaiseTo: stack,
          },
        });
        const choices = botDistribution(o);
        expect(choices.reduce((n, c) => n + c.probability, 0)).toBeCloseTo(
          1,
          12,
        );
        for (const c of choices) {
          expect(c.probability).toBeGreaterThanOrEqual(0);
          expect(Number.isFinite(c.probability)).toBe(true);
          if (c.action === "raise") {
            expect(o.legal.canRaise).toBe(true);
            expect(Number.isInteger(c.amount)).toBe(true);
            expect(c.amount).toBeGreaterThanOrEqual(o.legal.minRaiseTo);
            expect(c.amount).toBeLessThanOrEqual(stack);
          }
          if (c.action === "check") expect(toCall).toBe(0);
          if (c.action === "call") expect(toCall).toBeGreaterThan(0);
        }
        expect(
          new Set(
            choices.filter((c) => c.action === "raise").map((c) => c.amount),
          ).size,
        ).toBe(choices.filter((c) => c.action === "raise").length);
        expect(botAction(o, 42)).toEqual(botAction(o, 42));
      }
  });
  it("opens a marginal hand more often on the button than in early position", () => {
    const o = observation({
      board: [],
      hole: ["Ks", "9d"],
      tableSize: 6,
      activeSeats: [0, 1, 2, 3, 4, 5],
      playersLeft: 6,
      dealer: 0,
    });
    expect(raise({ ...o, seat: 0 })).toBeGreaterThan(raise({ ...o, seat: 3 }));
  });
  it("identifies real flush, nut-flush, straight and backdoor draws without calling them equity", () => {
    const combo = handFeatures(["Ah", "Qh"], ["Jh", "Th", "2c"]);
    expect(combo.flushDraw).toBe(true);
    expect(combo.nutFlushDraw).toBe(true);
    expect(combo.straightOutRanks).toBe(1);
    expect(
      handFeatures(["6s", "7d"], ["5c", "8h", "Ks"]).straightOutRanks,
    ).toBe(2);
    expect(handFeatures(["Ah", "Qh"], ["Jh", "7c", "2d"]).backdoor).toBe(true);
    expect(
      handFeatures(["As", "2c"], ["6c", "7d", "8h", "9s"]).straightOutRanks,
    ).toBe(0);
    expect(
      handFeatures(["Ah", "Qh"], ["Jh", "Th", "2c", "3d", "4s"]).draw,
    ).toBe(0);
  });
  it("Nico semi-bluffs a strong draw more often than a comparable miss", () => {
    const o = observation({
      botId: "nico",
      hole: ["6h", "7h"],
      board: ["5h", "8h", "Kc"],
    });
    expect(raise(o)).toBeGreaterThan(
      raise({ ...o, hole: ["6s", "7d"], board: ["2h", "9h", "Kc"] }),
    );
  });
  it("Mara slow-plays safer monsters, protects on wet boards, and increases aggression later", () => {
    const dry = observation({
      botId: "mara",
      hole: ["7c", "7d"],
      board: ["Ks", "7h", "2c"],
    });
    const wet = { ...dry, board: ["8h", "7h", "6h"] };
    expect(raise(dry)).toBeLessThan(raise(wet));
    const river = {
      ...dry,
      board: [...dry.board, "3d", "9c"],
      history: [
        { seat: 1, street: "flop", action: "check" as const },
        { seat: 1, street: "turn", action: "call" as const },
      ],
    };
    expect(raise(river)).toBeGreaterThan(raise(dry));
    const facingBet = { ...dry, currentBet: 50, legal: facing };
    expect(
      raise({
        ...facingBet,
        history: [{ seat: 1, street: "flop", action: "check" }],
      }),
    ).toBeGreaterThan(raise(facingBet));
  });
  it("Felix calls weak pairs more often and raises strong hands less often than Theo", () => {
    const o = observation({
      hole: ["7c", "8d"],
      currentBet: 50,
      legal: facing,
    });
    expect(call({ ...o, botId: "felix" })).toBeGreaterThan(
      call({ ...o, botId: "theo" }),
    );
    const strong = observation({ hole: ["7c", "7d"] });
    expect(raise({ ...strong, botId: "felix" })).toBeLessThan(
      raise({ ...strong, botId: "theo" }),
    );
  });
  it("reduces pure bluffing multiway and generates larger polarized sizes for Sloane", () => {
    const air = observation({
      botId: "sloane",
      hole: ["3c", "5d"],
      board: ["Kh", "9s", "2c", "7d", "Jc"],
    });
    expect(
      raise({
        ...air,
        playersLeft: 5,
        tableSize: 5,
        activeSeats: [0, 1, 2, 3, 4],
      }),
    ).toBeLessThan(raise(air));
    expect(
      botDistribution(air).some(
        (v) => v.action === "raise" && v.amount! > air.pot,
      ),
    ).toBe(true);
  });
  it("Remy adapts gradually to observed folds, without treating one fold as a certainty", () => {
    const air = observation({
      botId: "remy",
      hole: ["3c", "5d"],
      board: ["Kh", "9s", "2c", "7d", "Jc"],
    });
    const read = {
      seat: 0,
      decisions: 80,
      facing: 60,
      folds: 50,
      calls: 5,
      raises: 5,
    };
    expect(raise({ ...air, reads: [read] })).toBeGreaterThan(raise(air));
    const one = {
      ...read,
      decisions: 1,
      facing: 1,
      folds: 1,
      calls: 0,
      raises: 0,
    };
    expect(Math.abs(raise({ ...air, reads: [one] }) - raise(air))).toBeLessThan(
      0.02,
    );
  });
  it("never folds a guaranteed board-only royal-flush tie or tries to grow that pot", () => {
    const o = observation({
      board: ["Tc", "Jc", "Qc", "Kc", "Ac"],
      hole: ["2d", "3d"],
      currentBet: 50,
      legal: facing,
    });
    expect(raise(o)).toBe(0);
    expect(call(o)).toBe(1);
  });
  it("uses no hidden opponent cards or future board in observations or actions", () => {
    const s = createTable("privacy", 3, 6);
    act(s, 0, "call");
    const a = botObservation(s);
    const other = structuredClone(s);
    other.players[0].hole = ["As", "Ah"];
    other.runout = ["Ks", "Qs", "Js", "Ts", "9s"];
    expect(botObservation(other)).toEqual(a);
    expect(a).not.toHaveProperty("players");
    expect(a).not.toHaveProperty("seed");
    expect(a).not.toHaveProperty("runout");
    expect(botAction(botObservation(other), 123)).toEqual(botAction(a, 123));
  });
  it("stores the exact public policy context for inference, with size likelihoods matching the played bot", () => {
    const s = createTable("inference", 2, 1);
    act(s, 0, "call");
    runBots(s);
    const event = s.policyEvents![0];
    expect(event.observation.policyVersion).toBe(2);
    expect(event.observation).not.toHaveProperty("hole");
    const dist = botDistribution({
      ...event.observation,
      hole: s.players[1].hole,
    });
    expect(
      dist.some(
        (c) =>
          c.action === event.action &&
          (c.action !== "raise" || c.amount === event.amount) &&
          c.probability > 0,
      ),
    ).toBe(true);
    const f = s.decisions![0];
    f.eventCount = s.policyEvents!.length;
    f.board = [...s.board];
    const range = inferredRange(s, f, 1);
    expect(
      range.some(
        (c) =>
          c.cards.includes(s.players[1].hole[0]) &&
          c.cards.includes(s.players[1].hole[1]),
      ),
    ).toBe(true);
  });
  it("keeps reads across deals and snapshots them before each decision", () => {
    const s = createTable("reads", 2, 1);
    act(s, 0, "fold");
    expect(s.decisions![0].reads).toEqual([]);
    expect(s.reads!.find((r) => r.seat === 0)?.folds).toBe(1);
    const next = createTable(s.id, 2, 2, 1, 2, 0, 2, s.reads);
    expect(next.reads).toEqual(s.reads);
    expect(next.reads).not.toBe(s.reads);
  });
  it("keeps legacy saved hands on their original policy until the next deal", () => {
    const s = createTable("legacy", 2, 1, 0, 1, 0, 1);
    expect(s.players[1].name).toBe("Bot 1");
    act(s, 0, "call");
    runBots(s);
    analyzeTable(s);
    expect(s.policyEvents![0].observation.policyVersion).toBe(1);
    expect(s.rounds!.length).toBeGreaterThan(0);
    expect(tableView(s).players[1].profile).toBeUndefined();
  });
});
