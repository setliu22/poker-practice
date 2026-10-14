import { describe, expect, it } from "vitest";
import { decisionRating } from "../packages/poker/src/decision-rating";
import type { DecisionReview } from "../packages/shared/src/table";

function fixture(difference = 10, margin = 2, exact = false): DecisionReview {
  return {
    analysisVersion: 7,
    chosenKey: "call",
    values: [
      {
        key: "call",
        label: "Call",
        chips: -5,
        margin: exact ? 0 : 4,
        exact,
        samples: exact ? 0 : 640,
        allFold: 0,
      },
      {
        key: "raise",
        label: "Raise",
        chips: -5 + difference,
        margin: exact ? 0 : 4,
        exact,
        samples: exact ? 0 : 640,
        allFold: 20,
      },
    ],
    comparisons: [
      {
        key: "raise",
        difference,
        margin,
        samples: exact ? 0 : 640,
        clear: difference > (exact ? 1e-8 : margin),
      },
    ],
  } as DecisionReview;
}

describe("conditional agreement with the tested opponent model", () => {
  it("uses an independent known score and reverses interval bounds correctly", () => {
    // One BB missed, with an interval of 0.8 to 1.2 BB:
    // 100/(1+1)=50; 100/(1+1.2)=45.4545; 100/(1+0.8)=55.5556.
    expect(decisionRating(fixture())).toMatchObject({
      version: 1,
      status: "estimated",
      score: 50,
      scoreInterval: [45.5, 55.6],
      regretBb: 1,
      regretIntervalBb: [0.8, 1.2],
    });
    expect(decisionRating(fixture()).explanation).toContain("not poker skill");
    expect(decisionRating(fixture()).explanation).toContain(
      "not a winning probability",
    );
  });

  it("does not invent certainty when a better choice is unresolved", () => {
    expect(decisionRating(fixture(10, 12))).toMatchObject({
      status: "inconclusive",
      score: null,
      scoreInterval: null,
      regretBb: 1,
      regretIntervalBb: [0, 2.2],
    });
    expect(decisionRating(fixture(-10, 12))).toMatchObject({
      status: "inconclusive",
      score: null,
      regretBb: 0,
      regretIntervalBb: [0, 0.2],
    });
  });

  it("gives 100 only when no alternative's interval extends above the chosen action", () => {
    expect(decisionRating(fixture(-10, 2))).toMatchObject({
      status: "estimated",
      score: 100,
      scoreInterval: [100, 100],
      regretIntervalBb: [0, 0],
    });
    expect(decisionRating(fixture(-2, 2)).score).toBe(100);
  });

  it("labels exact arithmetic as conditional on the model, including ties", () => {
    expect(decisionRating(fixture(10, 0, true))).toMatchObject({
      status: "exact-under-model",
      score: 50,
      scoreInterval: [50, 50],
    });
    expect(decisionRating(fixture(0, 0, true))).toMatchObject({
      status: "exact-under-model",
      score: 100,
      scoreInterval: [100, 100],
    });
    expect(decisionRating(fixture(10, 0, true)).explanation).toContain(
      "not validated against real players",
    );
  });

  it("does not mistake zero observed simulation variance for exact enumeration", () => {
    expect(decisionRating(fixture(10, 0))).toMatchObject({
      status: "estimated",
      score: 50,
      scoreInterval: [50, 50],
    });
    const r = fixture(10, 0);
    r.comparisons![0].samples = 0;
    expect(decisionRating(r).status).toBe("unavailable");
  });

  it("allows an exact fold baseline alongside sufficiently sampled alternatives", () => {
    const r = fixture();
    Object.assign(r.values[0], {
      key: "fold",
      chips: 0,
      exact: true,
      margin: 0,
      samples: 0,
    });
    r.chosenKey = "fold";
    r.values[1].chips = 10;
    expect(decisionRating(r)).toMatchObject({ status: "estimated", score: 50 });
  });

  it("accounts for every raise size and uses the maximum simultaneous regret interval", () => {
    const r = fixture();
    r.values.push({ ...r.values[1], key: "raise-pot", chips: 15 });
    r.comparisons!.push({
      key: "raise-pot",
      difference: 20,
      margin: 3,
      samples: 640,
      clear: true,
    });
    // Max modeled missed value is 2 BB, with interval 1.7 to 2.3 BB.
    expect(decisionRating(r)).toMatchObject({
      score: 33.3,
      scoreInterval: [30.3, 37],
      regretBb: 2,
      regretIntervalBb: [1.7, 2.3],
    });
    r.comparisons!.pop();
    expect(decisionRating(r).status).toBe("unavailable");
  });

  it("rescales chip differences by the supplied big blind", () => {
    expect(decisionRating(fixture(10, 0, true), 5)).toMatchObject({
      score: 33.3,
      regretBb: 2,
      regretIntervalBb: [2, 2],
    });
    for (const bb of [0, -1, NaN, Infinity])
      expect(decisionRating(fixture(), bb).status).toBe("unavailable");
  });

  it("withholds a score for old analyses or a single compulsory action", () => {
    for (const analysisVersion of [undefined, 1, 5, 6, 8])
      expect(decisionRating({ ...fixture(), analysisVersion }).status).toBe(
        "unavailable",
      );
    const r = fixture();
    r.values.pop();
    r.comparisons = [];
    expect(decisionRating(r)).toMatchObject({
      status: "unavailable",
      score: null,
      regretBb: null,
    });
  });

  it("rejects missing, duplicate, nonfinite or inconsistent comparisons", () => {
    const mutations: ((r: DecisionReview) => void)[] = [
      (r) => {
        r.chosenKey = "missing";
      },
      (r) => {
        r.values[1].key = "call";
      },
      (r) => {
        r.values[1].chips = NaN;
      },
      (r) => {
        r.values[1].margin = -1;
      },
      (r) => {
        r.values[1].samples = 2;
      },
      (r) => {
        r.values[1].samples = 640.5;
      },
      (r) => {
        r.comparisons = [];
      },
      (r) => {
        r.comparisons!.push({ ...r.comparisons![0] });
      },
      (r) => {
        r.comparisons![0].key = "call";
      },
      (r) => {
        r.comparisons![0].key = "missing";
      },
      (r) => {
        r.comparisons![0].difference = Infinity;
      },
      (r) => {
        r.comparisons![0].difference = 11;
      },
      (r) => {
        r.comparisons![0].margin = NaN;
      },
      (r) => {
        r.comparisons![0].margin = -1;
      },
      (r) => {
        r.comparisons![0].samples = 2;
      },
      (r) => {
        r.comparisons![0].samples = 639;
      },
      (r) => {
        r.comparisons![0].clear = false;
      },
      (r) => {
        r.values[1].exact = true;
      },
    ];
    for (const mutate of mutations) {
      const r = fixture();
      mutate(r);
      expect(decisionRating(r).status).toBe("unavailable");
    }
    const overflow = fixture();
    overflow.values[0].chips = -1e308;
    overflow.values[1].chips = 1e308;
    expect(decisionRating(overflow).status).toBe("unavailable");
    expect(decisionRating(fixture(), 1e-308).status).toBe("unavailable");
  });

  it("never reads hidden or revealed information, outcomes, ranges, position or odds", () => {
    const r = fixture();
    const forbidden = [
      "actualCards",
      "actualProbability",
      "rangeProbability",
      "opponents",
      "hero",
      "board",
      "context",
      "pot",
      "action",
      "street",
      "model",
      "verdict",
    ];
    for (const key of forbidden)
      Object.defineProperty(r, key, {
        get() {
          throw new Error(`Rating read forbidden property: ${key}`);
        },
      });
    expect(decisionRating(r)).toEqual(decisionRating(fixture()));
  });

  it("gives reproducible results and is unaffected by the actual hand's outcome", () => {
    const r = fixture();
    const expected = decisionRating(r);
    for (let i = 0; i < 20; i++) expect(decisionRating(r)).toEqual(expected);
    Object.assign(r, {
      actualCards: [{ seat: 1, cards: ["As", "Ah"] }],
      actualProbability: { share: 0 },
      verdict: "Won the pot",
    });
    expect(decisionRating(r)).toEqual(expected);
  });
});
