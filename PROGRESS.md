# Current handoff

Updated: 2026-10-13. Objective: install and use the head-chef workflow, verify/preserve current app work, then upload this repo to GitHub. Documentation ownership has returned to the lead.

## Repository state at task start

- Branch: `master`; last committed baseline: `50ceb46`.
- Extensive modified/untracked application and test files already existed. They are user work to preserve and separately checkpoint, not changes introduced by this documentation task.
- No remote was configured at initial inspection. The GitHub connector authenticates as `setliu22`, but target `poker-practice` returned 404. CLI credentials/transport are unavailable in this environment; local DNS resolution also failed. The lead asked the user to create an empty private repo so the connector can upload. Publication remains pending; private visibility is the default.

Current state: public upload succeeded through the user's authenticated terminal. `main` tracks `origin/main` at `35334678dde40a4f6ce0e94e9454359f05110200`, tree `d297384d863bb6f1ae5f49e34b308c0c5a8f0626`. All 15 commits, including the original root, were preserved. Independent publication audit matched all 146 files by path/mode/blob SHA; workflow, licensed chart assets, and CI are present, and runtime data/builds/dependencies are excluded.

First [GitHub CI run](https://github.com/setliu22/poker-practice/actions/runs/38503782345) passed units/build, then exercised browsers: **104 passed, four failed**. Two stale test flows fail on both desktop and mobile: `learning.spec.ts` expects older lesson progress immediately after reload although the default is now the walkthrough; `preflop-walkthrough.spec.ts` matches both a sidebar step and the primary action. Builder `browser_fix_builder` repaired only those two tests: reopen earlier lessons after reload and assert exact saved totals; use exact accessible button name. `workflow_reviewer` independently accepted the repair with no findings. No production code changes, test skips, retries, sleeps, or weakened assertions. Lead owns this handoff/plan. Repair plus this evidence are being committed for CI recheck.

## Completed and decisions

- Inspected README, package scripts, Vitest/Playwright configuration, and documented poker/solver constraints.
- Selected one portable entrypoint, `START_HERE.md`, with `AGENTS.md` discovery, `PLAN.md` active queue, this handoff, `VERIFY.md` commands, and `docs/agent-workflow.md` design.
- Delegated documentation to `workflow_builder` with exclusive file ownership. Independent `workflow_reviewer` and `functional_verifier` used fresh task contexts and completed review. The builder returned plan/progress ownership to the lead. No application runtime SDK or tool-enforced delegation restriction is claimed.
- Keep workflow docs concise/current; record results against the actual tested tree. Historical README counts are not current proof. Single-agent environments must label their review as self-review.
- Created the portable workflow docs and linked them from README. Labeled its earlier delivery test counts as historical snapshots.
- Lead corrected `.gitignore` from `data/` to `/data/`: the broad rule also excluded required `packages/poker/data/preflop/` source JSON, MIT license, and provenance. Source assets are included in `6546c94`; local root learner databases remain ignored. Staged-content inspection covered 139 source files and found no forbidden artifacts or credential-pattern matches.
- Added `.github/workflows/verify.yml`: Node 24 on Ubuntu, lockfile installation, unit/integration tests, production build, desktop/mobile Chromium, and retained failure artifacts. Optional external solver disabled in CI. Workflow was independently reviewed; remote execution remains pending.

## Verification evidence

- **2026-10-13, lead:** `npm test` passed **293 tests; 2 optional tests skipped**, across 31 passed files and one skipped file. Tested the dirty application tree based on `50ceb46`; workflow docs introduce no application code changes.
- **2026-10-13, lead:** `npm run build` passed TypeScript, Vite, API, and assistant-worker builds on that dirty application tree.
- **2026-10-13, lead:** `npm run test:browser` attempted **108 desktop/mobile cases**, but Chromium failed during launch with macOS `bootstrap_check_in` / `MachPortRendezvousServer` error 141 and SIGTRAP. **No behavioral assertions executed; browser verification is blocked by the environment**, not demonstrated as passing or as an application regression.
- Node 24 was available as a bundled runtime under `~/.local/share/poker-practice/` and was prepended to command `PATH`; system `PATH` initially lacked Node.
- **2026-10-13, lead:** `TEST_GTOPEN=1 npx vitest run tests/solver-live.test.ts` passed **2/2 real-engine tests** in 4.37 seconds against the locally installed optional solver; log: `/tmp/poker-practice-agent-solver.log`. This does not establish browser behavior.
- **2026-10-13, workflow_reviewer:** independent review of the workflow, invariants, ownership/dependencies, CI and ignore fix passed with no blocking/material findings. This was a workflow review, not an exhaustive review of all earlier application changes.
- **2026-10-13, functional_verifier:** all 296 relative source imports resolved, package manifest/lockfile matched, 31 local links across seven workflow/README files resolved, and Markdown fences/whitespace checks passed. Required chart assets are publishable; runtime data/builds/dependencies remain excluded. Independently inspected test logs and CI commands. No blocking findings. Minor existing `setup.ts` message still says migrations 001–002 despite eight migrations; unchanged outside scope.
- **2026-10-13, lead:** `npx prettier --check .github/workflows/verify.yml` passed. Application files in checkpoint `6546c94` are unchanged from the tested tree; docs/CI and ignore adjustments do not change application execution.
- **2026-10-13, documentation builder:** checked all six new Markdown files, 19 relative file links, code-fence balance and trailing whitespace: passed. `git diff --check` passed. Prettier initially reported three new docs, which were formatted with explicit paths; final seven-file Markdown format check passed. These checks cover documentation mechanics, not independent review or browser behavior.

- **2026-10-13, functional_verifier:** independently verified GitHub publication at `3533467`: all 146 files matched local paths/modes/blob SHAs, and all 15 commits matched through original root `9f57226`. No source omissions, generated artifacts, or history loss.
- **2026-10-13, GitHub CI run 38503782345:** Node 24 Linux installation, unit/integration tests, production build, and browser setup passed. Actual browser run: 104 passed and four failed (two stale flows, each on desktop/mobile). Failure evidence retained in the Actions run; this result is superseded only after a passing repair run.
- **2026-10-13, browser_fix_builder:** targeted Prettier, `git diff --check`, and production build passed with the two browser-spec repairs atop `3533467`. Browser execution still requires Linux CI.
- **2026-10-13, workflow_reviewer:** independent repair review passed; persisted-score coverage is strengthened, button specificity matches the UI, and no assertions were removed/skipped.

Record each result here with: date, command/check, pass/fail/skip, counts or relevant behavior, runner/reviewer, tested commit plus dirty-tree scope, and artifact path where useful. Do not attach a clean-commit claim to tests run on a different dirty tree.

## Next concrete actions

1. Publish the reviewed browser-test repair and this handoff through the user's authenticated terminal (`git push` from this repo; upstream is configured).
2. Inspect the new GitHub CI run and ensure all desktop/mobile cases pass. Keep initial failure evidence and final checked commit distinct.
3. Record final publication/CI evidence, then publish the final handoff if it creates a new commit. No additional publication approval is needed; credential availability is the only write dependency.

## Blockers and gaps

Public source and complete history are uploaded. The four initial browser CI failures have a reviewed repair; remote execution of that repair is pending. This session cannot authenticate writes through GitHub connector or Git credential helper, so publishing new commits requires the user's authenticated terminal. Local Chromium still cannot launch due macOS environment restrictions; remote CI provides actual browser evidence.
