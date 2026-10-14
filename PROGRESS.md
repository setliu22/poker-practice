# Current handoff

Updated: 2026-10-13. Objective: install and use the head-chef workflow, verify/preserve current app work, then upload this repo to GitHub. Documentation ownership has returned to the lead.

## Repository state at task start

- Branch: `master`; last committed baseline: `50ceb46`.
- Extensive modified/untracked application and test files already existed. They are user work to preserve and separately checkpoint, not changes introduced by this documentation task.
- No remote was configured at initial inspection. The GitHub connector authenticates as `setliu22`, but target `poker-practice` returned 404. CLI credentials/transport are unavailable in this environment; local DNS resolution also failed. The lead asked the user to create an empty private repo so the connector can upload. Publication remains pending; private visibility is the default.

Current state: app changes and required chart assets checkpointed in `6546c94`, then reviewed workflow docs, README clarification and GitHub CI committed in `431c115`, on `master`. A subsequent documentation-only commit records this handoff; use `git log -1` for its exact SHA. The working tree is intended to be clean after that commit. The user has created [setliu22/poker-practice](https://github.com/setliu22/poker-practice). Connector verified admin/push access and **public** visibility; the user explicitly approved public upload. Publication is in progress. No content has been uploaded yet; no remote configured yet.

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

Record each result here with: date, command/check, pass/fail/skip, counts or relevant behavior, runner/reviewer, tested commit plus dirty-tree scope, and artifact path where useful. Do not attach a clean-commit claim to tests run on a different dirty tree.

## Next concrete actions

1. Public visibility is explicitly authorized by the user. Upload the committed source snapshot and verify the remote tree.
2. Verify visibility and upload through the authenticated GitHub connector. Regenerate the source snapshot from final local HEAD (earlier temporary export predates this handoff). The CLI cannot retrieve the terminal's keychain credential; the existing SSH identity is passphrase-protected and its agent unavailable. A connector source-snapshot upload is feasible but cannot transfer original Git commit history; preserve original local history and disclose that limitation.
3. Verify remote source tree against local content, record remote URL/commit and publication method, and add remote configuration. Do not imply local `master` and connector-created remote `main` have identical ancestry.
4. Check GitHub CI after publication; if executable there, address real failures. Local browser launch remains an environmental gap.

## Blockers and gaps

Public visibility is authorized. The authenticated connector will publish the source snapshot; original Git commit history stays local. Browser behavior is unverified because Chromium cannot launch here. Neither condition blocks documentation, unit/build checks, review, or local commits. Do not mark upload complete until the remote is verified; do not represent browser launch errors as exercised application tests. No reviewer or test result should be inferred from a plan checkbox.
