import { describe, expect, it } from "vitest";
import {
  createTable,
  act,
  replayTable,
  runBots,
  type DecisionFrame,
} from "../packages/poker/src/table";
import { inferredRange } from "../packages/poker/src/table-review";
import { liveOdds, liveOddsFrame } from "../packages/poker/src/live-odds";
import {
  estimateShowdown,
  binomialInterval,
  LIVE_ODDS_SAMPLES,
} from "../packages/poker/src/showdown";

function fixture(board: string[] = [], count = 2): DecisionFrame {
  const state = createTable("odds-fixture", count, 12);
  state.players[0].hole = ["As", "Ah"];
  state.board = board;
  state.street = ["preflop", "", "", "flop", "turn", "river"][board.length];
  return liveOddsFrame(state);
}

describe("live showdown equity", () => {
  it("keeps sampled odds identical in an exact replay despite a new game ID and reset revisions", async () => {
    const original = createTable("original-odds", 2, 1, 0, 6, 17);
    const beforeCall = structuredClone(original);
    act(original, 0, "call");
    original.revision++;
    runBots(original);
    expect(original.complete).toBe(false);
    const afterCall = structuredClone(original);
    act(original, 0, "fold");
    original.revision++;
    runBots(original);
    const replay = replayTable(original, "replay-odds");
    expect(replay.revision).toBe(0);
    expect(replay.id).not.toBe(beforeCall.id);
    const compare = async (snapshot: typeof original) => {
      const expected = await liveOdds(snapshot);
      const actual = await liveOdds(replay);
      expect(expected.exact).toBe(false);
      expect(actual.revision).not.toBe(expected.revision);
      expect(actual).toEqual({ ...expected, revision: replay.revision });
    };
    await compare(beforeCall);
    act(replay, 0, "call");
    replay.revision++;
    runBots(replay);
    expect(replay.actions).toEqual(afterCall.actions);
    expect(replay.policyEvents).toEqual(afterCall.policyEvents);
    await compare(afterCall);
  }, 10000);
  it("has materially better precision than 400 samples without optional stopping", () => {
    const old = binomialInterval(50, 400),
      current = binomialInterval(50, LIVE_ODDS_SAMPLES);
    expect(old[1] - 50).toBeGreaterThan(4.8);
    expect(current[1] - 50).toBeLessThan(1.3);
    expect(binomialInterval(0, LIVE_ODDS_SAMPLES)[1]).toBeGreaterThan(0);
  });
  it("removes blockers, validates weights and rejects an empty surviving range", async () => {
    const f = fixture(["2c", "3d", "7h", "9s", "Jc"]);
    const valid = [{ cards: ["Ks", "Kh"], weight: 1 }];
    const result = await estimateShowdown(
      f,
      new Map([
        [
          1,
          [
            ...valid,
            { cards: ["As", "Kd"], weight: 20 },
            { cards: ["2c", "Qd"], weight: 10 },
          ],
        ],
      ]),
      1,
    );
    expect(result.win).toBe(100);
    expect(result.exact).toBe(true);
    await expect(
      estimateShowdown(
        f,
        new Map([[1, [{ cards: ["As", "Kd"], weight: 1 }]]]),
        1,
      ),
    ).rejects.toThrow("blocked");
    await expect(
      estimateShowdown(
        f,
        new Map([[1, [{ cards: ["Ks", "Ks"], weight: 1 }]]]),
        1,
      ),
    ).rejects.toThrow("unique");
    await expect(
      estimateShowdown(
        f,
        new Map([[1, [{ cards: ["Ks", "Kh"], weight: NaN }]]]),
        1,
      ),
    ).rejects.toThrow("weights");
    await expect(estimateShowdown(f, new Map(), 1)).rejects.toThrow("nonempty");
  });
  it("distinguishes outright wins, first-place ties and multiway share", async () => {
    const f = fixture(["Tc", "Jc", "Qc", "Kc", "Ac"], 4);
    f.players[2].folded = true;
    const state = createTable("ranges", 4, 2);
    const ranges = new Map(
      [1, 3].map((seat) => [seat, inferredRange(state, f, seat)]),
    );
    const result = await estimateShowdown(f, ranges, 2);
    expect(result).toMatchObject({ win: 0, tie: 100, lose: 0, exact: true });
    expect(result.share).toBeCloseTo(100 / 3);
    expect(result.intervals.share).toEqual([result.share, result.share]);
  });
  it("enumerates independent turn and river fixtures against a specified range", async () => {
    const f = fixture(["2c", "3d", "7h", "9s"]);
    const range = new Map([[1, [{ cards: ["Ks", "Kh"], weight: 1 }]]]);
    const turn = await estimateShowdown(f, range, 1);
    expect(turn.exact).toBe(true);
    // Only the two remaining kings win for KK; 42 of 44 legal rivers win for AA.
    expect(turn.win).toBeCloseTo((100 * 42) / 44);
    expect(turn.tie).toBe(0);
    f.board.push("Kc");
    const river = await estimateShowdown(f, range, 1);
    expect(river).toMatchObject({ win: 0, share: 0, lose: 100, exact: true });
  });
  it("weights wins and first-place ties separately and rejects colliding multiway hands", async () => {
    const f = fixture(["2c", "3d", "7h", "9s", "Jc"]);
    const result = await estimateShowdown(
      f,
      new Map([
        [
          1,
          [
            { cards: ["Ks", "Kh"], weight: 1 }, // AA wins
            { cards: ["Js", "Jh"], weight: 2 }, // Trips beat AA
            { cards: ["Ac", "Ad"], weight: 1 }, // AA ties AA
          ],
        ],
      ]),
      1,
    );
    expect(result.win).toBeCloseTo(25);
    expect(result.tie).toBeCloseTo(25);
    expect(result.share).toBeCloseTo(37.5);
    const multi = fixture(["2c", "3d", "7h", "9s", "Jc"], 3);
    await expect(
      estimateShowdown(
        multi,
        new Map([
          [1, [{ cards: ["Ks", "Kh"], weight: 1 }]],
          [2, [{ cards: ["Ks", "Kd"], weight: 1 }]],
        ]),
        1,
      ),
    ).rejects.toThrow("legal joint");
  });
  it("keeps all-in opponents competing and excludes folded seats from tie shares", async () => {
    const state = createTable("all-in", 4, 1);
    state.players[0].hole = ["2h", "3h"];
    state.board = ["Tc", "Jc", "Qc", "Kc", "Ac"];
    state.street = "river";
    state.players[1].folded = state.players[3].folded = true;
    state.players[2].stack = 0;
    state.players[2].allIn = true;
    const result = await liveOdds(state);
    expect(result).toMatchObject({ opponents: 1, win: 0, tie: 100, share: 50 });
  });
  it("handles flop runouts and retains honest finite-sample intervals", async () => {
    const f = fixture(["Ac", "Ad", "2c"]);
    const result = await estimateShowdown(
      f,
      new Map([[1, [{ cards: ["Ks", "Kh"], weight: 1 }]]]),
      1,
    );
    expect(result).toMatchObject({
      win: 100,
      tie: 0,
      share: 100,
      exact: false,
      samples: LIVE_ODDS_SAMPLES,
    });
    expect(result.intervals.win[0]).toBeLessThan(100);
    expect(result.intervals.share[0]).toBeLessThan(100);
  });
  it("is reproducible and approximately symmetric before the flop across seeds", async () => {
    const f = fixture();
    f.players[0].hole = ["As", "Ks"];
    const ranges = new Map([[1, [{ cards: ["Ah", "Kh"], weight: 1 }]]]);
    // Swapping spades/hearts swaps players in a uniform deck, so true share is50%.
    const a = await estimateShowdown(f, ranges, 123);
    const b = await estimateShowdown(f, ranges, 456);
    expect(Math.abs(a.share - 50)).toBeLessThan(2);
    expect(Math.abs(b.share - 50)).toBeLessThan(2);
    expect(await estimateShowdown(f, ranges, 123)).toEqual(a);
    expect(a.samples).toBe(LIVE_ODDS_SAMPLES);
  }, 10000);
  it("never reads secret cards, future runout, seed or completed-hand analysis", async () => {
    const state = createTable("privacy", 3, 1);
    state.players[2].folded = true;
    const before = structuredClone(state);
    const expected = await liveOdds(state);
    expect(state).toEqual(before);
    for (const key of ["seed", "runout", "decisions", "rounds", "review"])
      Object.defineProperty(state, key, {
        get() {
          throw new Error(`Secret ${key} was read`);
        },
      });
    for (const p of state.players.slice(1))
      Object.defineProperty(p, "hole", {
        get() {
          throw new Error("Hidden hole cards were read");
        },
      });
    const result = await liveOdds(state);
    expect(result).toEqual(expected);
    expect(result.opponents).toBe(1);
    expect(result.source).toBe("random-hands");
    expect(JSON.stringify(result)).not.toMatch(
      /"hole"|"runout"|"seed"|"cards"/,
    );
  });
  it("uses public action-weighted ranges and rejects completed/folded/mismatched snapshots", async () => {
    const state = createTable("public-actions", 3, 1);
    act(state, 0, "call");
    act(state, 1, "raise", 40);
    const odds = await liveOdds(state);
    expect(odds.source).toBe("inferred-ranges");
    expect(odds.opponents).toBe(2);
    state.complete = true;
    await expect(liveOdds(state)).rejects.toThrow("active hand");
    state.complete = false;
    state.players[0].folded = true;
    await expect(liveOdds(state)).rejects.toThrow("active hand");
    state.players[0].folded = false;
    state.board = ["2c", "3d", "4h"];
    await expect(liveOdds(state)).rejects.toThrow("street");
  });
});
