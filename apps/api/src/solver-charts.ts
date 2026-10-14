import { createHash } from "node:crypto";
import { existsSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import { spawn, execFileSync } from "node:child_process";
import type Database from "better-sqlite3";
import {
  solverSpot,
  actionIndex,
  chartFromNode,
  nodeSchema,
  GTOPEN_REVISION,
} from "../../../packages/poker/src/solver-spot";
import type { TableState } from "../../../packages/poker/src/table";
import type { SolverChart } from "../../../packages/shared/src/solver-chart";
const port = Number(
  process.env.POKER_SOLVER_PORT ?? Number(process.env.PORT ?? 3001) + 737,
);
if (!Number.isInteger(port) || port < 1024 || port > 65535)
  throw new Error("Choose a valid local solver port.");
const url = `http://127.0.0.1:${port}/api/preflop`;
let queue = Promise.resolve();
let pending = 0;
let starting: Promise<void> | undefined;
const pause = (ms: number) => new Promise((r) => setTimeout(r, ms));
async function ensureEngine() {
  if (process.env.POKER_SOLVER_DISABLED === "1")
    throw new Error("Local solver is disabled in this environment.");
  if (starting) return starting;
  starting = (async () => {
    const home =
      process.env.POKER_GTOPEN_HOME ??
      join(homedir(), ".local/share/poker-practice/gtopen");
    if (!existsSync(join(home, "target/release/gto-server")))
      throw new Error(
        "GTOpen is not installed. Run npm run solver:setup once; normal practice stays offline.",
      );
    const revision = execFileSync("git", ["rev-parse", "HEAD"], {
      cwd: home,
      encoding: "utf8",
    }).trim();
    if (revision !== GTOPEN_REVISION)
      throw new Error(
        "GTOpen revision does not match the verified adapter. Run npm run solver:setup.",
      );
    try {
      const r = await fetch(`${url}/status`, {
        signal: AbortSignal.timeout(700),
      });
      if (r.ok) return;
    } catch {}
    const child = spawn(join(home, "target/release/gto-server"), [], {
      cwd: home,
      env: {
        ...process.env,
        PORT: String(port),
        SOLVER_GPU: "0",
        SOLVER_THREADS: "4",
        PREFLOP_MAX_NODES: "50000",
        PREFLOP_MAX_ARENA_MB: "384",
      },
      stdio: "ignore",
      detached: true,
    });
    child.on("error", () => {});
    child.unref();
    for (let i = 0; i < 30; i++) {
      try {
        const r = await fetch(`${url}/status`, {
          signal: AbortSignal.timeout(500),
        });
        if (r.ok) return;
      } catch {}
      await pause(200);
    }
    throw new Error("GTOpen did not start on the local solver port.");
  })();
  try {
    await starting;
  } catch (e) {
    starting = undefined;
    throw e;
  }
}
async function rpc(path: string, body?: unknown, timeout = 30000) {
  const r = await fetch(`${url}/${path}`, {
    method: body === undefined ? "GET" : "POST",
    headers: { "Content-Type": "application/json" },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    signal: AbortSignal.timeout(timeout),
  });
  if (!r.ok) throw new Error((await r.text()).slice(0, 300));
  return r.json();
}
export function solverCharts(db: Database.Database) {
  const jobs = new Map<string, SolverChart>();
  const request = (state: TableState, retry = false): SolverChart => {
    const base: SolverChart = {
      status: "queued",
      source: "GTOpen",
      engineRevision: GTOPEN_REVISION,
      revision: state.revision,
      message: "Waiting for the local solver.",
    };
    let spot: ReturnType<typeof solverSpot>;
    try {
      spot = solverSpot(state);
    } catch (e) {
      return { ...base, status: "unavailable", message: (e as Error).message };
    }
    const key = createHash("sha256")
      .update(
        JSON.stringify({
          version: 1,
          engine: GTOPEN_REVISION,
          config: spot.config,
          history: spot.history,
          hero: spot.hero,
        }),
      )
      .digest("hex");
    const cached = db
      .prepare("SELECT data FROM solver_charts WHERE key=?")
      .get(key) as { data: string } | undefined;
    if (cached) return { ...JSON.parse(cached.data), revision: state.revision };
    const existing = jobs.get(key);
    if (existing && (!retry || existing.status !== "unavailable"))
      return { ...existing, revision: state.revision };
    if (existing) jobs.delete(key);
    if (pending >= 3)
      return {
        ...base,
        status: "unavailable",
        message:
          "Three charts are already queued. Try again after a solve finishes.",
      };
    jobs.set(key, base);
    pending++;
    queue = queue.then(async () => {
      try {
        await ensureEngine();
        jobs.set(key, {
          ...base,
          status: "building",
          message: "Checking the exact table and betting tree.",
        });
        const estimate = await rpc("estimate", spot.config);
        if (!estimate.ok)
          throw new Error(
            `This ${spot.config.positions.length}-seat tree exceeds the local memory/work limit (${Math.round(estimate.arena_mb)} MB estimated). No smaller-table chart was substituted. The bot-model suggestion remains available.`,
          );
        await rpc("spot", spot.config, 90000);
        jobs.set(key, {
          ...base,
          status: "solving",
          message: "Computing action frequencies for this betting sequence.",
        });
        await rpc("solve", {
          iterations: 1000,
          check_every: 25,
          target_gap: 0.05,
        });
        const deadline = Date.now() + 120000;
        let status: any;
        do {
          await pause(500);
          status = await rpc("status");
          jobs.set(key, {
            ...base,
            status: "solving",
            message:
              "Solving locally; you can close this panel and keep playing.",
            iteration: status.published_iteration,
            gap: status.gap_total,
          });
          if (status.error) throw new Error(status.error);
        } while (status.state === "running" && Date.now() < deadline);
        if (status.state === "running") {
          await rpc("stop");
          status = await rpc("status");
        }
        let path: number[] = [],
          node = nodeSchema.parse(await rpc("node", { path })),
          bet = 10;
        for (const a of spot.history) {
          if (node.actor !== spot.seats.indexOf(a.seat))
            throw new Error(
              "Solver action order does not match the public hand history.",
            );
          path.push(actionIndex(node, a, bet));
          if (a.action === "raise") bet = a.amount!;
          node = nodeSchema.parse(await rpc("node", { path }));
        }
        const session = await rpc("session");
        if (
          Object.entries(spot.config).some(
            ([key, value]) =>
              JSON.stringify(session.config?.[key]) !== JSON.stringify(value),
          ) ||
          session.hero !== null ||
          session.seats?.some(
            (seat: any) => seat.frozen || seat.profile !== null,
          )
        )
          throw new Error(
            "The local solver session changed. No chart from another configuration was returned.",
          );
        const chart = chartFromNode(spot, node, path, state.revision);
        db.prepare("INSERT OR REPLACE INTO solver_charts VALUES(?,?)").run(
          key,
          JSON.stringify(chart),
        );
        db.prepare(
          "DELETE FROM solver_charts WHERE rowid NOT IN (SELECT rowid FROM solver_charts ORDER BY rowid DESC LIMIT 64)",
        ).run();
        jobs.set(key, chart);
      } catch (e) {
        jobs.set(key, {
          ...base,
          status: "unavailable",
          message: `Local chart unavailable: ${(e as Error).message}`,
        });
      } finally {
        pending--;
        if (jobs.size > 64) {
          const old = jobs.keys().next().value;
          if (old) jobs.delete(old);
        }
      }
    });
    return base;
  };
  return request;
}
