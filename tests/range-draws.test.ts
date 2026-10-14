import { describe, expect, it } from "vitest";
import { rangeDrawDensity } from "../packages/poker/src/range-draws";

const hero = ["As", "Ad"];
const flop = ["2h", "7h", "Qc"];

describe("weighted opponent draw density", () => {
  it("weights draw mass rather than counting hand classes or combinations", () => {
    const result = rangeDrawDensity(hero, flop, [
      { cards: ["Kh", "Jh"], weight: 0.35 }, // four hearts: a flush draw
      { cards: ["Qd", "Qs"], weight: 0.65 }, // three queens, no draw
    ])!;
    expect(result.percent).toBeCloseTo(35);
    expect(result.flushDraw).toBeCloseTo(35);
    expect(result.openEndedStraightDraw).toBe(0);
    expect(result.both).toBe(0);
    const rescaled = rangeDrawDensity(hero, flop, [
      { cards: ["Kh", "Jh"], weight: 35 },
      { cards: ["Qd", "Qs"], weight: 65 },
    ]);
    expect(rescaled).toEqual(result);
  });

  it("counts overlap once in union while reporting both draws separately", () => {
    const result = rangeDrawDensity(
      hero,
      ["7h", "8h", "Kc"],
      [
        { cards: ["9h", "Th"], weight: 2 }, // hearts and 789T, endpoints 6/J
        { cards: ["Ah", "Qh"], weight: 1 }, // only hearts
        { cards: ["9d", "Tc"], weight: 3 }, // only 789T
        { cards: ["Kd", "Ks"], weight: 4 }, // no ordinary draw
      ],
    )!;
    expect(result.percent).toBeCloseTo(60);
    expect(result.flushDraw).toBeCloseTo(30);
    expect(result.openEndedStraightDraw).toBeCloseTo(50);
    expect(result.both).toBeCloseTo(20);
    expect(result.percent).toBeCloseTo(
      result.flushDraw + result.openEndedStraightDraw - result.both,
    );
  });

  it("recognizes flop and turn draws without treating a draw as a win probability", () => {
    const result = rangeDrawDensity(
      hero,
      [...flop, "3s"],
      [
        { cards: ["Kh", "Jh"], weight: 3 },
        { cards: ["Qd", "Qs"], weight: 1 },
      ],
    )!;
    expect(result.percent).toBe(75);
    expect(result.note).toContain("Improving does not guarantee winning");
    expect(result.note).toContain("before accounting for card collisions");
  });

  it("includes 2345 and TJQK but excludes the one-ended ace-boundary patterns", () => {
    const cases: [string[], string[], number][] = [
      [["2c", "3d"], ["4h", "5s", "Kc"], 100], // A or 6
      [["Tc", "Jd"], ["Qh", "Ks", "2c"], 100], // 9 or A
      [["Ac", "2d"], ["3h", "4s", "Kc"], 0], // only 5
      [["Jc", "Qd"], ["Kh", "Ac", "2s"], 0], // only T
    ];
    for (const [cards, board, expected] of cases) {
      const result = rangeDrawDensity(["8c", "9d"], board, [
        { cards, weight: 1 },
      ])!;
      expect(result.openEndedStraightDraw).toBe(expected);
      expect(result.flushDraw).toBe(0);
    }
  });

  it("excludes gutshots, double gutshots and backdoor flush draws", () => {
    const gutshot = rangeDrawDensity(
      hero,
      ["5h", "7c", "Kd"],
      [{ cards: ["8s", "9h"], weight: 1 }],
    )!;
    expect(gutshot.percent).toBe(0);
    // A3457 can make a straight with 2 or 6, but has no four-card run.
    const doubleGutshot = rangeDrawDensity(
      hero,
      ["3h", "4d", "5s", "Ks"],
      [{ cards: ["Ac", "7c"], weight: 1 }],
    )!;
    expect(doubleGutshot.openEndedStraightDraw).toBe(0);
    const backdoor = rangeDrawDensity(
      hero,
      ["2h", "7c", "Qd"],
      [{ cards: ["Kh", "Jh"], weight: 1 }],
    )!;
    expect(backdoor.flushDraw).toBe(0);
  });

  it("excludes already made straights/flushes and ordinary draws below a stronger made hand", () => {
    expect(
      rangeDrawDensity(
        hero,
        ["7h", "8c", "9d"],
        [{ cards: ["Ts", "Jh"], weight: 1 }],
      )!.openEndedStraightDraw,
    ).toBe(0);
    const madeFlush = rangeDrawDensity(
      hero,
      ["7h", "8h", "Kh", "Jh"],
      [{ cards: ["9h", "Ts"], weight: 1 }],
    )!;
    expect(madeFlush.flushDraw).toBe(0);
    expect(madeFlush.openEndedStraightDraw).toBe(0);
    expect(madeFlush.percent).toBe(0);
    // Straight already made, but a flush would still improve the category.
    const straightAndFlushDraw = rangeDrawDensity(
      hero,
      ["7h", "8h", "9h", "Tc"],
      [{ cards: ["Jh", "2s"], weight: 1 }],
    )!;
    expect(straightAndFlushDraw.flushDraw).toBe(100);
    expect(straightAndFlushDraw.openEndedStraightDraw).toBe(0);
    expect(straightAndFlushDraw.percent).toBe(100);
  });

  it("removes hero/board-blocked combinations and renormalizes only positive legal mass", () => {
    const result = rangeDrawDensity(hero, flop, [
      { cards: ["As", "Jh"], weight: 1000 }, // hero blocker
      { cards: ["7h", "Kh"], weight: 1000 }, // board blocker
      { cards: ["Kh", "Jh"], weight: 3 },
      { cards: ["Qd", "Qs"], weight: 1 },
      { cards: ["Th", "9h"], weight: 0 },
    ])!;
    expect(result.percent).toBe(75);
    expect(result.flushDraw).toBe(75);
  });

  it("rejects duplicate known cards, illegal cards/combinations and invalid weights", () => {
    expect(() => rangeDrawDensity(["As", "As"], flop, [])).toThrow("unique");
    expect(() => rangeDrawDensity(["As", "2h"], flop, [])).toThrow("unique");
    expect(() =>
      rangeDrawDensity(hero, flop, [{ cards: ["Kh", "Kh"], weight: 1 }]),
    ).toThrow("unique");
    expect(() =>
      rangeDrawDensity(hero, flop, [{ cards: ["Xh", "Jh"], weight: 1 }]),
    ).toThrow("valid");
    for (const weight of [-1, NaN, Infinity])
      expect(() =>
        rangeDrawDensity(hero, flop, [{ cards: ["Kh", "Jh"], weight }]),
      ).toThrow("finite and nonnegative");
    expect(() =>
      rangeDrawDensity(hero, flop, [
        { cards: ["Kh", "Jh"], weight: 1 },
        { cards: ["Jh", "Kh"], weight: 1 },
      ]),
    ).toThrow("Duplicate range combination");
  });

  it("rejects empty, fully blocked or zero-mass ranges on drawing streets", () => {
    expect(() => rangeDrawDensity(hero, flop, [])).toThrow("positive-weight");
    expect(() =>
      rangeDrawDensity(hero, flop, [{ cards: ["As", "Kh"], weight: 1 }]),
    ).toThrow("positive-weight");
    expect(() =>
      rangeDrawDensity(hero, flop, [{ cards: ["Kh", "Jh"], weight: 0 }]),
    ).toThrow("positive-weight");
  });

  it("returns undefined rather than misleading zero for preflop and river", () => {
    const combos = [{ cards: ["Kh", "Jh"], weight: 1 }];
    expect(rangeDrawDensity(hero, [], combos)).toBeUndefined();
    expect(
      rangeDrawDensity(hero, [...flop, "3s", "4c"], combos),
    ).toBeUndefined();
    expect(() =>
      rangeDrawDensity(hero, [], [{ cards: ["Kh", "Jh"], weight: -1 }]),
    ).toThrow("finite and nonnegative");
    expect(() => rangeDrawDensity(hero, ["2c", "3d"], [])).toThrow(
      "legal Hold’em board",
    );
  });

  it("does not mutate any inputs and uses only the passed public range candidates", () => {
    const inputHero = [...hero];
    const inputBoard = [...flop];
    const combos = [{ cards: ["Kh", "Jh"], weight: 2 }];
    const snapshot = JSON.stringify({
      hero: inputHero,
      board: inputBoard,
      combos,
    });
    Object.freeze(inputHero);
    Object.freeze(inputBoard);
    Object.freeze(combos[0].cards);
    Object.freeze(combos[0]);
    Object.freeze(combos);
    expect(rangeDrawDensity(inputHero, inputBoard, combos)!.percent).toBe(100);
    expect(JSON.stringify({ hero: inputHero, board: inputBoard, combos })).toBe(
      snapshot,
    );
  });
});
