import { readFileSync, writeFileSync } from "node:fs";
import { createTable } from "../packages/poker/src/table";
import {
  fastAssessment,
  predictPublicFeatures,
} from "../packages/poker/src/fast-assessment";
import type { FastAssessmentCandidate } from "../packages/shared/src/fast-assessment";
const states = Array.from({ length: 1000 }, (_, i) =>
  createTable("benchmark", 2, i + 1),
);
const candidates: FastAssessmentCandidate[] = [
  { action: "fold" },
  { action: "call" },
  { action: "raise", amount: 20 },
  { action: "raise", amount: 25 },
];
for (let i = 0; i < 1000; i++) fastAssessment(states[i], candidates[i % 4]);
const latencies: number[] = [];
for (let i = 0; i < 10000; i++) {
  const t = performance.now();
  fastAssessment(states[i % states.length], candidates[i % 4]);
  latencies.push(performance.now() - t);
}
latencies.sort((a, b) => a - b);
const result = {
  iterations: latencies.length,
  medianMs: latencies[5000],
  p95Ms: latencies[9500],
  p99Ms: latencies[9900],
  scope:
    "Entire pure fastAssessment function: public snapshot, support validation, feature extraction, trees and calibration; excludes HTTP/SQLite",
  node: process.version,
};
const path = "packages/poker/models/fast-assessment-report.json",
  report = JSON.parse(readFileSync(path, "utf8"));
report.runtimeLatency = result;
// Cross-runtime equality: Python exports a few public synthetic feature vectors,
// never learner records. Ensure deployment preserves calibrated probabilities.
for (const v of report.inferenceFixtures ?? [])
  if (Math.abs(predictPublicFeatures(v.features) - v.probability) > 1e-12)
    throw Error("Python/TypeScript inference mismatch");
writeFileSync(path, JSON.stringify(report, null, 2) + "\n");
console.log(JSON.stringify(result));
