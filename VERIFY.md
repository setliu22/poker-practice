# Verification playbook

Run from the repository root. Consult `package.json` and configs if these commands drift. Store actual outcomes in [PROGRESS.md](PROGRESS.md); this file describes procedures, not passes.

## Setup and state

```sh
node --version
npm --version
git status --short
git log -1 --oneline
npm ci
```

Node.js 24 or later is required. If Node is missing from `PATH`, check an already installed version manager or a bundled runtime under `~/.local/share/poker-practice/` and prepend its actual `bin` directory for the command; do not assume another machine has the same versioned path. `npm ci` needs network for initial dependencies; skip reinstalling a valid existing install. `npm run db:setup` initializes the default local DB idempotently for manual app use; do not clear the user's learner data for verification.

## Choose checks by change

| Change                                            | Checks and acceptance                                                                                                                                                                                                         |
| ------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Workflow/Markdown only                            | Read entrypoint as a fresh agent; follow every local link; verify commands against package/configs; `git diff --check`; check formatting on explicit doc paths if useful. No new application tests needed solely for prose.   |
| Poker engine, odds, policies, ranges              | Relevant Vitest suites, then `npm test` and `npm run build`. Check privacy, deterministic/replay compatibility, chip conservation, and independently specified outcomes appropriate to the changed behavior.                  |
| API, shared types, SQLite/worker bridge           | Relevant integration tests, `npm test`, `npm run build`; confirm validation, idempotency, persistence/revision behavior, and read-only calculations. Shared contracts must precede dependent UI work.                         |
| UI or integrated user flow                        | Relevant desktop/mobile browser cases, `npm run build`, and associated unit/integration checks; exercise keyboard/focus, loading/error/stale state, and narrow-screen bounds. Full browsers for broad UI/integration changes. |
| Full-tree delivery / GitHub upload requested here | `npm test`, `npm run build`, and `npm run test:browser`, documentation review, staged-content review, remote verification. Explicitly report optional live solver coverage.                                                   |

## Unit/integration and production build

```sh
npm test
npm run build
```

`npm test` runs `tests/**/*.test.ts` via Vitest, including API integration tests. `npm run build` runs `tsc --noEmit`, builds the Vite UI, and bundles the API plus assistant worker. There is no separate lint script. Target a relevant suite with `npx vitest run tests/<actual-file>.test.ts`; choose the actual path from `rg --files tests`.

## Desktop and mobile browser behavior

One-time browser setup:

```sh
npx playwright install chromium
```

On Linux, install required system dependencies using `npx playwright install --with-deps chromium` if necessary. Run:

```sh
npm run test:browser
```

Playwright config starts its own API on `127.0.0.1:3002` and Vite on `127.0.0.1:5174`, uses `data/browser-test.sqlite`, one worker, and both `desktop` and `mobile` projects. Those ports must be free; normal app ports 3001/5173 may remain running. Browser tests clear their test DB between cases. Do not launch multiple full browser runs concurrently against these shared ports/database.

For a scoped flow use an actual browser filename, for example:

```sh
npm run test:browser -- tests/browser/preflop.spec.ts
```

Failure traces/screenshots live under ignored `test-results/`. Inspect them when behavior/layout fails; a compilation pass is not visual or functional proof. Do not count a narrower rerun as a full-suite pass.

## Fast assessment and usage-data recovery

Normal app build/tests do not require Python, generation or retraining. Verify deployed inference and usage/backup contracts with:

```sh
npx vitest run tests/fast-assessment.test.ts tests/fast-assessment-api.test.ts tests/usage.test.ts tests/data-backup.test.ts
npm run test:browser -- tests/browser/fast-assessment.spec.ts
```

Check public-only features, stale/unsupported/uncertain responses, unchanged gameplay on inference, signed display acknowledgement, exact retries, atomic action/usage rollback, unknown assistance when telemetry is missing/late, resumed cursor exports, deletion and restored journal/identity. File-backed tests check WAL/FULL, committed-WAL backup, integrity/checksum, new destinations, stale-sidecar rejection and old-schema cursor preservation. Never use learner data for destructive verification.

For intentional offline model regeneration, use the [model card](packages/poker/models/README.md) with pinned Python/numpy/scikit-learn versions. Keep all synthetic rows in ignored `data/ml/` and retain frozen deal groups, versions, all candidate rows and provenance checks. Reevaluate and review a newly generated artifact/report before release. `npm run ml:benchmark` updates the aggregate report's timing measurements; pure inference excludes HTTP/SQLite and should not be claimed as total gameplay latency. The current model's decisive predictions are no-clear-gap only; fold and positive-gap detection abstain.

For a manual recovery drill with a copied/test source:

```sh
npm run data:backup -- --source /path/to/test.sqlite --output /path/to/new-backup.sqlite
npm run data:restore -- --source /path/to/new-backup.sqlite --output /path/to/new-restored.sqlite
POKER_DB=/path/to/new-restored.sqlite npm run dev
```

Both outputs must be new paths. Confirm latest events/receipts/usage and a fresh test action after restoring, plus installation identity, SQLite integrity and foreign keys. Browser backup downloads contain the full private SQLite database; public usage JSON exports do not contain private deals. Existing backups/exports are separate copies when testing deletion.

## Optional real GTOpen integration

Core tests use mocks/fixtures and do not prove an installed solver works. If the task changes the solver bridge and local installation is available, run:

```sh
TEST_GTOPEN=1 npx vitest run tests/solver-live.test.ts
```

Prerequisites: optional pinned GTOpen install built by `npm run solver:setup`, its isolated Rust setup, working loopback access, and the solver port available (default 3738). Initial installation needs network. `POKER_GTOPEN_HOME` selects another install location; `POKER_SOLVER_PORT` overrides its port. `POKER_SOLVER_DISABLED=1` disables solves. See [integration assessment](docs/gtopen-assessment.md) and the README for budget/unsupported-context limits. Report this check as **skipped/not run** when prerequisites are absent; it is not covered by a passing mock test. The external source/binaries must remain outside this repo because upstream licensing is unresolved.

## GitHub automated checks

[`.github/workflows/verify.yml`](.github/workflows/verify.yml) runs on pushes, pull requests, and manual dispatch. It uses Ubuntu with Node 24, installs locked dependencies, runs unit/integration tests and the production build, installs Chromium with Linux dependencies, and runs the full desktop/mobile browser suite. `POKER_SOLVER_DISABLED=1` keeps CI independent of the optional external solver; real-engine coverage is a separate local check. Failed browser artifacts are uploaded for inspection.

A committed workflow is not a CI pass. After upload, inspect the actual run and record its result or pending status in `PROGRESS.md`. Linux CI also provides another environment when a local browser runtime cannot launch.

CI runs unit/integration files with `npm test -- --maxWorkers=1` to keep exhaustive runout and simulation checks from competing for hosted CPU. The generation/diversity and exact-replay cases have explicit bounded computational budgets; their assertions and sample counts stay intact. This does not change API responsiveness assertions or add automatic retries.

## Functional smoke checklist

Use `npm run dev`, or `npm run build` then `npm start` for built assets. Use dedicated temporary test data for destructive flows.

- Learn/exercise feedback: submit, reveal feedback only afterward, check keyboard operation and saved progress.
- Online cash Decision Lab: default nine seats; select eight/two; distinguish table seats from active opponents and exclude two-seat multiway practice. Check public history pot/stack accounting, supplied-range/rake assumptions, action/reason/estimate/confidence submission, tracked hints, immutable first answers, staged guided follow-ups, fresh review, reload, error retry, export and clear. Independent, assisted and guided counts must stay separate.
- Bot table: start a supported table, make legal actions, hide private cards until completion, finish/resume/replay without losing the original game's data.
- Study tools: inspect odds/assistant/chart, then act or switch hands; results are public-only and stale results clear. Loading/error/retry and Escape/focus return work.
- Narrow screens: controls/cards/dialogs remain usable without horizontal overflow; bot-model assumptions and unsupported solver contexts remain explicit.
- Ordinary practice works with the optional solver absent and no external requests after installation.

These are acceptance prompts; record what was actually exercised. Existing automated tests can supply this evidence without repeating every manual action.

## Documentation and publication

```sh
git diff --check
git diff --cached --stat
git diff --cached --check
git status --short
```

Check explicit new docs as well: untracked files are not included in `git diff --check`. Confirm every relative file link exists, Markdown/code fences render sensibly, tickets have owners/dependencies/acceptance, and a fresh reader can find the next action without conversation history.

Before requested publication, inspect exactly what is staged and confirm no local DBs, secrets, dependencies, build/test outputs, or external solver sources/binaries are included. After pushing, check the intended GitHub repository/visibility, `git remote -v`, and compare `git rev-parse HEAD` with `git ls-remote origin refs/heads/<actual-branch>`. Authentication errors leave publication pending, never “uploaded.”

## Evidence format

```text
Date / runner or reviewer:
Tested state: commit SHA + dirty-tree scope (or tree fingerprint)
Command or inspected behavior:
Result: pass / fail / skipped; counts and scope
Artifacts / findings:
Limits and next action:
```

Tests must be rerun when relevant code changes invalidate the evidence. Documentation-only handoff updates do not invalidate an otherwise unchanged application check; explain that scope rather than claiming an untested exact commit.
