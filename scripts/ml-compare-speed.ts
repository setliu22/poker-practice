/** Matched wall-clock comparison. Generates synthetic states in a temporary DB;
 * never reads learner data or writes usage facts. Default compiles the exact
 * current API/worker code to temporary JS, matching npm run build/start workers.
 */
import { createServer } from "node:http";
import {
  mkdtempSync,
  readFileSync,
  writeFileSync,
  mkdirSync,
  rmSync,
} from "node:fs";
import { tmpdir, cpus, platform, arch } from "node:os";
import { resolve, dirname, join } from "node:path";
import { execFileSync, spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { createApp } from "../apps/api/src/app";
import { openDatabase } from "../apps/api/src/database";
import { recordTransition } from "../apps/api/src/table-journal";
import { createTable, type TableState } from "../packages/poker/src/table";
import { fastAssessment } from "../packages/poker/src/fast-assessment";
import {
  assistantAnalysis,
  assistantSnapshot,
} from "../packages/poker/src/decision-assistant";

const args = Object.fromEntries(
  process.argv.slice(2).map((value) => value.replace(/^--/, "").split("=")),
);
const count = Number(args.count ?? 40),
  warmups = Number(args.warmups ?? 5),
  start = Number(args.start ?? 3_000_000);
const output = resolve(
  args.out ?? "packages/poker/models/fast-assessment-speed-comparison.json",
);
if (
  !Number.isSafeInteger(count) ||
  count < 10 ||
  count > 200 ||
  !Number.isSafeInteger(warmups) ||
  warmups < 1 ||
  warmups > 20 ||
  !Number.isSafeInteger(start) ||
  start < 5000 ||
  start + count + warmups >= 0xffffffff
)
  throw Error("Use count10..200, warmups1..20, start>=5000 within32bit range.");
const hash = (value: string) =>
  createHash("sha256").update(value).digest("hex");
if (!args.compiled && !args.sourceWorkers) {
  const directory = mkdtempSync(join(tmpdir(), "poker-speed-build-"));
  try {
    const esbuild = resolve("node_modules/.bin/esbuild"),
      runner = join(directory, "runner.js");
    execFileSync(
      esbuild,
      [
        "scripts/ml-compare-speed.ts",
        "--bundle",
        "--platform=node",
        "--format=esm",
        "--packages=external",
        `--outfile=${runner}`,
      ],
      { stdio: "pipe" },
    );
    execFileSync(
      esbuild,
      [
        "apps/api/src/assistant-worker.ts",
        "--bundle",
        "--platform=node",
        "--format=esm",
        "--packages=external",
        `--outfile=${join(directory, "assistant-worker.js")}`,
      ],
      { stdio: "pipe" },
    );
    // External packages resolve from the project; symlinking only node_modules is
    // temporary and prevents copying dependencies or learner data into artifacts.
    const { symlinkSync } = await import("node:fs");
    symlinkSync(
      resolve("node_modules"),
      join(directory, "node_modules"),
      "dir",
    );
    const run = spawnSync(
      process.execPath,
      [runner, ...process.argv.slice(2), "--compiled=true"],
      { stdio: "inherit", env: { ...process.env, POKER_SOLVER_DISABLED: "1" } },
    );
    if (run.error) throw run.error;
    if (run.status !== 0) throw Error(`Benchmark runner exited${run.status}`);
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
} else {
  const directory = mkdtempSync(join(tmpdir(), "poker-speed-db-")),
    db = openDatabase(join(directory, "synthetic.sqlite"));
  let server: ReturnType<typeof createServer> | undefined;
  const artifactPath = resolve("packages/poker/models/fast-assessment-v1.json"),
    modelHash = hash(readFileSync(artifactPath, "utf8"));
  const allRows = () =>
    db
      .prepare(
        "SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' ORDER BY name",
      )
      .all()
      .map((row) => {
        const { name } = row as { name: string };
        return [
          name,
          db.prepare(`SELECT * FROM "${name}" ORDER BY rowid`).all(),
        ];
      });
  try {
    const states: TableState[] = [];
    for (let i = 0; i < count + warmups + 1; i++) {
      const group = start + i,
        seed = Math.imul(group + 1, 2654435761) >>> 0;
      const s = createTable(`synthetic-speed-${group}`, 2, seed);
      db.transaction(() => {
        db.prepare("INSERT INTO bot_tables VALUES(?,?)").run(
          s.id,
          JSON.stringify(s),
        );
        recordTransition(db, s, undefined, "created");
      })();
      states.push(s);
    }
    server = createServer(createApp(db));
    await new Promise<void>((resolve, reject) => {
      server!.once("error", reject);
      server!.listen(0, "127.0.0.1", resolve);
    });
    const address = server.address();
    if (!address || typeof address === "string")
      throw Error("Missing loopback address");
    const base = `http://127.0.0.1:${address.port}`,
      snapshot = JSON.stringify(allRows());
    async function request(s: TableState, kind: "quick" | "normal") {
      const began = performance.now();
      const result = await fetch(
        `${base}${kind === "quick" ? `/api/v1/tables/${s.id}/fast-assessment` : `/api/tables/${s.id}/assistant`}`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            revision: s.revision,
            action: "call",
            ...(kind === "normal"
              ? { layer: "advice", continuation: "theo" }
              : {}),
          }),
          signal: AbortSignal.timeout(60000),
        },
      );
      const data = await result.json();
      const ms = performance.now() - began;
      if (!result.ok) throw Error(`${kind}:HTTP${result.status}:${data.error}`);
      if (
        kind === "normal" &&
        (data.samples !== 1600 || !data.recommendation || !data.values?.length)
      )
        throw Error("Normal path did not run full1600-world advice");
      if (
        kind === "quick" &&
        (data.status === "unsupported" || data.probability === null)
      )
        throw Error("Unsupported quick benchmark context");
      return {
        ms,
        status: kind === "quick" ? data.status : "detailed",
        samples: kind === "normal" ? data.samples : 0,
      };
    }
    const cold = {
      quick: await request(states[0], "quick"),
      normal: await request(states[0], "normal"),
    };
    for (let i = 0; i < warmups; i++) {
      const s = states[i + 1];
      if (i % 2) {
        await request(s, "normal");
        await request(s, "quick");
      } else {
        await request(s, "quick");
        await request(s, "normal");
      }
    }
    const rows: {
      group: number;
      order: string;
      quickMs: number;
      normalMs: number;
      quickStatus: string;
    }[] = [];
    for (let i = 0; i < count; i++) {
      const s = states[i + warmups + 1],
        first = i % 2 ? "normal" : "quick",
        second = first === "quick" ? "normal" : "quick";
      const a = await request(s, first),
        b = await request(s, second),
        quick = first === "quick" ? a : b,
        normal = first === "normal" ? a : b;
      rows.push({
        group: start + i + warmups + 1,
        order: `${first}-then-${second}`,
        quickMs: quick.ms,
        normalMs: normal.ms,
        quickStatus: quick.status,
      });
      if ((i + 1) % 10 === 0)
        console.log(JSON.stringify({ completed: i + 1, total: count }));
    }
    if (JSON.stringify(allRows()) !== snapshot)
      throw Error("Read-only speed comparison changed database rows");
    const quantile = (values: number[], q: number) => {
      const sorted = [...values].sort((a, b) => a - b);
      const index = (sorted.length - 1) * q,
        low = Math.floor(index);
      return (
        sorted[low] + (sorted[Math.ceil(index)] - sorted[low]) * (index - low)
      );
    };
    const summarize = (values: number[]) => ({
      count: values.length,
      medianMs: quantile(values, 0.5),
      p95Ms: quantile(values, 0.95),
      minMs: Math.min(...values),
      maxMs: Math.max(...values),
      totalMs: values.reduce((a, b) => a + b, 0),
    });
    // Supplementary same-process function boundary, without HTTP, journal reads,
    // HMAC receipts or worker startup. Normal retains the real1600-world algorithm.
    const functions: { group: number; quickMs: number; normalMs: number }[] =
      [];
    const inProcessCount = Math.min(count, 20);
    for (let i = 0; i < warmups; i++) {
      const s = states[i + 1];
      fastAssessment(s, { action: "call" });
      await assistantAnalysis(assistantSnapshot(s), {
        revision: 0,
        layer: "advice",
        action: "call",
        continuation: "theo",
      });
    }
    for (let i = 0; i < inProcessCount; i++) {
      const s = states[i + warmups + 1];
      let quickMs = 0,
        normalMs = 0;
      const quick = () => {
        const t = performance.now();
        fastAssessment(s, { action: "call" });
        quickMs = performance.now() - t;
      };
      const normal = async () => {
        const t = performance.now();
        await assistantAnalysis(assistantSnapshot(s), {
          revision: 0,
          layer: "advice",
          action: "call",
          continuation: "theo",
        });
        normalMs = performance.now() - t;
      };
      if (i % 2) {
        await normal();
        quick();
      } else {
        quick();
        await normal();
      }
      functions.push({ group: start + i + warmups + 1, quickMs, normalMs });
    }
    const httpQuick = summarize(rows.map((r) => r.quickMs)),
      httpNormal = summarize(rows.map((r) => r.normalMs)),
      functionQuick = summarize(functions.map((r) => r.quickMs)),
      functionNormal = summarize(functions.map((r) => r.normalMs));
    const rawPath = resolve(args.raw ?? "data/ml/speed-paired.json");
    mkdirSync(dirname(rawPath), { recursive: true });
    writeFileSync(
      rawPath,
      JSON.stringify({ source: "synthetic-only", rows, functions }, null, 2) +
        "\n",
    );
    const codePaths = [
      "scripts/ml-compare-speed.ts",
      "apps/api/src/app.ts",
      "apps/api/src/table-routes.ts",
      "apps/api/src/table-journal.ts",
      "apps/api/src/assistant-jobs.ts",
      "apps/api/src/assistant-worker.ts",
      "packages/poker/src/decision-assistant.ts",
      "packages/poker/src/table-review.ts",
      "packages/poker/src/fast-assessment.ts",
      "packages/poker/src/fast-assessment-features.ts",
    ];
    const report = {
      version: 1,
      codeSha256: Object.fromEntries(
        codePaths.map((path) => [path, hash(readFileSync(path, "utf8"))]),
      ),
      createdAt: new Date().toISOString(),
      modelId: "opening-mara-et-v1",
      modelSha256: modelHash,
      source: "synthetic only; temporary database; no usage records",
      protocol: {
        groups: { start, count, warmups },
        scope:
          "Same fresh initial heads-up100BB button/Mara decisions and proposed call action for both methods; excludes state setup and process/server startup",
        quick:
          "Production fast endpoint including journal read, validation, trained inference and signed receipt",
        normal:
          "Actual Show move hint assistant endpoint:1600 worlds, opponent responses, all tested action EVs, paired comparisons, recommendation, fresh built worker on every request",
        order:
          "Alternating quick/normal request order per distinct deal, sequential, no concurrent requests, no response cache",
        runtime: args.sourceWorkers
          ? "source TS workers via tsx"
          : "production JS bundles built from current source",
        firstRequests: "Reported separately; not included in warmed summaries",
        inProcess: `Separate actual algorithm function boundaries after${warmups} dedicated warmup pairs on same first20 paired decisions; excludes HTTP/DB/HMAC/worker overhead`,
      },
      environment: {
        node: process.version,
        platform: platform(),
        arch: arch(),
        cpu: cpus()[0]?.model,
        logicalCpus: cpus().length,
      },
      coldHttpMs: { quick: cold.quick.ms, normal: cold.normal.ms },
      http: {
        quick: httpQuick,
        normal: httpNormal,
        ratioOfMedians: httpNormal.medianMs / httpQuick.medianMs,
        medianPairedSpeedup: quantile(
          rows.map((r) => r.normalMs / r.quickMs),
          0.5,
        ),
        p95LatencyRatio: httpNormal.p95Ms / httpQuick.p95Ms,
        readyCount: rows.filter((r) => r.quickStatus === "ready").length,
        uncertainCount: rows.filter((r) => r.quickStatus === "uncertain")
          .length,
      },
      inProcess: {
        quick: functionQuick,
        normal: functionNormal,
        ratioOfMedians: functionNormal.medianMs / functionQuick.medianMs,
      },
      rawSha256: hash(readFileSync(rawPath, "utf8")),
      limitations: [
        "Timing compares response latency, not equivalent output quality: quick may abstain and only screens for no clear gap; normal returns detailed sampled values and recommendations.",
        "Warmed local repeated benchmark; hardware/load dependent. Process boot and browser rendering excluded.",
        "No total game throughput or full action-submission speedup is claimed.",
        "The normal endpoint runs1600 sampled worlds; the separate mistake experiment teacher uses640.",
      ],
    };
    if (hash(readFileSync(artifactPath, "utf8")) !== modelHash)
      throw Error("Frozen model changed during benchmark");
    mkdirSync(dirname(output), { recursive: true });
    writeFileSync(output, JSON.stringify(report, null, 2) + "\n");
    console.log(JSON.stringify(report, null, 2));
  } finally {
    if (server)
      await new Promise<void>((resolve, reject) =>
        server!.close((error) => (error ? reject(error) : resolve())),
      );
    db.close();
    rmSync(directory, { recursive: true, force: true });
  }
}
