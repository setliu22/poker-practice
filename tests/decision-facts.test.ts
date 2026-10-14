import { describe, expect, it } from "vitest";
import { decisionFacts } from "../packages/poker/src/decision-facts";
import { createTable, type DecisionFrame } from "../packages/poker/src/table";
import { positionName } from "../packages/shared/src/positions";

function fixture(count = 2): DecisionFrame {
  const state = createTable("facts", count, 12);
  state.players[0] = {
    ...state.players[0],
    hole: ["As", "Ah"],
    contributed: 20,
    streetBet: 0,
    stack: 980,
  };
  state.players[1] = {
    ...state.players[1],
    contributed: 30,
    streetBet: 10,
    stack: 970,
  };
  return {
    id: 0,
    street: "river",
    board: ["2c", "3d", "7h", "9s", "Jc"],
    players: state.players,
    dealer: 0,
    currentBet: 10,
    minRaise: 10,
    pending: [0],
    lastActBet: state.players.map(() => null),
    action: "call",
    eventCount: 0,
  };
}
describe("public decision facts", () => {
  it("identifies a fully matched closing river call without confusing equity and win probability", () => {
    const facts = decisionFacts(fixture());
    expect(facts.closingCall).toBe(true);
    expect(facts.callReason).toContain("pot share, including ties");
    expect(facts.bestFive).toHaveLength(5);
  });
  it("distinguishes a call price from a decision with future betting", () => {
    const frame = fixture();
    frame.street = "turn";
    frame.board.pop();
    expect(decisionFacts(frame).closingCall).toBe(false);
    expect(decisionFacts(frame).callReason).toContain("guaranteed showdown");
    frame.players[1].stack = 0;
    expect(decisionFacts(frame).closingCall).toBe(true);
  });
  it("excludes short all-in calls and side-pot contribution mismatches", () => {
    const frame = fixture();
    frame.players[0].stack = 5;
    expect(decisionFacts(frame).closingCall).toBe(false);
    frame.players[0].stack = 980;
    frame.players[1].contributed = 40;
    expect(decisionFacts(frame).closingCall).toBe(false);
    const multiway = fixture(3);
    multiway.players[2].folded = true;
    multiway.players[2].contributed = 50;
    expect(decisionFacts(multiway).closingCall).toBe(false);
  });
  it("excludes multiway calls and an opponent with an action still pending", () => {
    expect(decisionFacts(fixture(3)).closingCall).toBe(false);
    const frame = fixture();
    frame.pending.push(1);
    expect(decisionFacts(frame).playersStillToAct).toBe(1);
    expect(decisionFacts(frame).closingCall).toBe(false);
  });
  it("explains shared boards without promising that a jack-high straight flush always ties", () => {
    const frame = fixture();
    frame.players[0].hole = ["5s", "6s"];
    frame.board = ["Js", "Ts", "9s", "8s", "7s"];
    expect(decisionFacts(frame).observations.join(" ")).toContain(
      "does not prove a tie",
    );
    frame.board = ["As", "Ks", "Qs", "Js", "Ts"];
    expect(decisionFacts(frame).observations.join(" ")).toContain(
      "Every remaining player ties",
    );
  });
  it("keeps position and raises concrete and never reads opponents' hidden cards", () => {
    const frame = fixture(8);
    frame.board = [];
    frame.street = "preflop";
    frame.players[0].hole = ["As", "2h"];
    frame.dealer = 2;
    frame.actions = [
      { seat: 3, street: "preflop", action: "raise", amount: 36 },
      { seat: 4, street: "preflop", action: "raise", amount: 130 },
    ];
    for (const player of frame.players.slice(1))
      Object.defineProperty(player, "hole", {
        get() {
          throw new Error("Hidden hole cards were read");
        },
      });
    const result = decisionFacts(frame);
    expect(result.position).toBe("Hijack");
    expect(result.raises).toBe(2);
    expect(result.observations.join(" ")).toContain(
      "unopened-pot chart does not apply",
    );
    expect(result.observations.join(" ")).toContain("A2o");
    expect(result.bestFive).toBeUndefined();
  });
  it("names the button/blinds correctly at every table size and dealer seat", () => {
    for (let count = 2; count <= 9; count++)
      for (let dealer = 0; dealer < count; dealer++) {
        expect(positionName(dealer, dealer, count)).toBe(
          count === 2 ? "Button · Small blind" : "Button",
        );
        expect(positionName((dealer + 1) % count, dealer, count)).toBe(
          count === 2 ? "Big blind" : "Small blind",
        );
        if (count > 2)
          expect(positionName((dealer + 2) % count, dealer, count)).toBe(
            "Big blind",
          );
      }
  });
});
