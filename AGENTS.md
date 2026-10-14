# Instructions for coding agents

Read [START_HERE.md](START_HERE.md) before substantive work, then the current [PLAN.md](PLAN.md), [PROGRESS.md](PROGRESS.md), and relevant sections of [VERIFY.md](VERIFY.md). Follow the head-chef workflow described there; the full design is [docs/agent-workflow.md](docs/agent-workflow.md). `START_HERE.md` is the portable entrypoint for agents that do not discover `AGENTS.md` automatically.

## Project map

- `apps/web/`: React/Vite UI, accessibility, local API calls.
- `apps/api/src/`: Express routes, persistence, grading, solver/worker bridges.
- `apps/api/migrations/`: versioned SQLite migrations.
- `packages/poker/src/`: poker engine, public-information models, deterministic calculations.
- `packages/shared/src/`: Zod contracts and shared TypeScript types.
- `tests/`: Vitest unit/integration suites; `tests/browser/`: Playwright desktop/mobile flows.
- [README.md](README.md): install/run and feature scope. [Decision feedback](docs/decision-feedback.md) and [solver assessment](docs/gtopen-assessment.md): strategic and integration limits.

## Invariants

1. **Information privacy:** active-hand responses, odds, advice, ranges, bot inputs, and solver jobs use only permitted hole cards and visible public history. No opponent secrets, actual future runout, deal seed, later observations, or completed-hand hindsight may leak into current decisions. Exercise answers stay hidden until submission.
2. **Determinism and compatibility:** preserve seeded generation, replay behavior, policy versions, old saved-game reconstruction, and versioned migrations. Document an intentional change to these contracts and cover it with appropriate evidence.
3. **State correctness:** legal actions, raise reopening, side pots, uncalled returns, ties/odd chips, and chip conservation matter. Mutating API commands retain transaction safety, idempotency, and stale-revision rejection; calculation endpoints must not advance gameplay or rewrite game statistics.
4. **Honest teaching:** distinguish exact arithmetic under stated assumptions from sampled estimates, authored baselines, and conditional bot-model forecasts. Confidence intervals describe sampling error, not model accuracy. Do not relabel heuristic advice or chart agreement as proven optimal play or general poker skill.
5. **Local and accessible:** ordinary practice remains usable without accounts, network calls, paid services, or optional GTOpen. Preserve responsive layouts, keyboard operation, dialog dismissal/focus return, and clear loading/stale/error behavior.
6. **Provenance:** retain the imported PreflopR MIT notice and pinned provenance. GTOpen is optional external software with unresolved upstream licensing at the inspected revision; do not bundle/redistribute its source or binaries or call it MIT-licensed.

## Working rules

Inspect and preserve existing changes; never reset, clean, or overwrite unrelated work. Use bounded task tickets and exclusive file ownership. The lead alone updates the active plan/handoff and integrates; delegation to a documentation builder is allowed when ownership is explicitly transferred for that phase.

Spawn workers only for assigned tickets with an explicit role and scope. Retire them after recording their result and returning file ownership; do not keep unused or unassigned agents. Check the live roster before handoff. Close/delete completed workers when tools support it, stop unnecessary running work otherwise, and report deletion limitations honestly.

Use the scripts in `package.json` and commands in `VERIFY.md`. There is no `npm run lint` script; `npm run build` includes TypeScript checking. Historical README test counts are not evidence for the current tree. Do not run the broad write-format script merely to check a small change.

Commit or publish only within the user's authorized scope. Do not include `data/`, `dist/`, `node_modules/`, test artifacts, credentials, or the externally installed solver in publication. A request to upload the repo means its source/history and reproducible setup, not local learner data.
