import { describe, it, expect } from "vitest";
import {
  createTable,
  act,
  legalActions,
  runBots,
  settle,
  tableView,
  botAction,
  type TableState,
} from "../packages/poker/src/table";
import { random, validateCards } from "../packages/poker/src/index";
function street(count = 3): TableState {
  const s = createTable("test", count, 42);
  s.street = "flop";
  s.board = s.runout.slice(0, 3);
  s.players.forEach((p) => {
    p.streetBet = 0;
  });
  s.currentBet = 0;
  s.minRaise = 10;
  s.actor = 0;
  s.pending = s.players.map((p) => p.seat);
  s.lastActBet = s.players.map(() => null);
  return s;
}
describe("table rules", () => {
  it("accepts 2–9 players and deals unique cards", () => {
    for (let n = 2; n <= 9; n++) {
      const s = createTable("x", n, 4);
      validateCards(
        [...s.players.flatMap((p) => p.hole), ...s.runout],
        n * 2 + 5,
        n * 2 + 5,
      );
      expect(s.players.reduce((a, p) => a + p.stack + p.contributed, 0)).toBe(
        n * 1000,
      );
    }
    expect(() => createTable("x", 10, 1)).toThrow();
  });
  it("heads-up dealer posts small blind and acts first preflop; big blind acts first postflop", () => {
    const s = createTable("x", 2, 1);
    expect(s.players[0].streetBet).toBe(5);
    expect(s.actor).toBe(0);
    act(s, 0, "call");
    expect(s.actor).toBe(1);
    act(s, 1, "check");
    expect(s.street).toBe("flop");
    expect(s.actor).toBe(1);
  });
  it("keeps the big blind option and starts multiway postflop left of the dealer", () => {
    const s = createTable("x", 3, 1);
    act(s, 0, "call");
    act(s, 1, "call");
    expect(s.actor).toBe(2);
    expect(legalActions(s)?.canRaise).toBe(true);
    act(s, 2, "check");
    expect(s.actor).toBe(1);
    expect(s.board).toHaveLength(3);
  });
  it("rejects out-of-turn actions, checking a bet, invalid sizes and excess chips", () => {
    const s = createTable("x", 2, 1);
    expect(() => act(s, 1, "call")).toThrow();
    expect(() => act(s, 0, "check")).toThrow();
    for (const amount of [11, 19, 1001, 25.5])
      expect(() => act(s, 0, "raise", amount)).toThrow();
  });
  it("a short all-in does not reopen raising for an already-acted player", () => {
    const s = street();
    act(s, 0, "raise", 100);
    s.players[1].stack = 150;
    s.players[1].contributed = 850;
    act(s, 1, "raise", 150);
    act(s, 2, "call");
    expect(s.actor).toBe(0);
    expect(legalActions(s)?.canRaise).toBe(false);
    expect(legalActions(s)?.toCall).toBe(50);
    expect(() => act(s, 0, "raise", 250)).toThrow();
  });
  it("cumulative short all-ins reopen action when they reach a full raise", () => {
    const s = street(4);
    act(s, 0, "raise", 100);
    s.players[1].stack = 150;
    s.players[1].contributed = 850;
    s.players[2].stack = 200;
    s.players[2].contributed = 800;
    act(s, 1, "raise", 150);
    act(s, 2, "raise", 200);
    act(s, 3, "call");
    expect(s.actor).toBe(0);
    expect(legalActions(s)?.canRaise).toBe(true);
    expect(legalActions(s)?.minRaiseTo).toBe(300);
  });
  it("runs out the board when all live players are all-in", () => {
    const s = createTable("x", 2, 1);
    act(s, 0, "raise", 1000);
    act(s, 1, "call");
    expect(s.complete).toBe(true);
    expect(s.board).toHaveLength(5);
    expect(s.players.reduce((sum, p) => sum + p.stack, 0)).toBe(2000);
  });
  it("ends immediately after everyone else folds and returns uncalled chips", () => {
    const s = createTable("x", 2, 1);
    act(s, 0, "fold");
    expect(s.complete).toBe(true);
    expect(s.players[1].stack).toBe(1005);
    expect(s.players[0].stack).toBe(995);
    expect(s.board).toEqual([]);
  });
  it("awards main and side pots only to eligible winners", () => {
    const s = createTable("x", 3, 1);
    s.board = ["2c", "3d", "4h", "8s", "9c"];
    s.players.forEach((p, i) => {
      p.hole = [
        ["As", "Ad"],
        ["Ks", "Kd"],
        ["Qs", "Qd"],
      ][i];
      p.contributed = [100, 300, 300][i];
      p.stack = 1000 - p.contributed;
    });
    settle(s);
    expect(s.players.map((p) => p.payout)).toEqual([300, 400, 0]);
    expect(s.players.map((p) => p.stack)).toEqual([1200, 1100, 700]);
  });
  it("splits ties and sends an odd chip clockwise from the dealer", () => {
    const s = createTable("x", 3, 1);
    s.board = ["As", "Ks", "Qs", "Js", "Ts"];
    s.players.forEach((p, i) => {
      p.hole = [
        ["2c", "3d"],
        ["4c", "5d"],
        ["6c", "7d"],
      ][i];
      p.contributed = 5;
      p.stack = 995;
    });
    s.players[2].folded = true;
    settle(s);
    expect(s.players.map((p) => p.payout)).toEqual([7, 8, 0]);
  });
  it("never exposes bot cards, seed, runout or feedback during play", () => {
    const s = createTable("x", 4, 1);
    const view = tableView(s);
    expect(view.players[0].hole).toHaveLength(2);
    expect(view.players.slice(1).every((p) => p.hole === undefined)).toBe(true);
    expect(view).not.toHaveProperty("runout");
    expect(view).not.toHaveProperty("seed");
    expect(view.review).toEqual([]);
  });
  it("bot policies are reproducible from their limited observations", () => {
    const o = {
      hole: ["As", "Kd"],
      board: [],
      style: "Tight",
      pot: 15,
      currentBet: 10,
      streetBet: 0,
      playersLeft: 3,
      legal: {
        toCall: 10,
        canCheck: false,
        canRaise: true,
        minRaiseTo: 20,
        maxRaiseTo: 1000,
      },
    };
    expect(botAction(o, 42)).toEqual(botAction(o, 42));
  });
  it("200 seeded hands terminate with legal actions and conserve chips at every step", () => {
    for (let seed = 0; seed < 200; seed++) {
      const n = 2 + (seed % 8),
        s = createTable("x", n, seed),
        rng = random(seed + 1000);
      let turns = 0;
      runBots(s);
      while (!s.complete) {
        expect(s.actor).toBe(0);
        const l = legalActions(s)!;
        const action = rng();
        if (l.canRaise && action < 0.2)
          act(s, 0, "raise", rng() < 0.3 ? l.maxRaiseTo : l.minRaiseTo);
        else if (action < 0.3) act(s, 0, "fold");
        else act(s, 0, l.canCheck ? "check" : "call");
        runBots(s);
        expect(++turns).toBeLessThan(100);
        const sum = s.players.reduce(
          (a, p) => a + p.stack + (s.complete ? 0 : p.contributed),
          0,
        );
        expect(sum).toBe(n * 1000);
      }
      expect(
        s.players.every((p) => p.stack >= 0 && Number.isInteger(p.stack)),
      ).toBe(true);
    }
  });
});
