import { describe, expect, it } from "vitest";
import { createTable, type DecisionFrame } from "../packages/poker/src/table";
import { analyzeTable } from "../packages/poker/src/table-review";

describe("draw density in public decision reviews", () => {
  it("uses inferred range weights and blockers, without actual opponent cards or future board", () => {
    // Independently specified uniform-range snapshot: two hearts on a spread-out
    // flop require two opponent hearts. 11 choose 2 = 55 of 47 choose 2 = 1,081.
    // Two hole cards cannot make a four-rank run with this 2/7/Q board.
    const state = createTable("draw-review", 2, 1);
    const players = structuredClone(state.players);
    players[0].hole = ["As", "Ad"];
    players[1].hole = ["Kd", "Qd"];
    const frame: DecisionFrame = {
      id: 0,
      street: "flop",
      board: ["2h", "7h", "Qc"],
      players,
      dealer: 0,
      currentBet: 0,
      minRaise: 10,
      pending: [0, 1],
      lastActBet: [null, null],
      action: "check",
      eventCount: 0,
      actions: [],
      policyVersion: 2,
    };
    frame.players.forEach((p) => {
      p.streetBet = 0;
    });
    state.decisions = [frame];
    state.policyEvents = [];
    const changed = structuredClone(state);
    changed.decisions![0].players[1].hole = ["Ah", "Kh"];
    changed.runout = ["2h", "7h", "Qc", "Jh", "Th"];
    analyzeTable(state);
    analyzeTable(changed);
    const density = state.rounds![0].opponents[0].drawDensity!;
    expect(density.percent).toBeCloseTo((100 * 55) / 1081);
    expect(density.flushDraw).toBeCloseTo((100 * 55) / 1081);
    expect(density.openEndedStraightDraw).toBe(0);
    expect(changed.rounds![0].opponents[0].drawDensity).toEqual(density);
    expect(state.rounds![0].modelRating).toEqual(
      changed.rounds![0].modelRating,
    );
    expect(state.rounds![0].analysisVersion).toBe(7);
  });
});
