import { describe, expect, it } from "vitest";
import { createRequire } from "node:module";
import {
  generateCashDrill,
  gradeCashQuestion,
  cashHint,
} from "../packages/poker/src/cash-practice";
import { validateCards } from "../packages/poker/src/index";
import {
  cashSkills,
  type CashAnswer,
  type CashQuestion,
  type CashRange,
} from "../packages/shared/src/cash-practice";
const require = createRequire(import.meta.url);
const { Hand } = require("pokersolver");

function fixture(overrides: Partial<CashQuestion> = {}): CashQuestion {
  return {
    phase: "initial",
    skill: "bluff-catch",
    title: "Manual closing-call fixture",
    tablePlayers: 9,
    activePlayers: 2,
    heroSeat: 0,
    dealerSeat: 0,
    startingStackBb: 100,
    effectiveStackBb: 80,
    seats: [],
    hole: ["Ac", "Qc"],
    board: ["Ah", "7d", "4h", "Js", "2c"],
    potBb: 30,
    callBb: 10,
    betBb: 0,
    rakeBb: 0.5,
    history: [],
    ranges: [
      {
        seat: 2,
        label: "Supplied range",
        combinations: [
          { cards: ["Kc", "Kd"], weight: 1 },
          { cards: ["As", "Jd"], weight: 3 },
        ],
      },
    ],
    options: [
      { action: "fold", label: "Fold" },
      { action: "call", label: "Call" },
    ],
    reasons: [
      { id: "range-price", label: "Range and price" },
      { id: "sunk-chips", label: "Sunk chips" },
    ],
    estimatePrompt: "Required share?",
    assumptions: [],
    ...overrides,
  };
}
function answer(
  q: CashQuestion,
  changes: Partial<CashAnswer> = {},
): CashAnswer {
  return {
    phase: q.phase,
    action: q.options[0].action,
    reasonId: q.reasons[0].id,
    estimatePercent: 0,
    confidence: "unsure",
    ...changes,
  };
}

describe("independent conditional river arithmetic", () => {
  it("uses the current pot exactly once, weighted wins, study rake and sunk-cost folding", () => {
    const q = fixture();
    const result = gradeCashQuestion(
      q,
      answer(q, { action: "fold", estimatePercent: 1000 / 39.5 }),
    );
    expect(result.sharePercent).toBe(25);
    expect(result.expectedEstimate).toBeCloseTo(25.3164556962, 9);
    expect(
      result.actionValues.find((v) => v.action === "call")!.evBb,
    ).toBeCloseTo(-0.125, 12);
    expect(result.selectedActionEvBb).toBe(0);
    expect(result.correct).toBe(true);
    expect(result.assisted).toBe(false);
    expect(result.legalWorlds).toBe(2);
    expect(result.explanation).toContain("Under the supplied");
  });

  it("compares checking with fold/call branches and accepts an exact EV tie", () => {
    const q = fixture({
      skill: "value-bet",
      potBb: 20,
      callBb: 0,
      betBb: 10,
      options: [
        { action: "check", label: "Check" },
        { action: "bet", label: "Bet" },
      ],
      reasons: [{ id: "called-range", label: "Who calls?" }],
      ranges: [
        {
          seat: 2,
          label: "Responses",
          combinations: [
            { cards: ["Kc", "Kd"], weight: 2, response: "fold" },
            { cards: ["Tc", "Td"], weight: 1, response: "call" },
            { cards: ["As", "Jd"], weight: 1, response: "call" },
          ],
        },
      ],
    });
    for (const action of ["check", "bet"] as const) {
      const result = gradeCashQuestion(
        q,
        answer(q, { action, estimatePercent: 50 }),
      );
      expect(result.actionValues.map((v) => v.evBb)).toEqual([14.625, 14.625]);
      expect(result.acceptedActions).toEqual(["check", "bet"]);
      expect(result.weakerCallerPercent).toBe(50);
      expect(result.sharePercent).toBe(75);
      expect(result.foldPercent).toBe(50);
      expect(result.correct).toBe(true);
    }
  });

  it("does not equate weaker calling fraction with a universal value-bet rule", () => {
    const q = fixture({
      skill: "value-bet",
      potBb: 100,
      callBb: 0,
      betBb: 10,
      rakeBb: 0,
      options: [
        { action: "check", label: "Check" },
        { action: "bet", label: "Bet" },
      ],
      reasons: [{ id: "called-range", label: "Responses" }],
      ranges: [
        {
          seat: 2,
          label: "Responses",
          combinations: [
            { cards: ["As", "Jd"], weight: 9, response: "fold" },
            { cards: ["Ad", "Jc"], weight: 1, response: "call" },
          ],
        },
      ],
    });
    const result = gradeCashQuestion(q, answer(q));
    expect(result.weakerCallerPercent).toBe(0);
    expect(result.actionValues.map((v) => v.evBb)).toEqual([0, 89]);
    expect(result.acceptedActions).toEqual(["bet"]);
  });

  it("grades a zero-showdown-share bluff with the correct fold threshold", () => {
    const q = fixture({
      skill: "bluff",
      hole: ["6c", "5s"],
      potBb: 20,
      callBb: 0,
      betBb: 10,
      options: [
        { action: "check", label: "Check" },
        { action: "bet", label: "Bet" },
      ],
      reasons: [{ id: "fold-threshold", label: "Fold frequency" }],
      ranges: [
        {
          seat: 2,
          label: "Responses",
          combinations: [
            { cards: ["Ac", "Qc"], weight: 1, response: "fold" },
            { cards: ["As", "Jd"], weight: 4, response: "call" },
          ],
        },
      ],
    });
    const result = gradeCashQuestion(
      q,
      answer(q, { estimatePercent: 1000 / 29.5 }),
    );
    expect(result.sharePercent).toBe(0);
    expect(result.foldPercent).toBeCloseTo(20, 12);
    expect(result.expectedEstimate).toBeCloseTo(33.8983050847, 9);
    expect(result.actionValues.map((v) => v.evBb)).toEqual([0, -4.1]);
    expect(result.correct).toBe(true);
  });

  it("conditions both ranges on joint card compatibility rather than multiplying marginal equities", () => {
    const q = fixture({
      skill: "multiway-call",
      activePlayers: 3,
      rakeBb: 0,
      reasons: [{ id: "joint-share", label: "Joint share" }],
      ranges: [
        {
          seat: 1,
          label: "Bettor",
          combinations: [
            { cards: ["Kd", "Kh"], weight: 1 },
            { cards: ["As", "Jd"], weight: 1 },
          ],
        },
        {
          seat: 2,
          label: "Caller",
          combinations: [
            { cards: ["Kd", "Ks"], weight: 1 },
            { cards: ["Tc", "Ts"], weight: 1 },
          ],
        },
      ],
    });
    const result = gradeCashQuestion(
      q,
      answer(q, { action: "call", estimatePercent: 25 }),
    );
    // Four nominal worlds, one incompatible. Hero wins one of the three legal worlds.
    expect(result.legalWorlds).toBe(3);
    expect(result.sharePercent).toBeCloseTo(100 / 3, 10);
    expect(result.actionValues[1].evBb).toBeCloseTo(10 / 3, 10);
    expect(result.correct).toBe(true);
  });

  it("splits a three-player board tie into thirds and a heads-up board tie into halves", () => {
    const common = {
      hole: ["2c", "3c"],
      board: ["Ah", "Kh", "Qh", "Jh", "Th"],
      rakeBb: 0,
    };
    const ranges: CashRange[] = [
      {
        seat: 1,
        label: "Bettor",
        combinations: [{ cards: ["4c", "5c"], weight: 1 }],
      },
      {
        seat: 2,
        label: "Caller",
        combinations: [{ cards: ["6c", "7c"], weight: 1 }],
      },
    ];
    const multi = fixture({
      ...common,
      skill: "multiway-call",
      activePlayers: 3,
      ranges,
      reasons: [{ id: "joint-share", label: "Split shares" }],
    });
    const result = gradeCashQuestion(multi, answer(multi));
    expect(result.sharePercent).toBeCloseTo(100 / 3, 10);
    const headsup = fixture({ ...common, ranges: [ranges[0]] });
    expect(gradeCashQuestion(headsup, answer(headsup)).sharePercent).toBe(50);
  });

  it("separately assesses action, reasoning, estimate, and tracked assistance", () => {
    const q = fixture();
    const wrong = gradeCashQuestion(
      q,
      answer(q, {
        action: "call",
        reasonId: "sunk-chips",
        estimatePercent: 80,
      }),
      true,
    );
    expect(wrong).toMatchObject({
      actionCorrect: false,
      reasonCorrect: false,
      estimateCorrect: false,
      correct: false,
      assisted: true,
    });
    expect(wrong.estimateErrorPp).toBeCloseTo(80 - 1000 / 39.5, 10);
    const close = gradeCashQuestion(
      q,
      answer(q, { estimatePercent: 1000 / 39.5 + 0.99 }),
    );
    expect(close.estimateCorrect).toBe(true);
    expect(
      gradeCashQuestion(q, answer(q, { estimatePercent: 1000 / 39.5 + 1.01 }))
        .estimateCorrect,
    ).toBe(false);
  });

  it("rejects invalid sizes, blocked/duplicate hands, empty legal joint worlds and invalid answers", () => {
    const q = fixture();
    expect(() => gradeCashQuestion({ ...q, betBb: 2 }, answer(q))).toThrow();
    expect(() =>
      gradeCashQuestion({ ...q, potBb: Infinity }, answer(q)),
    ).toThrow();
    expect(() => gradeCashQuestion({ ...q, rakeBb: 31 }, answer(q))).toThrow();
    for (const combinations of [
      [{ cards: ["Ac", "Kd"], weight: 1 }],
      [{ cards: ["Kc", "Kd"], weight: -1 }],
      [{ cards: ["Kc", "Kd"], weight: 0 }],
      [
        { cards: ["Kc", "Kd"], weight: 1 },
        { cards: ["Kd", "Kc"], weight: 1 },
      ],
    ])
      expect(() =>
        gradeCashQuestion(
          { ...q, ranges: [{ seat: 2, label: "Invalid", combinations }] },
          answer(q),
        ),
      ).toThrow();
    const collision = {
      seat: 1,
      label: "Impossible pair",
      combinations: [{ cards: ["Kc", "Kd"], weight: 1 }],
    };
    expect(() =>
      gradeCashQuestion(
        { ...q, ranges: [collision, { ...collision, seat: 2 }] },
        answer(q),
      ),
    ).toThrow();
    expect(() => gradeCashQuestion(q, answer(q, { action: "bet" }))).toThrow();
    expect(() =>
      gradeCashQuestion(q, answer(q, { reasonId: "invented" })),
    ).toThrow();
    expect(() =>
      gradeCashQuestion(q, answer(q, { phase: "transfer" })),
    ).toThrow();
    expect(() =>
      gradeCashQuestion(q, answer(q, { estimatePercent: NaN })),
    ).toThrow();
  });
});

describe("original cash contexts and deterministic generation", () => {
  it("generates legal histories, positions, stacks and distinct active counts across 2–9 seats", () => {
    for (const players of [2, 3, 6, 8, 9])
      for (const skill of cashSkills) {
        if (players === 2 && skill === "multiway-call") continue;
        for (let seed = 0; seed < 16; seed++) {
          const d = generateCashDrill(seed, players, skill);
          if (seed === 0)
            expect(generateCashDrill(seed, players, skill)).toEqual(d);
          for (const q of [d.initial, d.transfer]) {
            expect(q.tablePlayers).toBe(players);
            expect(q.seats.length).toBe(players);
            expect(q.activePlayers).toBe(skill === "multiway-call" ? 3 : 2);
            expect(q.seats.filter((s) => s.status === "active").length).toBe(
              q.activePlayers,
            );
            expect(q.seats[0].position).toBe(
              players === 2 ? "Button · Small blind" : "Button",
            );
            const totals = new Map<string, number>(),
              contributions = Array.from({ length: players }, () => 0);
            for (const h of q.history) {
              const key = `${h.street}:${h.seat}`,
                previous = totals.get(key) ?? 0;
              expect(h.streetTotalBb).toBeGreaterThanOrEqual(previous);
              contributions[h.seat] += h.streetTotalBb - previous;
              totals.set(key, h.streetTotalBb);
            }
            expect(contributions.reduce((a, b) => a + b)).toBe(q.potBb);
            expect(q.seats.map((s) => s.stackBb)).toEqual(
              contributions.map((c) => 100 - c),
            );
            expect(
              q.potBb + q.seats.reduce((s, seat) => s + seat.stackBb, 0),
            ).toBe(100 * players);
            expect(q.effectiveStackBb).toBe(q.seats[0].stackBb);
            expect(q.callBb + q.betBb).toBeLessThan(q.effectiveStackBb);
            const preflop = [...totals]
              .filter(([key]) => key.startsWith("preflop:"))
              .reduce((s, [, value]) => s + value, 0);
            expect(preflop).toBe(
              skill === "multiway-call" ? 7.5 : players === 2 ? 5 : 5.5,
            );
            const river = q.history.filter((h) => h.street === "river");
            expect(river.map((h) => h.action)).toEqual(
              skill === "multiway-call"
                ? ["bet", "call"]
                : q.callBb
                  ? ["bet"]
                  : ["check"],
            );
            for (const range of q.ranges)
              for (const combo of range.combinations)
                validateCards([...q.hole, ...q.board, ...combo.cards], 9, 9);
            const f = gradeCashQuestion(q, answer(q));
            expect(f.legalWorlds).toBeGreaterThan(0);
            expect(Number.isFinite(f.expectedEstimate)).toBe(true);
          }
        }
      }
  });

  it("uses varied ranks, contexts, weights and reason order, with changed-assumption actions in every skill", () => {
    for (const skill of cashSkills) {
      const ranks = new Set<string>(),
        prices = new Set<string>(),
        fingerprints = new Set<string>(),
        reasonOrders = new Set<string>();
      let changed = 0;
      for (let seed = 0; seed < 64; seed++) {
        const d = generateCashDrill(seed, 9, skill);
        ranks.add(d.initial.board.map((c) => c[0]).join(""));
        prices.add(
          [d.initial.potBb, d.initial.callBb, d.initial.betBb].join(":"),
        );
        fingerprints.add(d.fingerprint);
        reasonOrders.add(d.initial.reasons.map((r) => r.id).join(":"));
        expect(d.transfer.hole).toEqual(d.initial.hole);
        expect(d.transfer.board).toEqual(d.initial.board);
        expect(d.transfer.history).toEqual(d.initial.history);
        expect(d.transfer.potBb).toBe(d.initial.potBb);
        expect(d.transfer.ranges).not.toEqual(d.initial.ranges);
        const initial = gradeCashQuestion(d.initial, answer(d.initial));
        const transfer = gradeCashQuestion(d.transfer, answer(d.transfer));
        if (initial.acceptedActions.join() !== transfer.acceptedActions.join())
          changed++;
        if (skill === "bluff") expect(initial.sharePercent).toBe(0);
        expect(cashHint(d.initial)).not.toContain(
          initial.acceptedActions[0] === "call" ? "Call this" : "Fold this",
        );
      }
      expect(ranks.size).toBeGreaterThanOrEqual(7);
      expect(prices.size).toBeGreaterThan(20);
      expect(fingerprints.size).toBeGreaterThan(60);
      expect(reasonOrders.size).toBeGreaterThan(3);
      expect(changed).toBeGreaterThan(30);
      expect(changed).toBeLessThan(58);
    }
  });

  it("agrees with an independent test-only evaluator for generated joint-range pot shares", () => {
    for (const skill of ["bluff-catch", "multiway-call"] as const)
      for (let seed = 30; seed < 40; seed++) {
        const q = generateCashDrill(seed, 8, skill).initial;
        let shareMass = 0,
          legalMass = 0;
        const hero = Hand.solve([...q.hole, ...q.board]);
        for (const a of q.ranges[0].combinations)
          for (const b of q.ranges[1]?.combinations ?? [null]) {
            if (b?.cards.some((c) => a.cards.includes(c))) continue;
            const opponents = [
              Hand.solve([...a.cards, ...q.board]),
              ...(b ? [Hand.solve([...b.cards, ...q.board])] : []),
            ];
            const winners = Hand.winners([hero, ...opponents]);
            const mass = a.weight * (b?.weight ?? 1);
            legalMass += mass;
            shareMass +=
              mass * (winners.includes(hero) ? 1 / winners.length : 0);
          }
        expect(gradeCashQuestion(q, answer(q)).sharePercent).toBeCloseTo(
          (100 * shareMass) / legalMass,
          9,
        );
      }
  });

  it("rejects unsupported table/skill combinations and invalid seeds", () => {
    expect(() => generateCashDrill(0, 2, "multiway-call")).toThrow();
    expect(() => generateCashDrill(0, 10, "bluff")).toThrow();
    expect(() => generateCashDrill(-1, 9, "bluff")).toThrow();
    expect(() => generateCashDrill(0.5, 9, "bluff")).toThrow();
  });
});
