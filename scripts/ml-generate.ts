/** Reproducible public-only teacher dataset. No application DB is read or written. */
import {
  appendFileSync,
  existsSync,
  mkdirSync,
  readFileSync,
  truncateSync,
} from "node:fs";
import { dirname } from "node:path";
import { createTable, type DecisionFrame } from "../packages/poker/src/table";
import {
  inferredRange,
  pairedActionComparisons,
  valueModel,
} from "../packages/poker/src/table-review";
import {
  buildPublicFeatures,
  publicAssessmentSnapshot,
} from "../packages/poker/src/fast-assessment-features";
import type { FastAssessmentCandidate } from "../packages/shared/src/fast-assessment";
const args = Object.fromEntries(
  process.argv.slice(2).map((x) => x.replace(/^--/, "").split("=")),
);
const start = Number(args.start ?? 0),
  count = Number(args.count ?? 2500),
  samples = Number(args.samples ?? 200),
  out = args.out ?? "data/ml/pilot.jsonl";
if (args.split && !["train", "validation", "test"].includes(args.split))
  throw Error("Unknown split.");
if (
  ![start, count, samples].every(Number.isInteger) ||
  start < 0 ||
  count < 1 ||
  count > 100000 ||
  ![200, 640].includes(samples) ||
  start + count > 10_000_000
)
  throw Error(
    "Use integer start>=0,1<=count<=100000,samples=200 or640; start+count<=10000000.",
  );
mkdirSync(dirname(out), { recursive: true });
const completed = new Set<number>();
const expectedCandidates = new Set(["fold", "call", "raise20", "raise25"]);
if (existsSync(out)) {
  const content = readFileSync(out, "utf8"),
    lines = content.split("\n");
  let offset = 0,
    active = -1,
    groupStart = 0,
    groupRows = 0,
    partial = false;
  let groupCandidates = new Set<string>();
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (!line && i === lines.length - 1) break;
    let row;
    try {
      row = JSON.parse(line);
    } catch {
      if (i === lines.length - 1) {
        partial = true;
        break;
      }
      throw Error(
        "Malformed dataset row; preserve and inspect before resuming.",
      );
    }
    if (
      row.samples !== samples ||
      row.datasetVersion !== 1 ||
      row.featureVersion !== 1 ||
      row.source !== "synthetic" ||
      row.teacherVersion !== "analysis7-paired-v1" ||
      row.teacherSeedScheme !==
        (samples === 640 ? "independent640-v1" : "pilot200-v1") ||
      row.split !==
        (row.group % 10 === 0
          ? "test"
          : row.group % 10 === 1
            ? "validation"
            : "train") ||
      !Number.isInteger(row.group) ||
      row.features?.length !== 9
    )
      throw Error("Dataset configuration mismatch.");
    if (row.group !== active) {
      if (active !== -1) {
        if (groupRows !== 4 || groupCandidates.size !== 4)
          throw Error("Incomplete interior group; preserve and inspect.");
        completed.add(active);
      }
      if (completed.has(row.group)) throw Error("Repeated completed group.");
      active = row.group;
      groupStart = offset;
      groupRows = 0;
      groupCandidates = new Set<string>();
    }
    const candidateKey =
      row.candidate?.action + String(row.candidate?.amount ?? "");
    if (
      !expectedCandidates.has(candidateKey) ||
      groupCandidates.has(candidateKey)
    )
      throw Error(
        "Unknown or duplicated group candidate; preserve and inspect.",
      );
    groupCandidates.add(candidateKey);
    groupRows++;
    offset += Buffer.byteLength(line) + 1;
  }
  partial = partial || !content.endsWith("\n");
  // Recover only an interrupted final group; never hide interior corruption.
  if (active !== -1) {
    if (!partial && groupRows === 4 && groupCandidates.size === 4)
      completed.add(active);
    else truncateSync(out, groupStart);
  } else if (partial) truncateSync(out, 0);
}
const started = performance.now();
let done = 0;
for (let group = start; group < start + count; group++) {
  if (
    completed.has(group) ||
    (args.split &&
      (group % 10 === 0
        ? "test"
        : group % 10 === 1
          ? "validation"
          : "train") !== args.split)
  )
    continue;
  // Deterministic identity is a grouping key only; excluded from feature vector.
  const seed = Math.imul(group + 1, 2654435761) >>> 0,
    s = createTable("synthetic", 2, seed);
  const f: DecisionFrame = {
    id: 0,
    street: s.street,
    board: [],
    players: s.players,
    dealer: 0,
    currentBet: s.currentBet,
    minRaise: s.minRaise,
    pending: s.pending,
    lastActBet: s.lastActBet,
    action: "raise",
    amount: 25,
    eventCount: 0,
    policyVersion: 2,
    actions: [],
    reads: [],
  };
  const ranges = new Map([[1, inferredRange(s, f, 1)]]);
  const t = performance.now();
  const values = valueModel(
    f,
    ranges,
    (seed ^ 0x9e3779b9 ^ (samples === 640 ? 0x6a09e667 : 0)) >>> 0,
    { samples },
  );
  const teacherMs = performance.now() - t;
  const candidates: FastAssessmentCandidate[] = [
    { action: "fold" },
    { action: "call" },
    { action: "raise", amount: 20 },
    { action: "raise", amount: 25 },
  ];
  const rows = candidates.map((c) => {
    const key =
      c.action === "raise"
        ? c.amount === 25
          ? "raise"
          : "raise-20"
        : c.action;
    const comparisons = pairedActionComparisons(values, key);
    const lower = Math.max(...comparisons.map((v) => v.difference - v.margin));
    const upper = Math.max(...comparisons.map((v) => v.difference + v.margin));
    const label = lower > 10 ? 1 : upper <= 10 ? 0 : null;
    return {
      datasetVersion: 1,
      featureVersion: 1,
      source: "synthetic",
      group,
      split:
        group % 10 === 0 ? "test" : group % 10 === 1 ? "validation" : "train",
      samples,
      teacherVersion: "analysis7-paired-v1",
      teacherSeedScheme: samples === 640 ? "independent640-v1" : "pilot200-v1",
      teacherFlag: Number(lower > 0),
      features: buildPublicFeatures(publicAssessmentSnapshot(s), c),
      candidate: c,
      label,
      lower,
      upper,
      teacherMs: teacherMs / 4,
    };
  });
  // One group per append makes interruption/resumption group atomic on a normal exit.
  appendFileSync(out, rows.map((r) => JSON.stringify(r)).join("\n") + "\n");
  done++;
  if (done % 100 === 0)
    console.log(
      JSON.stringify({
        done,
        group,
        elapsedSeconds: Math.round((performance.now() - started) / 1000),
        out,
      }),
    );
}
console.log(
  JSON.stringify({
    complete: true,
    done,
    elapsedSeconds: (performance.now() - started) / 1000,
    out,
  }),
);
