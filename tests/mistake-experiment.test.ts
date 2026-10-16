import { describe, expect, it } from "vitest";
import { createTable } from "../packages/poker/src/table";
import {
  publicAssessmentSnapshot,
  validatePublicCandidate,
} from "../packages/poker/src/fast-assessment-features";
import {
  matchedOpeningChoices,
  mistakeTeacherFrame,
  premiumOpening,
  summarizeMistakeCohort,
  type MistakeExperimentRow,
} from "../packages/poker/src/mistake-experiment";
import {
  inferredRange,
  pairedActionComparisons,
  valueModel,
} from "../packages/poker/src/table-review";

describe("frozen mistake-prone player experiment", () => {
  it("keeps the actual teacher unchanged when hidden cards, runout and outcomes are inaccessible", () => {
    const a = createTable("public-only", 2, 98117),
      b = structuredClone(a);
    const evaluate = (s: typeof a) => {
      const f = mistakeTeacherFrame(s);
      expect(f.players[1].hole).toEqual([]);
      return pairedActionComparisons(
        valueModel(f, new Map([[1, inferredRange(s, f, 1)]]), 710492, {
          samples: 200,
        }),
        "fold",
      );
    };
    const expected = evaluate(a);
    for (const key of ["seed", "runout", "history", "review", "decisions"])
      Object.defineProperty(b, key, {
        get() {
          throw Error(`Private access ${key}`);
        },
      });
    Object.defineProperty(b.players[1], "hole", {
      get() {
        throw Error("Opponent hole");
      },
    });
    for (const p of b.players)
      Object.defineProperty(p, "payout", {
        get() {
          throw Error("Future payout");
        },
      });
    expect(evaluate(b)).toEqual(expected);
  });
  it("defines premium injection independently of outcomes", () => {
    for (const hand of [
      ["Ts", "Th"],
      ["Ac", "Kd"],
      ["As", "Ks"],
      ["Ah", "Ad"],
    ])
      expect(premiumOpening(hand)).toBe(true);
    for (const hand of [
      ["9s", "9h"],
      ["Ac", "Qd"],
      ["Js", "Ts"],
      ["2h", "7d"],
    ])
      expect(premiumOpening(hand)).toBe(false);
  });
  it("makes matched nonpremium choices identical and legal across fresh states", () => {
    for (let g = 1_000_000; g < 1_000_200; g++) {
      const s = createTable(
          "experiment",
          2,
          Math.imul(g + 1, 2654435761) >>> 0,
        ),
        snapshot = publicAssessmentSnapshot(s);
      const choices = matchedOpeningChoices(snapshot, g);
      expect(matchedOpeningChoices(snapshot, g)).toEqual(choices);
      if (!choices.premium) expect(choices.control).toEqual(choices.leaky);
      for (const p of ["control", "leaky"] as const)
        expect(validatePublicCandidate(snapshot, choices[p])).toBeNull();
    }
  });
  it("uses only permitted hero cards, never identity or hidden outcome state", () => {
    const observation = { hero: ["As", "Ks"] };
    for (const key of [
      "seed",
      "runout",
      "opponent",
      "history",
      "id",
      "players",
    ])
      Object.defineProperty(observation, key, {
        get() {
          throw Error("Private access");
        },
      });
    expect(matchedOpeningChoices(observation, 1_000_004)).toEqual(
      matchedOpeningChoices({ hero: ["Ah", "Kh"] }, 1_000_004),
    );
  });
  it("injects the declared fold tendency without changing the shared nonfold choice", () => {
    let controlFolds = 0,
      leakyFolds = 0;
    for (let g = 0; g < 10_000; g++) {
      const c = matchedOpeningChoices({ hero: ["As", "Kh"] }, g);
      if (c.control.action === "fold") controlFolds++;
      if (c.leaky.action === "fold") leakyFolds++;
      if (c.control.action === "fold") expect(c.leaky.action).toBe("fold");
      if (c.leaky.action !== "fold") expect(c.leaky).toEqual(c.control);
    }
    expect(controlFolds / 10_000).toBeCloseTo(0.1, 1);
    expect(leakyFolds / 10_000).toBeCloseTo(0.8, 1);
  });
  it("never counts abstention or a diagnostic probability as a deployed correct gap flag", () => {
    const decision = {
      candidate: { action: "fold" as const },
      probability: 0.95,
      status: "uncertain" as const,
      label: null,
      teacherFlag: 1 as const,
      teacherLower: 2,
      teacherUpper: 4,
      features: [],
    };
    const rows: MistakeExperimentRow[] = [
      {
        protocolHash: "fixture",
        cohort: "premium-challenge",
        group: 2_000_001,
        premium: true,
        control: {
          ...decision,
          probability: 0.1,
          status: "ready",
          label: "no-clear-gap",
          teacherFlag: 0,
          teacherLower: -2,
        },
        leaky: decision,
      },
    ];
    const report = summarizeMistakeCohort(rows);
    expect(report.leaky.rawThreshold05DiagnosticOnly.tp).toBe(1);
    expect(report.leaky.deployed).toMatchObject({
      ready: 0,
      truePositiveGapFlags: 0,
      recall: 0,
      abstainedOnTeacherPositive: 1,
      agreementWhenReady: null,
    });
    expect(report.paired).toMatchObject({
      teacherFlagRateDeltaLeakyMinusControl: 1,
      changedDeployedTruePositiveFlags: 0,
    });
  });
});
