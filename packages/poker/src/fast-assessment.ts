import artifact from "../models/fast-assessment-v1.json";
import type {
  FastAssessmentCandidate,
  FastAssessmentResult,
} from "../../shared/src/fast-assessment";
import type { TableState } from "./table";
import {
  buildPublicFeatures,
  publicAssessmentSnapshot,
  supportReason,
} from "./fast-assessment-features";
export {
  buildPublicFeatures,
  publicAssessmentSnapshot,
} from "./fast-assessment-features";
export type { PublicAssessmentSnapshot } from "./fast-assessment-features";

const limitations = [
  "Predicts whether detailed conditional analysis would establish a higher-return tested alternative. This is an authored bot model, not GTO or a grade of poker skill.",
  "No clear gap means the teacher probably would not establish a difference; it does not prove the action is good.",
  "Training uses 200 sampled worlds per deal; held-out evaluation also uses an independent 640-world teacher. Confidence describes teacher agreement, not accuracy against human players.",
];
/** CPU-only inference. No random generation, persistence, network or gameplay mutations. */
export function fastAssessment(
  s: TableState,
  candidate: FastAssessmentCandidate,
): FastAssessmentResult {
  const snapshot = publicAssessmentSnapshot(s);
  const reason = supportReason(snapshot, candidate);
  const common = {
    modelId: artifact.modelId,
    featureVersion: 1 as const,
    support: artifact.support,
    limitations: [...limitations],
  };
  if (reason)
    return {
      ...common,
      status: "unsupported",
      probability: null,
      label: null,
      threshold: null,
      reason,
    };
  const probability = predictPublicFeatures(
    buildPublicFeatures(snapshot, candidate),
  );
  const key = (candidate.action +
    (candidate.amount ?? "")) as keyof typeof artifact.candidateThresholds;
  const { positive: high, negative: low } = artifact.candidateThresholds[key];
  if (high !== null && probability >= high)
    return {
      ...common,
      status: "ready",
      probability,
      label: "model-gap",
      threshold: high,
    };
  if (low !== null && probability <= low)
    return {
      ...common,
      status: "ready",
      probability,
      label: "no-clear-gap",
      threshold: low,
    };
  return {
    ...common,
    status: "uncertain",
    probability,
    label: null,
    threshold: null,
    reason:
      "The model abstains at this confidence. Use detailed conditional analysis.",
  };
}
/** Exported for reproducible cross-runtime inference verification and latency measurement. */
export function predictPublicFeatures(features: number[]): number {
  if (
    features.length !== artifact.features.length ||
    features.some((x) => !Number.isFinite(x))
  )
    throw Error("Invalid fast-assessment feature vector.");
  let sum = 0;
  for (const tree of artifact.trees) {
    let n = 0;
    while (tree.left[n] !== -1)
      n =
        features[tree.feature[n]] <= tree.threshold[n]
          ? tree.left[n]
          : tree.right[n];
    sum += tree.value[n];
  }
  const raw = sum / artifact.trees.length,
    { x, y } = artifact.calibration;
  if (raw <= x[0]) return y[0];
  if (raw >= x[x.length - 1]) return y[y.length - 1];
  let i = 1;
  while (x[i] < raw) i++;
  return y[i - 1] + ((raw - x[i - 1]) / (x[i] - x[i - 1])) * (y[i] - y[i - 1]);
}
