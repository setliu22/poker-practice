/** Frozen synthetic experiment helpers. These policies never read a private deal. */
import { random, ranks } from "./index";
import { liveOddsFrame } from "./live-odds";
import type { TableState, DecisionFrame } from "./table";
import type {
  FastAssessmentCandidate,
  FastAssessmentResult,
} from "../../shared/src/fast-assessment";

export const MISTAKE_PROTOCOL = {
  version: "premium-overfold-v1",
  source: "synthetic",
  naturalStart: 1_000_000,
  challengeStart: 2_000_000,
  premium: "TT, JJ, QQ, KK, AA, AK suited or offsuit",
  controlPremiumFoldProbability: 0.1,
  leakyPremiumFoldProbability: 0.8,
  premiumNonfold: { call: 0.1, raise20: 0.3, raise25: 0.6 },
  nonpremium: { fold: 0.35, call: 0.2, raise20: 0.2, raise25: 0.25 },
  samples: 640,
  teacher:
    "analysis7-paired-v1; teacherFlag=max(alternative difference-margin)>0",
  dealSeed:
    "imul(group+1,2654435761) unsigned32; identical to pilot identity mapping, disjoint groups",
  policySeed:
    "imul(group+1,2246822519) xor 0xb5297a4d unsigned32; two shared draws",
  teacherSeed: "imul(group+1,3266489917) xor 0x68e31da4 unsigned32",
  model:
    "frozen opening-mara-et-v1; deployed thresholds unchanged; raw0.5 diagnostic only",
  challengeSelection:
    "first qualifying hero-only premium openings from challengeStart; no outcome filtering",
} as const;

/** The teacher gets the public opening, with opponent cards and future outcomes discarded. */
export function mistakeTeacherFrame(state: TableState): DecisionFrame {
  return {
    ...liveOddsFrame(state),
    id: 0,
    action: "raise",
    amount: 25,
    actions: [],
    reads: [],
  };
}

export function premiumOpening(hero: readonly string[]): boolean {
  const r = hero.map((c) => ranks.indexOf(c[0]) + 2).sort((a, b) => b - a);
  return (
    r.length === 2 &&
    ((r[0] === r[1] && r[0] >= 10) || (r[0] === 14 && r[1] === 13))
  );
}

/** Two shared draws make the paired policies identical except premium fold injection. */
export function matchedOpeningChoices(
  observation: { hero: readonly string[] },
  group: number,
) {
  const rng = random((Math.imul(group + 1, 2246822519) ^ 0xb5297a4d) >>> 0);
  const foldRoll = rng(),
    actionRoll = rng(),
    premium = premiumOpening(observation.hero);
  const nonfold: FastAssessmentCandidate =
    actionRoll < 0.1
      ? { action: "call" }
      : { action: "raise", amount: actionRoll < 0.4 ? 20 : 25 };
  const ordinary: FastAssessmentCandidate =
    foldRoll < 0.35
      ? { action: "fold" }
      : foldRoll < 0.55
        ? { action: "call" }
        : { action: "raise", amount: foldRoll < 0.75 ? 20 : 25 };
  return {
    premium,
    control: premium
      ? foldRoll < 0.1
        ? { action: "fold" as const }
        : nonfold
      : ordinary,
    leaky: premium
      ? foldRoll < 0.8
        ? { action: "fold" as const }
        : nonfold
      : ordinary,
  };
}

export type ExperimentDecision = {
  candidate: FastAssessmentCandidate;
  probability: number;
  status: FastAssessmentResult["status"];
  label: FastAssessmentResult["label"];
  teacherFlag: 0 | 1;
  teacherLower: number;
  teacherUpper: number;
  features: number[];
};
export type MistakeExperimentRow = {
  protocolHash: string;
  cohort: "natural" | "premium-challenge";
  group: number;
  premium: boolean;
  control: ExperimentDecision;
  leaky: ExperimentDecision;
};

function ratio(n: number, d: number) {
  return d ? n / d : null;
}
function confusion(rows: { truth: boolean; prediction: boolean }[]) {
  let tp = 0,
    fp = 0,
    tn = 0,
    fn = 0;
  for (const r of rows)
    if (r.truth) {
      if (r.prediction) tp++;
      else fn++;
    } else {
      if (r.prediction) fp++;
      else tn++;
    }
  return {
    tp,
    fp,
    tn,
    fn,
    accuracy: ratio(tp + tn, rows.length),
    precision: ratio(tp, tp + fp),
    recall: ratio(tp, tp + fn),
  };
}

export function summarizeMistakeDecisions(
  rows: MistakeExperimentRow[],
  policy: "control" | "leaky",
) {
  const decisions = rows.map((r) => r[policy]);
  const teacherPositive = decisions.filter((d) => d.teacherFlag === 1).length;
  const ready = decisions.filter((d) => d.status === "ready");
  const truePositive = ready.filter(
    (d) => d.label === "model-gap" && d.teacherFlag === 1,
  ).length;
  const falseClear = ready.filter(
    (d) => d.label === "no-clear-gap" && d.teacherFlag === 1,
  ).length;
  const positiveAbstentions = decisions.filter(
    (d) => d.teacherFlag === 1 && d.status !== "ready",
  ).length;
  const prevalence = ratio(teacherPositive, rows.length) ?? 0;
  return {
    decisions: rows.length,
    teacherPositive,
    teacherFlagRate: ratio(teacherPositive, rows.length),
    premiumDecisions: rows.filter((r) => r.premium).length,
    premiumFolds: rows.filter(
      (r) => r.premium && r[policy].candidate.action === "fold",
    ).length,
    premiumFoldRate: ratio(
      rows.filter((r) => r.premium && r[policy].candidate.action === "fold")
        .length,
      rows.filter((r) => r.premium).length,
    ),
    meanProbability: ratio(
      decisions.reduce((s, d) => s + d.probability, 0),
      rows.length,
    ),
    brier: ratio(
      decisions.reduce((s, d) => s + (d.probability - d.teacherFlag) ** 2, 0),
      rows.length,
    ),
    rawThreshold05DiagnosticOnly: confusion(
      decisions.map((d) => ({
        truth: !!d.teacherFlag,
        prediction: d.probability >= 0.5,
      })),
    ),
    deployed: {
      ready: ready.length,
      coverage: ratio(ready.length, rows.length),
      agreementWhenReady: ratio(
        ready.filter((d) => (d.label === "model-gap") === !!d.teacherFlag)
          .length,
        ready.length,
      ),
      predictedGaps: ready.filter((d) => d.label === "model-gap").length,
      truePositiveGapFlags: truePositive,
      recall: ratio(truePositive, teacherPositive),
      falseClearOnTeacherPositive: falseClear,
      falseClearRateOnTeacherPositive: ratio(falseClear, teacherPositive),
      abstainedOnTeacherPositive: positiveAbstentions,
      abstentionRateOnTeacherPositive: ratio(
        positiveAbstentions,
        teacherPositive,
      ),
      uncertain: decisions.filter((d) => d.status === "uncertain").length,
      unsupported: decisions.filter((d) => d.status === "unsupported").length,
    },
    baselinesDiagnosticOnly: {
      premiumFoldRule: confusion(
        rows.map((r) => ({
          truth: !!r[policy].teacherFlag,
          prediction: r.premium && r[policy].candidate.action === "fold",
        })),
      ),
      sameCohortMajority: {
        ...confusion(
          decisions.map((d) => ({
            truth: !!d.teacherFlag,
            prediction: prevalence >= 0.5,
          })),
        ),
        brierAtEmpiricalPrevalence: prevalence * (1 - prevalence),
        note: "Post-hoc same-cohort descriptive baseline; no fitting/evaluation independence claim.",
      },
    },
  };
}

export function summarizeMistakeCohort(rows: MistakeExperimentRow[]) {
  const changed = rows.filter(
    (r) =>
      JSON.stringify(r.control.candidate) !== JSON.stringify(r.leaky.candidate),
  );
  const delta = rows.map((r) => r.leaky.teacherFlag - r.control.teacherFlag);
  const mean = delta.reduce((a, b) => a + b, 0) / (rows.length || 1);
  const rng = random(0x64a9cc21),
    bootstrap: number[] = [];
  if (rows.length)
    for (let b = 0; b < 2000; b++) {
      let sum = 0;
      for (let n = 0; n < rows.length; n++)
        sum += delta[Math.floor(rng() * delta.length)];
      bootstrap.push(sum / rows.length);
    }
  bootstrap.sort((a, b) => a - b);
  return {
    control: summarizeMistakeDecisions(rows, "control"),
    leaky: summarizeMistakeDecisions(rows, "leaky"),
    paired: {
      changedDecisions: changed.length,
      teacherFlagRateDeltaLeakyMinusControl: mean,
      pairedDealBootstrap95: rows.length
        ? [bootstrap[50], bootstrap[1949]]
        : null,
      changedControlTeacherPositive: changed.filter(
        (r) => r.control.teacherFlag,
      ).length,
      changedLeakyTeacherPositive: changed.filter((r) => r.leaky.teacherFlag)
        .length,
      changedMeanProbabilityDelta: ratio(
        changed.reduce(
          (s, r) => s + r.leaky.probability - r.control.probability,
          0,
        ),
        changed.length,
      ),
      changedDeployedTruePositiveFlags: changed.filter(
        (r) =>
          r.leaky.teacherFlag &&
          r.leaky.status === "ready" &&
          r.leaky.label === "model-gap",
      ).length,
    },
  };
}
