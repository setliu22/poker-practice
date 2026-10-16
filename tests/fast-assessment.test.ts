import { describe, expect, it } from "vitest";
import { createTable } from "../packages/poker/src/table";
import {
  fastAssessment,
  predictPublicFeatures,
  publicAssessmentSnapshot,
} from "../packages/poker/src/fast-assessment";
import { buildPublicFeatures } from "../packages/poker/src/fast-assessment-features";
import { fastAssessmentRequestSchema } from "../packages/shared/src/fast-assessment";
import report from "../packages/poker/models/fast-assessment-report.json";

describe("local trained fast assessment", () => {
  it("matches independently exported sklearn calibrated probabilities", () => {
    expect(report.inferenceFixtures.length).toBeGreaterThan(10);
    for (const fixture of report.inferenceFixtures)
      expect(predictPublicFeatures(fixture.features)).toBeCloseTo(
        fixture.probability,
        12,
      );
  });
  it("only reads allowed public information and leaves the game unchanged", () => {
    const s = createTable("privacy", 2, 42),
      before = JSON.stringify(s);
    const expected = fastAssessment(s, { action: "raise", amount: 25 });
    expect(JSON.stringify(s)).toBe(before);
    for (const key of [
      "seed",
      "runout",
      "history",
      "review",
      "decisions",
      "policyEvents",
      "rounds",
      "analysisIdentity",
      "startingReads",
      "replayOf",
      "branchOf",
    ])
      Object.defineProperty(s, key, {
        get() {
          throw Error(`Private access: ${key}`);
        },
      });
    Object.defineProperty(s.players[1], "hole", {
      get() {
        throw Error("Opponent secret");
      },
    });
    for (const p of s.players)
      Object.defineProperty(p, "payout", {
        get() {
          throw Error("Later outcome");
        },
      });
    expect(fastAssessment(s, { action: "raise", amount: 25 })).toEqual(
      expected,
    );
  });
  it("keeps unsupported policies, reads, stack depths, streets and opponents explicit", () => {
    const mutations = [
      (s: ReturnType<typeof createTable>) => {
        s.policyVersion = 1;
      },
      (s: ReturnType<typeof createTable>) => {
        s.reads = [
          { seat: 0, decisions: 2, facing: 1, folds: 1, calls: 0, raises: 0 },
        ];
      },
      (s: ReturnType<typeof createTable>) => {
        s.players[0].stack = 495;
      },
      (s: ReturnType<typeof createTable>) => {
        s.street = "flop";
        s.board = ["As", "Kh", "2d"];
      },
      (s: ReturnType<typeof createTable>) => {
        s.players[1].botId = "theo";
      },
      (s: ReturnType<typeof createTable>) => {
        s.actor = 1;
      },
    ];
    for (const mutate of mutations) {
      const s = createTable("unsupported", 2, 42);
      mutate(s);
      expect(fastAssessment(s, { action: "call" })).toMatchObject({
        status: "unsupported",
        probability: null,
        label: null,
      });
    }
    expect(
      fastAssessment(createTable("multi", 3, 42), { action: "call" }).status,
    ).toBe("unsupported");
  });
  it("validates action legality and only predicts trained raise sizes", () => {
    const s = createTable("legal", 2, 42);
    for (const c of [
      { action: "check" as const },
      { action: "raise" as const, amount: 19 },
      { action: "raise" as const, amount: 26 },
      { action: "raise" as const, amount: 1006 },
      { action: "raise" as const, amount: NaN },
      { action: "call" as const, amount: 25 },
    ])
      expect(fastAssessment(s, c).status).toBe("unsupported");
    expect(
      fastAssessmentRequestSchema.safeParse({
        revision: 0,
        action: "call",
        secret: "x",
      }).success,
    ).toBe(false);
    expect(
      fastAssessmentRequestSchema.safeParse({ revision: -1, action: "call" })
        .success,
    ).toBe(false);
  });
  it("is suit-renaming invariant and identities never enter model features", () => {
    const a = createTable("a", 2, 42),
      b = createTable("b", 2, 99);
    a.players[0].hole = ["Ah", "Kh"];
    b.players[0].hole = ["As", "Ks"];
    expect(
      buildPublicFeatures(publicAssessmentSnapshot(a), { action: "fold" }),
    ).toEqual(
      buildPublicFeatures(publicAssessmentSnapshot(b), { action: "fold" }),
    );
    expect(fastAssessment(a, { action: "fold" })).toEqual(
      fastAssessment(b, { action: "fold" }),
    );
  });
  it("has isolated deal groups, measured heldout performance and honest abstention", () => {
    expect(report.dataset.rows).toBe(10000);
    expect(report.dataset.groups).toBe(2500);
    expect(report.heldoutIndependent640.rows).toBe(1000);
    expect(report.heldoutIndependent640.brier).toBeLessThan(
      report.baselines640.majority.brier,
    );
    const statuses = new Set(
      Array.from(
        { length: 100 },
        (_, i) =>
          fastAssessment(createTable("status", 2, i), { action: "fold" })
            .status,
      ),
    );
    expect(statuses.has("uncertain")).toBe(true);
    for (let i = 0; i < 50; i++) {
      const r = fastAssessment(createTable("r", 2, i), { action: "call" });
      expect(r.limitations.join(" ")).toContain("not GTO");
      if (r.status === "uncertain") expect(r.label).toBeNull();
    }
  });
});
