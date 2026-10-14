import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import { GTOPEN_REVISION } from "../packages/poker/src/solver-spot";
const base = join(homedir(), ".local/share/poker-practice"),
  home = process.env.POKER_GTOPEN_HOME ?? join(base, "gtopen");
const env = {
  ...process.env,
  CARGO_HOME: join(base, "rust/cargo"),
  RUSTUP_HOME: join(base, "rust/rustup"),
};
function run(command: string, args: string[], cwd?: string) {
  execFileSync(command, args, { cwd, env, stdio: "inherit" });
}
mkdirSync(base, { recursive: true });
if (!existsSync(join(home, ".git")))
  run("git", [
    "clone",
    "--depth",
    "1",
    "--filter=blob:none",
    "--sparse",
    "https://github.com/MatthewPDingle/GTOpen.git",
    home,
  ]);
const current = execFileSync("git", ["rev-parse", "HEAD"], {
  cwd: home,
  encoding: "utf8",
}).trim();
if (current !== GTOPEN_REVISION) {
  run("git", ["fetch", "--depth", "1", "origin", GTOPEN_REVISION], home);
  run("git", ["checkout", "--detach", GTOPEN_REVISION], home);
}
run(
  "git",
  [
    "sparse-checkout",
    "set",
    "crates",
    "web",
    "cache/contextual",
    "research/ignition-reraise",
    "research/preflop-evolution/behavior/pass3",
  ],
  home,
);
mkdirSync(join(home, "cache"), { recursive: true });
writeFileSync(
  join(home, "cache/preflop_eq169.bin"),
  execFileSync("git", ["show", `${GTOPEN_REVISION}:cache/preflop_eq169.bin`], {
    cwd: home,
    maxBuffer: 2 * 1024 * 1024,
  }),
);
const cargo = join(env.CARGO_HOME, "bin/cargo");
if (!existsSync(cargo)) {
  const installer = join(base, "rustup.sh");
  run("curl", ["-fsSL", "https://sh.rustup.rs", "-o", installer]);
  run("sh", [installer, "-y", "--profile", "minimal", "--no-modify-path"]);
}
run(cargo, ["build", "--release", "--locked", "-p", "server"], home);
run(cargo, ["test", "--release", "--locked", "-p", "solver", "--lib"], home);
console.log(
  `Installed GTOpen ${GTOPEN_REVISION} at ${home}. Poker Practice starts it locally on demand (port 3738). No hosted service or API key is used.`,
);
console.log(
  "Upstream currently has no explicit license file or Cargo license declaration; its code/binary is installed separately and is not redistributed in Poker Practice.",
);
