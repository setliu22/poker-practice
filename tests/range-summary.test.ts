import { describe, expect, it } from "vitest";
import { deck } from "../packages/poker/src/index";
import {
  normalizedRange,
  rangeMadeMatchup,
  rangeMatrix,
  startingHandClass,
} from "../packages/poker/src/range-summary";
import {
  act,
  botDistribution,
  botObservation,
  createTable,
  type DecisionFrame,
} from "../packages/poker/src/table";
import { betResponsePreviews } from "../packages/poker/src/table-review";
import type { Combo } from "../packages/poker/src/showdown";

function allCombos(): Combo[] {
  return deck.flatMap((card, i) =>
    deck.slice(i + 1).map((other) => ({ cards: [card, other], weight: 1 })),
  );
}

function frame(
  board: string[] = [],
  count = 2,
  policyVersion = 1,
): DecisionFrame {
  const state = createTable("range-fixture", count, 1, 0, 1, 0, policyVersion);
  state.players[0].hole = ["As", "2h"];
  state.players[1].hole = ["3d", "4d"];
  return {
    id: 0,
    street: ["preflop", "", "", "flop", "turn", "river"][board.length],
    board,
    players: state.players,
    dealer: 0,
    currentBet: 10,
    minRaise: 10,
    pending: state.players.map((player) => player.seat),
    lastActBet: state.players.map(() => null),
    action: "raise",
    amount: 30,
    eventCount: 0,
    policyVersion,
    actions: [],
    reads: [],
  };
}

describe("transparent range grids", () => {
  it("groups pairs, suited and offsuit hands in the standard 169-cell order", () => {
    expect(startingHandClass(["Ks", "As"])).toBe("AKs");
    expect(startingHandClass(["Kh", "As"])).toBe("AKo");
    expect(startingHandClass(["Ac", "As"])).toBe("AA");
    const matrix = rangeMatrix(allCombos(), []);
    expect(matrix).toHaveLength(169);
    expect(matrix[0].hand).toBe("AA");
    expect(matrix[1].hand).toBe("AKs");
    expect(matrix[13].hand).toBe("AKo");
    expect(matrix[168].hand).toBe("22");
    for (const [hand, count] of [
      ["AA", 6],
      ["AKs", 4],
      ["AKo", 12],
    ] as const) {
      const cell = matrix.find((entry) => entry.hand === hand)!;
      expect(cell.combinations).toBe(count);
      expect(cell.available).toBe(count);
      expect(cell.percent).toBeCloseTo((100 * count) / 1326);
    }
    expect(matrix.reduce((sum, cell) => sum + cell.available, 0)).toBe(1326);
    expect(matrix.reduce((sum, cell) => sum + cell.percent, 0)).toBeCloseTo(
      100,
    );
  });

  it("removes only public blockers and distinguishes possible combos from range support", () => {
    const known = ["As", "2h"];
    const matrix = rangeMatrix(allCombos(), known);
    expect(matrix.reduce((sum, cell) => sum + cell.available, 0)).toBe(1225);
    for (const [hand, count] of [
      ["AA", 3],
      ["AKs", 3],
      ["AKo", 9],
      ["A2s", 2],
      ["A2o", 7],
    ] as const)
      expect(matrix.find((cell) => cell.hand === hand)!.available).toBe(count);
    const selected = rangeMatrix(
      [
        { cards: ["As", "Ks"], weight: 500 }, // blocked, no probability mass
        { cards: ["Ac", "Kc"], weight: 3 },
        { cards: ["Ad", "Kd"], weight: 0 },
        { cards: ["Ah", "Qd"], weight: 1 },
      ],
      known,
    );
    expect(selected.find((cell) => cell.hand === "AKs")).toEqual({
      hand: "AKs",
      combinations: 1,
      available: 3,
      percent: 75,
    });
    expect(selected.find((cell) => cell.hand === "AQo")!.percent).toBe(25);
    expect(selected.reduce((sum, cell) => sum + cell.combinations, 0)).toBe(2);
    expect(
      rangeMatrix(allCombos(), [...known, "Ac", "Kd", "Qd"]).reduce(
        (sum, cell) => sum + cell.available,
        0,
      ),
    ).toBe(1081);
  });

  it("rejects invalid cards, repeated combos, invalid weights and empty legal support", () => {
    expect(() =>
      rangeMatrix([{ cards: ["As", "As"], weight: 1 }], []),
    ).toThrow();
    expect(() =>
      rangeMatrix([{ cards: ["Ax", "Kd"], weight: 1 }], []),
    ).toThrow();
    expect(() =>
      rangeMatrix(
        [
          { cards: ["As", "Kd"], weight: 1 },
          { cards: ["Kd", "As"], weight: 2 },
        ],
        [],
      ),
    ).toThrow("Duplicate");
    for (const weight of [-1, NaN, Infinity])
      expect(() => rangeMatrix([{ cards: ["As", "Kd"], weight }], [])).toThrow(
        "weights",
      );
    expect(() =>
      rangeMatrix([{ cards: ["As", "Kd"], weight: 1 }], ["As"]),
    ).toThrow("legal");
    expect(() => rangeMatrix([], [])).toThrow("legal");
    expect(() => rangeMatrix(allCombos(), ["As", "As"])).toThrow();
  });

  it.each([
    ["Ac", "Kh", "2d"],
    ["Ac", "Kh", "2d", "3s"],
    ["Ac", "Kh", "2d", "3s", "4c"],
  ])(
    "compares the current made hand on a %j board without drawing later cards",
    (...board) => {
      const result = rangeMadeMatchup(["As", "Kd"], board, [
        { cards: ["Ah", "Ks"], weight: 1 }, // same aces and kings
        { cards: ["Qc", "Qh"], weight: 2 }, // underpair
        { cards: ["2s", "2h"], weight: 3 }, // set of twos
      ])!;
      expect(result.ahead).toBeCloseTo(100 / 3);
      expect(result.tied).toBeCloseTo(100 / 6);
      expect(result.behind).toBe(50);
    },
  );

  it("omits made-hand comparison preflop and identifies a board-only river tie", () => {
    expect(
      rangeMadeMatchup(["As", "Kd"], [], [{ cards: ["Qc", "Qh"], weight: 1 }]),
    ).toBeUndefined();
    expect(
      rangeMadeMatchup(
        ["2d", "3d"],
        ["Tc", "Jc", "Qc", "Kc", "Ac"],
        [{ cards: ["4h", "5s"], weight: 1 }],
      ),
    ).toEqual({ ahead: 0, tied: 100, behind: 0 });
  });
});

describe("immediate heads-up bot response previews", () => {
  it("exactly aggregates independently checked legacy fold, call and raise probabilities", () => {
    const f = frame();
    const range = [
      { cards: ["7c", "2d"], weight: 1 },
      { cards: ["Qc", "Jd"], weight: 1 },
      { cards: ["Ah", "Ad"], weight: 1 },
    ];
    const original = structuredClone(f);
    const preview = betResponsePreviews(f, new Map([[1, range]])).find(
      (value) => value.key === "raise",
    )!;
    // Facing 30, Tight's 72o folds 98.7%; QJo calls 98.7%; AA raises 65%.
    // Each remaining probability is a raise (1.3%) or AA call (35%).
    expect(preview.fold).toBeCloseTo((100 * 0.987) / 3);
    expect(preview.call).toBeCloseTo((100 * (0.987 + 0.35)) / 3);
    expect(preview.raise).toBeCloseTo((100 * (0.013 + 0.013 + 0.65)) / 3);
    expect(preview.fold + preview.call + preview.raise).toBeCloseTo(100);
    expect(preview.foldExamples).toHaveLength(1);
    expect(preview.foldExamples[0].cards).toEqual(["7c", "2d"]);
    expect(preview.foldExamples[0].percent).toBeCloseTo((100 * 0.987) / 3);
    expect(preview.raiseExamples[0].cards).toEqual(["Ah", "Ad"]);
    expect(f).toEqual(original); // read-only
    expect(
      betResponsePreviews(f, new Map([[1, range]])).map((value) => value.label),
    ).toEqual(["Raise to 30", "Raise to 20", "Raise to 25"]);
  });

  it.each([0, 3, 4, 5])(
    "uses the actual policy context after the hero bet with %i public board cards",
    (length) => {
      const board = ["Kc", "7h", "2c", "3d", "9c"].slice(0, length);
      const f = frame(board, 2, 2);
      f.players[1].botId = "remy";
      f.players[1].style = "Adaptive regular";
      f.actions = [{ seat: 1, street: f.street, action: "check" }];
      f.reads = [
        { seat: 0, decisions: 50, facing: 35, folds: 30, calls: 5, raises: 0 },
      ];
      const range = [
        { cards: ["7c", "7d"], weight: 2 },
        { cards: ["Qc", "Jd"], weight: 3 },
      ];
      const preview = betResponsePreviews(f, new Map([[1, range]])).find(
        (value) => value.key === "raise",
      )!;
      const expected = { fold: 0, call: 0, raise: 0 };
      for (const combo of normalizedRange(range, [
        ...f.players[0].hole,
        ...f.board,
      ])) {
        const probe = createTable(
          "actual-policy",
          2,
          1,
          f.dealer,
          1,
          0,
          f.policyVersion,
        );
        Object.assign(probe, {
          street: f.street,
          board: [...f.board],
          currentBet: f.currentBet,
          minRaise: f.minRaise,
          pending: [...f.pending],
          lastActBet: [...f.lastActBet],
          players: structuredClone(f.players),
          actions: structuredClone(f.actions),
          reads: structuredClone(f.reads),
          actor: 0,
        });
        probe.players[1].hole = [...combo.cards];
        act(probe, 0, "raise", 30);
        for (const response of botDistribution(botObservation(probe))) {
          expect(response.action).not.toBe("check");
          if (response.action !== "check")
            expected[response.action] +=
              100 * combo.weight * response.probability;
        }
      }
      expect(preview.fold).toBeCloseTo(expected.fold);
      expect(preview.call).toBeCloseTo(expected.call);
      expect(preview.raise).toBeCloseTo(expected.raise);
    },
  );

  it("keeps strong slow-playing hands in both calling and raising response examples", () => {
    const f = frame(["Kc", "7h", "2c"], 2, 2);
    const preview = betResponsePreviews(
      f,
      new Map([[1, [{ cards: ["7c", "7d"], weight: 1 }]]]),
    )[0];
    expect(preview.call).toBeGreaterThan(0);
    expect(preview.raise).toBeGreaterThan(0);
    expect(preview.callExamples[0].cards).toEqual(["7c", "7d"]);
    expect(preview.raiseExamples[0].cards).toEqual(["7c", "7d"]);
  });

  it("does not show zero-probability fold or raise examples for a guaranteed royal-board call", () => {
    const f = frame(["Tc", "Jc", "Qc", "Kc", "Ac"], 2, 2);
    const preview = betResponsePreviews(
      f,
      new Map([[1, [{ cards: ["4h", "5d"], weight: 1 }]]]),
    )[0];
    expect(preview.call).toBe(100);
    expect(preview.fold).toBe(0);
    expect(preview.raise).toBe(0);
    expect(preview.foldExamples).toEqual([]);
    expect(preview.raiseExamples).toEqual([]);
  });

  it("ignores hidden cards, removes blockers, and suppresses a multiway response forecast", () => {
    const f = frame([], 3, 2);
    f.players[2].folded = true;
    const combos = [
      { cards: ["As", "Kd"], weight: 1000 }, // blocked
      { cards: ["Qc", "Jd"], weight: 1 },
    ];
    const ranges = new Map([[1, combos]]);
    const expected = betResponsePreviews(f, ranges);
    const other = structuredClone(f);
    other.players[1].hole = ["Ah", "Ad"];
    other.players[2].hole = ["As", "2h"];
    expect(betResponsePreviews(other, ranges)).toEqual(expected);
    expect(expected[0].fold + expected[0].call + expected[0].raise).toBeCloseTo(
      100,
    );
    f.players[2].folded = false;
    expect(
      betResponsePreviews(
        f,
        new Map([
          [1, combos],
          [2, combos],
        ]),
      ),
    ).toEqual([]);
    f.players[2].folded = true;
    f.players[1].stack = 0;
    f.players[1].allIn = true;
    expect(betResponsePreviews(f, ranges)).toEqual([]);
  });
});
