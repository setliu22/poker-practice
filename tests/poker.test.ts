import { describe, it, expect } from "vitest";
import {
  best,
  five,
  compare,
  potOdds,
  equity,
  legalRange,
  deal,
  strongerCategories,
  deck,
} from "../packages/poker/src/index";
import solver from "pokersolver";
const c = (s: string) => s.split(" ");
const fixtures = [
  "As Jd 8c 5h 2s",
  "As Ad 8c 5h 2s",
  "As Ad 8c 8h 2s",
  "As Ad Ac 5h 2s",
  "As 2d 3c 4h 5s",
  "As Js 8s 5s 2s",
  "As Ad Ac 5h 5s",
  "As Ad Ac Ah 2s",
  "9s Ts Js Qs Ks",
];
describe("independent category fixtures", () => {
  it.each(fixtures.map((s, i) => [s, i] as const))(
    "%s is category %i",
    (s, i) => expect(five(c(s)).category).toBe(i),
  );
  it("orders every category", () =>
    fixtures
      .slice(1)
      .forEach((s, i) =>
        expect(compare(five(c(s)), five(c(fixtures[i])))).toBe(1),
      ));
  it("orders flush kickers, two pairs, full houses and pair kickers", () => {
    for (const [a, b] of [
      ["As Js 8s 5s 2s", "As Ts 8s 5s 2s"],
      ["As Ad 9c 9h Ks", "As Ah 8c 8h Qs"],
      ["Ks Kd Kc 2s 2h", "Qs Qd Qc As Ah"],
      ["As Ad Kc 9h 2s", "Ac Ah Qc 9s 2h"],
    ])
      expect(compare(five(c(a)), five(c(b)))).toBe(1);
  });
  it("ace-low straight is five-high", () => {
    expect(five(c(fixtures[4])).kickers).toEqual([5]);
    expect(compare(five(c("2s 3d 4c 5h 6s")), five(c(fixtures[4])))).toBe(1);
  });
  it("board-only tie despite different hole cards", () =>
    expect(
      compare(best(c("As Kd Qh Jc Ts 2c 3d")), best(c("As Kd Qh Jc Ts 9c 9d"))),
    ).toBe(0));
  it("rejects malformed and duplicate cards", () => {
    expect(() => best(c("As As Qh Jc Ts 2c 3d"))).toThrow();
    expect(() => five(c("Xs Kd Qh Jc Ts"))).toThrow();
  });
  it("matches independent MIT-licensed pokersolver on 300 seeded comparisons", () => {
    for (let i = 0; i < 300; i++) {
      const cards = deal(i, 9),
        a = [...cards.slice(0, 2), ...cards.slice(4)],
        b = [...cards.slice(2, 4), ...cards.slice(4)];
      const ah = solver.Hand.solve(a),
        bh = solver.Hand.solve(b),
        w = solver.Hand.winners([ah, bh]);
      const result = w.length === 2 ? 0 : w[0] === ah ? 1 : -1;
      expect(compare(best(a), best(b))).toBe(result);
    }
  });
});
describe("odds and equity", () => {
  it("pot odds use final pot", () => {
    expect(potOdds(100, 50, 50)).toBe(25);
    expect(() => potOdds(100, 50, 25)).toThrow();
  });
  it("filters blockers and rejects invalid/empty ranges", () => {
    expect(
      legalRange(c("As Ad"), c("Ks Qd 7c 2h 3s"), [c("As Kh"), c("Qc Qh")]),
    ).toEqual([c("Qc Qh")]);
    expect(() =>
      legalRange(c("As Ad"), c("Ks Qd 7c 2h 3s"), [c("As Kh")]),
    ).toThrow();
    expect(() =>
      legalRange(c("As Ad"), c("Ks Qd 7c 2h 3s"), [c("Kh Kh")]),
    ).toThrow();
  });
  it("river equity gives half credit for ties", () =>
    expect(equity(c("2c 3d"), c("As Kd Qh Jc Ts"), [c("9c 9d")]).equity).toBe(
      50,
    ));
  it("known turn flush draw: nine winning hearts out of 44 rivers", () => {
    const e = equity(c("Ah Jh"), c("Kh 8h 4c 2d"), [c("Ks Kc")]);
    expect(e.rows[0].total).toBe(44);
    /* 4h and 2h make opponent full houses, leaving seven winning hearts */ expect(
      e.rows[0].wins,
    ).toBe(7);
    expect(e.equity).toBeCloseTo((7 / 44) * 100);
  });
  it("known turn four-of-a-kind guarantees win", () =>
    expect(equity(c("As Ad"), c("Ac Ah 2c 3d"), [c("Ks Kd")]).equity).toBe(
      100,
    ));
  it("enumerates possible stronger categories instead of theoretical rankings", () =>
    expect(strongerCategories(c("As Ks"), c("Qs Js Ts 4d 2c"))).toEqual([]));
  it("seeded deals are reproducible and legal", () => {
    expect(deal(42, 9)).toEqual(deal(42, 9));
    expect(new Set(deal(42, 9)).size).toBe(9);
    expect(deck.length).toBe(52);
  });
});
describe("seven-card selection and possible hands", () => {
  it("selects ace-full-of-kings from two sets", () => {
    const hand = best(c("As Ad Ac Ks Kd Kc 2s"));
    expect(hand.category).toBe(6);
    expect(hand.kickers).toEqual([14, 13]);
  });
  it("selects the highest five flush cards", () =>
    expect(best(c("As Ks Js 8s 4s 2s Qd")).kickers).toEqual([
      14, 13, 11, 8, 4,
    ]));
  it("rejects an initially empty or duplicate range", () => {
    expect(() => legalRange(c("As Ad"), c("Ks Qd 7c 2h 3s"), [])).toThrow();
    expect(() =>
      legalRange(c("As Ad"), c("Ks Qd 7c 2h 3s"), [c("Qc Qh"), c("Qh Qc")]),
    ).toThrow();
  });
  it("possible categories exclude impossible full houses and quads", () =>
    expect(strongerCategories(c("As Qd"), c("Ac 9c 7c 4d 2s"))).toEqual([
      "One pair",
      "Two pair",
      "Three of a kind",
      "Straight",
      "Flush",
    ]));
});
