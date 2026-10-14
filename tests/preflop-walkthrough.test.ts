import { it, expect, describe } from "vitest";
import { openingCharts } from "../packages/poker/src/preflop-charts";
import {
  baselineAction,
  walkthroughChart,
  preflopTransfer,
  raisedPotExample,
  walkthroughSeats,
  walkthroughSeatsFor,
  cardsForHand,
  generateWalkthrough,
} from "../packages/shared/src/preflop-walkthrough";
import { validateCards } from "../packages/poker/src/index";
import { startingHandClass } from "../packages/poker/src/range-summary";
it("uses the actual authored six-player opening contrast, not a solved strategy score", () => {
  const early = walkthroughChart(openingCharts, "Lojack")!,
    late = walkthroughChart(openingCharts, "Button")!;
  expect(baselineAction(late, "KQs")).toBe("raise");
  expect(baselineAction(early, "KTo")).toBe("fold");
  expect(baselineAction(late, "KTo")).toBe("raise");
  expect(late.status).toBe("illustrative");
  expect(late.source.name).toContain("authored");
});

it("preserves the legacy six-seat order and deterministic transfer fixtures", () => {
  expect(walkthroughSeats).toEqual([
    "Lojack",
    "Hijack",
    "Cutoff",
    "Button",
    "Small blind",
    "Big blind",
  ]);
  expect(raisedPotExample).toEqual({
    raiseTo: 25,
    heroPosted: 0,
    callCost: 25,
    minimumRaiseTo: 40,
  });
  const fixtures = [
    {
      seed: 0,
      position: "Lojack",
      hand: "AA",
      hole: ["Ac", "Ad"],
      action: "raise",
    },
    {
      seed: 1,
      position: "Lojack",
      hand: "K8s",
      hole: ["Kc", "8c"],
      action: "fold",
    },
    {
      seed: 15,
      position: "Button",
      hand: "Q5s",
      hole: ["Qc", "5c"],
      action: "fold",
    },
    {
      seed: 256,
      position: "Lojack",
      hand: "KJs",
      hole: ["Kd", "Jd"],
      action: "raise",
    },
    {
      seed: 0xffffffff,
      position: "Button",
      hand: "J5o",
      hole: ["Js", "5c"],
      action: "fold",
    },
  ];
  for (const { seed, ...expected } of fixtures) {
    const { chart, ...spot } = preflopTransfer(openingCharts, seed);
    expect(spot).toEqual(expected);
    expect(chart.players).toBe(6);
    expect(preflopTransfer(openingCharts, seed, 6)).toEqual(
      preflopTransfer(openingCharts, seed),
    );
  }
});

describe.each([6, 9] as const)(
  "randomized %i-player walkthrough",
  (players) => {
    it("matches direct charts and legal card classes across every scene", () => {
      const seats = walkthroughSeatsFor(players);
      expect(seats).toHaveLength(players);
      expect(seats.slice(-3)).toEqual(["Button", "Small blind", "Big blind"]);
      expect(new Set(seats).size).toBe(players);
      const openingHands = new Set<string>(),
        openingActions = new Set<string>(),
        contrastHands = new Set<string>(),
        contrastPositions = new Set<string>(),
        raisedHands = new Set<string>(),
        sizes = new Set<number>(),
        fingerprints = new Set<string>(),
        transfers = new Set<string>();
      for (let seed = 0; seed < 512; seed++) {
        const scenario = generateWalkthrough(openingCharts, seed, players);
        expect(scenario.players).toBe(players);
        expect(scenario.seats).toEqual(seats);
        const button = walkthroughChart(openingCharts, "Button", players)!;
        const early = walkthroughChart(
          openingCharts,
          scenario.contrast.earlyPosition,
          players,
        )!;
        expect(button.players).toBe(players);
        expect(early.players).toBe(players);
        expect(seats.slice(0, -3)).toContain(scenario.contrast.earlyPosition);
        expect(baselineAction(early, scenario.contrast.hand)).toBe("fold");
        expect(baselineAction(button, scenario.contrast.hand)).toBe("raise");
        // Every opening hand uses the same app size assumption, including folds.
        expect(button.raiseToBb).toBe(2.5);
        for (const spot of [
          scenario.opening,
          scenario.contrast,
          scenario.raised,
        ]) {
          validateCards(spot.hole, 2, 2);
          expect(startingHandClass(spot.hole)).toBe(spot.hand);
        }
        const transfer = preflopTransfer(openingCharts, seed, players);
        expect(transfer.chart.players).toBe(players);
        expect(transfer.chart.position).toBe(transfer.position);
        expect(baselineAction(transfer.chart, transfer.hand)).toBe(
          transfer.action,
        );
        validateCards(transfer.hole, 2, 2);
        expect(startingHandClass(transfer.hole)).toBe(transfer.hand);
        openingHands.add(scenario.opening.hand);
        openingActions.add(baselineAction(button, scenario.opening.hand));
        contrastHands.add(scenario.contrast.hand);
        contrastPositions.add(scenario.contrast.earlyPosition);
        raisedHands.add(scenario.raised.hand);
        sizes.add(scenario.raised.raiseTo);
        fingerprints.add(scenario.fingerprint);
        transfers.add(transfer.position);
      }
      expect(openingHands.size).toBeGreaterThan(100);
      expect(openingActions).toEqual(new Set(["raise", "fold"]));
      expect(contrastHands.size).toBeGreaterThan(15);
      expect(contrastPositions).toEqual(new Set(seats.slice(0, -3)));
      expect(raisedHands.size).toBeGreaterThan(25);
      expect(sizes).toEqual(new Set([20, 25, 30, 40]));
      expect(fingerprints.size).toBeGreaterThan(500);
      expect(transfers).toEqual(new Set(seats.slice(0, -2)));
    });

    it("replays the entire paired context exactly with all uint32 seed bits", () => {
      for (const seed of [0, 1, 0x7fffffff, 0x80000000, 0xffffffff]) {
        const first = generateWalkthrough(openingCharts, seed, players);
        const snapshot = structuredClone(first);
        expect(generateWalkthrough(openingCharts, seed, players)).toEqual(
          snapshot,
        );
        expect(first).toEqual(snapshot);
        // Each paired lesson consumes this same one contrast/raised object.
        expect(first.contrast.hole).toHaveLength(2);
        expect(first.raised.heroPosted).toBe(0);
      }
      expect(
        generateWalkthrough(openingCharts, 1, players).fingerprint,
      ).not.toBe(
        generateWalkthrough(openingCharts, 0x80000001, players).fingerprint,
      );
      const seats = walkthroughSeatsFor(players);
      seats[0] = "changed";
      expect(walkthroughSeatsFor(players)[0]).not.toBe("changed");
    });

    it("computes observed raise arithmetic independently of hole cards", () => {
      const expected = new Map([
        [20, { callCost: 20, minimumRaiseTo: 30, potChips: 35 }],
        [25, { callCost: 25, minimumRaiseTo: 40, potChips: 40 }],
        [30, { callCost: 30, minimumRaiseTo: 50, potChips: 45 }],
        [40, { callCost: 40, minimumRaiseTo: 70, potChips: 55 }],
      ]);
      const seen = new Set<number>();
      for (let seed = 0; seed < 128; seed++) {
        const { raised } = generateWalkthrough(openingCharts, seed, players);
        expect(raised).toMatchObject({
          heroPosted: 0,
          ...expected.get(raised.raiseTo),
        });
        seen.add(raised.raiseTo);
      }
      expect(seen).toEqual(new Set(expected.keys()));
    });

    it("rejects missing charts and never substitutes another table size", () => {
      const other = openingCharts.filter((chart) => chart.players !== players);
      expect(walkthroughChart(other, "Button", players)).toBeUndefined();
      expect(() => generateWalkthrough(other, 0, players)).toThrow(
        "incomplete",
      );
      expect(() => preflopTransfer(other, 0, players)).toThrow("unavailable");
      for (const position of walkthroughSeatsFor(players).slice(0, -2)) {
        const partial = openingCharts.filter(
          (chart) => chart.players !== players || chart.position !== position,
        );
        expect(() => generateWalkthrough(partial, 0, players)).toThrow(
          "incomplete",
        );
      }
      const noContrast = openingCharts.map((chart) =>
        chart.players === players && chart.position !== "Button"
          ? {
              ...chart,
              cells: chart.cells.map((cell) => ({
                ...cell,
                action: "raise" as const,
              })),
            }
          : chart,
      );
      expect(() => generateWalkthrough(noContrast, 0, players)).toThrow(
        "no matching hands",
      );
    });
  },
);

it("fingerprints identify semantic repetition while ignoring seed and suits", () => {
  // Keep a small valid chart vocabulary to produce repeats with different suits.
  const narrow = openingCharts.map((chart) => ({
    ...chart,
    cells: [
      { hand: "AA", action: "raise" as const },
      {
        hand: "AKo",
        action:
          chart.position === "Button" ? ("raise" as const) : ("fold" as const),
      },
      { hand: "72o", action: "fold" as const },
    ],
  }));
  const seen = new Map<string, ReturnType<typeof generateWalkthrough>>();
  let cosmeticRepeat = false;
  for (let seed = 0; seed < 2048 && !cosmeticRepeat; seed++) {
    const next = generateWalkthrough(narrow, seed, 6);
    const previous = seen.get(next.fingerprint);
    if (previous) {
      expect(next.opening.hand).toBe(previous.opening.hand);
      expect(next.contrast.hand).toBe(previous.contrast.hand);
      expect(next.contrast.earlyPosition).toBe(previous.contrast.earlyPosition);
      expect(next.raised.hand).toBe(previous.raised.hand);
      expect(next.raised.raiseTo).toBe(previous.raised.raiseTo);
      cosmeticRepeat =
        JSON.stringify([
          next.opening.hole,
          next.contrast.hole,
          next.raised.hole,
        ]) !==
        JSON.stringify([
          previous.opening.hole,
          previous.contrast.hole,
          previous.raised.hole,
        ]);
    }
    seen.set(next.fingerprint, next);
  }
  expect(cosmeticRepeat).toBe(true);
});

it("validates pairs, suited and offsuit cards plus seed/table inputs", () => {
  for (const hand of ["AA", "22", "AKs", "T9s", "KTo", "72o"])
    for (const seed of [0, 1, 2, 3, 0xffffffff]) {
      const cards = cardsForHand(hand, seed);
      validateCards(cards, 2, 2);
      expect(startingHandClass(cards)).toBe(hand);
    }
  for (const hand of ["", "AAs", "AAo", "AK", "KAs", "11", "AKx", "AJsx"])
    expect(() => cardsForHand(hand, 0)).toThrow("canonical");
  for (const seed of [-1, 0x100000000, 1.5, NaN, Infinity])
    expect(() => generateWalkthrough(openingCharts, seed, 6)).toThrow("32-bit");
  expect(() => walkthroughSeatsFor(8 as 6)).toThrow("directly provided");
  expect(() => generateWalkthrough(openingCharts, 0, 8 as 6)).toThrow(
    "directly provided",
  );
});
it("fresh transfer hands stay within matching six-player unopened baselines", () => {
  const hands = new Set<string>(),
    positions = new Set<string>();
  for (let seed = 0; seed < 1600; seed++) {
    const spot = preflopTransfer(openingCharts, seed);
    expect(spot.chart.players).toBe(6);
    expect(spot.chart.position).toBe(spot.position);
    expect(baselineAction(spot.chart, spot.hand)).toBe(spot.action);
    validateCards(spot.hole, 2, 2);
    hands.add(spot.hand);
    positions.add(spot.position);
  }
  expect(hands.size).toBeGreaterThan(30);
  expect(positions.size).toBe(4);
  expect(raisedPotExample.minimumRaiseTo).toBe(
    raisedPotExample.raiseTo + (raisedPotExample.raiseTo - 10),
  );
  expect(raisedPotExample.callCost).toBe(25);
});
