/** Frozen model test: matched synthetic policies, no learner DB, no retraining. */
import {
  appendFileSync,
  existsSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  truncateSync,
  writeFileSync,
} from "node:fs";
import { createHash } from "node:crypto";
import { dirname, join } from "node:path";
import { createTable } from "../packages/poker/src/table";
import {
  inferredRange,
  pairedActionComparisons,
  valueModel,
} from "../packages/poker/src/table-review";
import { fastAssessment } from "../packages/poker/src/fast-assessment";
import {
  buildPublicFeatures,
  publicAssessmentSnapshot,
} from "../packages/poker/src/fast-assessment-features";
import {
  MISTAKE_PROTOCOL,
  matchedOpeningChoices,
  mistakeTeacherFrame,
  premiumOpening,
  summarizeMistakeCohort,
  type MistakeExperimentRow,
  type ExperimentDecision,
} from "../packages/poker/src/mistake-experiment";
import type { FastAssessmentCandidate } from "../packages/shared/src/fast-assessment";

const args = Object.fromEntries(
  process.argv.slice(2).map((s) => s.replace(/^--/, "").split("=")),
);
const natural = Number(args.natural ?? 400),
  challenge = Number(args.challenge ?? 200);
const out = args.out ?? "data/ml/mistake-experiment.jsonl";
const reportOut =
  args.report ?? "packages/poker/models/mistake-experiment-report.json";
if (
  ![natural, challenge].every(
    (n) => Number.isInteger(n) && n >= 0 && n <= 10000,
  ) ||
  !(natural + challenge)
)
  throw Error(
    "natural/challenge must be integers 0..10000, with at least one deal.",
  );
for (const key of Object.keys(args))
  if (!["natural", "challenge", "out", "report"].includes(key))
    throw Error(`Unknown argument ${key}`);
const hash = (s: string | Buffer) =>
  createHash("sha256").update(s).digest("hex");
const modelPath = "packages/poker/models/fast-assessment-v1.json";
const modelSha256 = hash(readFileSync(modelPath));
const plan: { group: number; cohort: MistakeExperimentRow["cohort"] }[] = [];
for (let n = 0; n < natural; n++)
  plan.push({ group: MISTAKE_PROTOCOL.naturalStart + n, cohort: "natural" });
for (
  let g = MISTAKE_PROTOCOL.challengeStart, found = 0;
  found < challenge;
  g++
) {
  if (g >= 3_000_000)
    throw Error("Challenge search exceeded fixed group range.");
  const s = createTable(
    "synthetic-experiment",
    2,
    Math.imul(g + 1, 2654435761) >>> 0,
  );
  if (premiumOpening(s.players[0].hole)) {
    plan.push({ group: g, cohort: "premium-challenge" });
    found++;
  }
}
const plannedGroups = new Set(plan.map((p) => p.group));
const priorDatasets: {
  path: string;
  sha256: string;
  overlapGroups: number[];
}[] = [];
if (existsSync("data/ml"))
  for (const name of readdirSync("data/ml").filter(
    (s) =>
      s.endsWith(".jsonl") &&
      !s.startsWith("mistake-experiment") &&
      join("data/ml", s) !== out,
  )) {
    const path = join("data/ml", name),
      contents = readFileSync(path, "utf8");
    const groups = new Set<number>();
    for (const line of contents.split("\n")) {
      // Rejection fixtures may intentionally be truncated/malformed; inspect every parseable identity.
      try {
        const r = JSON.parse(line);
        if (Number.isInteger(r.group) && plannedGroups.has(r.group))
          groups.add(r.group);
      } catch {
        /* not a valid prior identity */
      }
    }
    if (groups.size)
      throw Error(`Fresh-group overlap in ${path}: ${[...groups]}`);
    priorDatasets.push({ path, sha256: hash(contents), overlapGroups: [] });
  }
const codePaths = [
  "packages/poker/src/mistake-experiment.ts",
  "packages/poker/src/fast-assessment.ts",
  "packages/poker/src/fast-assessment-features.ts",
  "packages/poker/src/table-review.ts",
  "packages/poker/src/live-odds.ts",
  "packages/poker/src/table.ts",
  "packages/poker/src/index.ts",
  "packages/poker/src/bot-policy.ts",
  "scripts/ml-mistake-experiment.ts",
];
const config = {
  protocol: MISTAKE_PROTOCOL,
  natural,
  challenge,
  modelSha256,
  codeSha256: Object.fromEntries(
    codePaths.map((p) => [p, hash(readFileSync(p))]),
  ),
  planSha256: hash(JSON.stringify(plan)),
};
const protocolHash = hash(JSON.stringify(config));
mkdirSync(dirname(out), { recursive: true });
const rows: MistakeExperimentRow[] = [];
if (existsSync(out)) {
  const contents = readFileSync(out, "utf8"),
    lines = contents.split("\n");
  let bytes = 0;
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (!line && i === lines.length - 1) break;
    if (i === lines.length - 1 && !contents.endsWith("\n")) {
      truncateSync(out, bytes);
      break;
    }
    let row: MistakeExperimentRow;
    try {
      row = JSON.parse(line);
    } catch {
      throw Error(
        "Malformed interior experiment row; inspect before resuming.",
      );
    }
    const expected = plan[rows.length];
    if (
      row.protocolHash !== protocolHash ||
      row.group !== expected?.group ||
      row.cohort !== expected.cohort
    )
      throw Error(
        "Experiment protocol/group mismatch; preserve output and use a new file.",
      );
    const s = createTable(
        "synthetic-experiment",
        2,
        Math.imul(row.group + 1, 2654435761) >>> 0,
      ),
      choices = matchedOpeningChoices({ hero: s.players[0].hole }, row.group);
    for (const p of ["control", "leaky"] as const) {
      const d = row[p];
      if (
        !d ||
        JSON.stringify(d.candidate) !== JSON.stringify(choices[p]) ||
        !Number.isFinite(d.probability) ||
        d.probability < 0 ||
        d.probability > 1 ||
        ![0, 1].includes(d.teacherFlag) ||
        !Number.isFinite(d.teacherLower) ||
        !Number.isFinite(d.teacherUpper) ||
        d.teacherFlag !== Number(d.teacherLower > 0) ||
        JSON.stringify(d.features) !==
          JSON.stringify(
            buildPublicFeatures(publicAssessmentSnapshot(s), choices[p]),
          )
      )
        throw Error("Invalid resumed decision row.");
      const predicted = fastAssessment(s, choices[p]);
      if (
        d.probability !== predicted.probability ||
        d.status !== predicted.status ||
        d.label !== predicted.label
      )
        throw Error("Resumed row does not match frozen inference.");
    }
    if (row.premium !== choices.premium)
      throw Error("Invalid resumed premium selection.");
    rows.push(row);
    bytes += Buffer.byteLength(line) + 1;
  }
}
// This manifest is written before any teacher outcomes. Output cannot resume under a changed protocol.
const manifestPath = out + ".protocol.json";
if (
  existsSync(manifestPath) &&
  readFileSync(manifestPath, "utf8") !== JSON.stringify(config, null, 2) + "\n"
)
  throw Error("Protocol manifest mismatch; use new output.");
writeFileSync(manifestPath, JSON.stringify(config, null, 2) + "\n");
const start = performance.now(),
  resumed = rows.length;
console.log(
  JSON.stringify({
    protocolHash,
    natural,
    challenge,
    resumed,
    protocolFixedBeforeTeacherEvaluation: true,
  }),
);
for (let i = rows.length; i < plan.length; i++) {
  const { group, cohort } = plan[i],
    seed = Math.imul(group + 1, 2654435761) >>> 0;
  const s = createTable("synthetic-experiment", 2, seed),
    snapshot = publicAssessmentSnapshot(s);
  // Both actions are selected before teacher sampling and model evaluation.
  const choices = matchedOpeningChoices(snapshot, group);
  const f = mistakeTeacherFrame(s);
  const values = valueModel(
    f,
    new Map([[1, inferredRange(s, f, 1)]]),
    (Math.imul(group + 1, 3266489917) ^ 0x68e31da4) >>> 0,
    { samples: 640 },
  );
  function assess(candidate: FastAssessmentCandidate): ExperimentDecision {
    const key =
      candidate.action === "raise"
        ? candidate.amount === 25
          ? "raise"
          : "raise-20"
        : candidate.action;
    const comparisons = pairedActionComparisons(values, key);
    const teacherLower = Math.max(
      ...comparisons.map((c) => c.difference - c.margin),
    );
    const teacherUpper = Math.max(
      ...comparisons.map((c) => c.difference + c.margin),
    );
    const prediction = fastAssessment(s, candidate);
    if (prediction.probability === null)
      throw Error("Experiment left frozen model support.");
    return {
      candidate,
      probability: prediction.probability,
      status: prediction.status,
      label: prediction.label,
      teacherFlag: teacherLower > 0 ? 1 : 0,
      teacherLower,
      teacherUpper,
      features: buildPublicFeatures(snapshot, candidate),
    };
  }
  const row: MistakeExperimentRow = {
    protocolHash,
    group,
    cohort,
    premium: choices.premium,
    control: assess(choices.control),
    leaky: assess(choices.leaky),
  };
  appendFileSync(out, JSON.stringify(row) + "\n");
  rows.push(row);
  if ((i + 1) % 50 === 0)
    console.log(
      JSON.stringify({
        completed: i + 1,
        total: plan.length,
        elapsedSeconds: (performance.now() - start) / 1000,
      }),
    );
}
const report = {
  experiment:
    "Controlled premium-overfold injection against frozen quick assessment",
  protocolHash,
  ...config,
  source:
    "synthetic-only; no application database read or written; no retraining or threshold selection",
  interpretation:
    "Teacher labels are conditional authored-bot forecasts with sampling uncertainty, not optimal poker or human skill. Premium-fold intent is an injected policy, not ground truth. Negative teacher labels include inconclusive comparisons. Raw threshold 0.5 diagnostics are not deployed gap predictions. Natural and premium-enriched cohorts must not be pooled as usage prevalence.",
  bootstrap:
    "2000 paired deal resamples, fixed seed 0x64a9cc21, percentile 95%; describes this synthetic experiment only",
  priorDatasets,
  dataset: {
    path: out,
    sha256: hash(readFileSync(out)),
    groups: rows.length,
    decisions: rows.length * 2,
    synthetic: true,
  },
  cohorts: {
    natural: summarizeMistakeCohort(rows.filter((r) => r.cohort === "natural")),
    premiumChallenge: summarizeMistakeCohort(
      rows.filter((r) => r.cohort === "premium-challenge"),
    ),
  },
};
mkdirSync(dirname(reportOut), { recursive: true });
writeFileSync(reportOut, JSON.stringify(report, null, 2) + "\n");
console.log(
  JSON.stringify({
    complete: true,
    report: reportOut,
    rows: rows.length,
    newRows: rows.length - resumed,
    elapsedSeconds: (performance.now() - start) / 1000,
    sha256: report.dataset.sha256,
  }),
);
