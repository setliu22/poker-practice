# Current handoff

Updated: 2026-10-14 UTC. Owner: lead. Objective: improve online no-limit Hold’em cash practice, including full-ring tables. Implementation and independent review are complete; Linux browser CI and publication verification remain.

## Actual state

- Branch `feat/online-cash-training`, based on `2791d73882af006ceb92d0425407f7cea53d270b`. Feature source/tests/docs are ready for a checkpoint commit.
- Public GitHub: https://github.com/setliu22/poker-practice. Main confirmed at `2791d73` before this feature. Connector write access works; native CLI credentials/DNS are unavailable in this session. Use authenticated GitHub Git-data tools, preserve local checkpoints, compare trees before tracking a connector-created commit.
- Node: `~/.local/share/poker-practice/node-v24.21.0-darwin-arm64/bin`; dependencies installed. Chromium launch remains blocked by macOS Mach-port error 141/SIGTRAP before app execution. Linux CI is required for browser evidence.
- Previous workflow/publication task completed. Bot saved data, legacy exercises/replays, imported MIT preflop data, and optional external GTOpen preserved. No runtime dependencies added; solver code unchanged.

## Delivered implementation

- Learn prominently links to **Online cash Decision Lab**. Select 2–9 seats, default nine; table seats and active players separate. Four river skills: bluff catching, value betting, pure bluffing and closing multiway calls (three or more seats).
- Exact weighted conditional EV, joint card-collision conditioning, split-pot shares, disclosed fixed study rake, legal public histories and 100-BB stack accounting. Authored study ranges/responses are assumptions, not human-calibrated strategy. See [design, sources and limits](docs/online-cash-practice.md).
- Submit action, actual rationale, estimate and confidence before feedback. Immutable first answers; hints before answering mark assistance. Guided changed-range follow-ups unlock afterward and count separately. Some follow-ups retain the preferred action, preventing always-opposite guessing. Reason choices are seed-shuffled.
- Fresh same-skill review excludes recent semantic fingerprints. Persistent independent action/reason/math weaknesses, high-confidence misses and next-session cues guide study. Assisted and guided attempts do not drive independent-mistake prioritization.
- Additive migration 009 and version-1 private specifications; resume/reload, validation/idempotency, export and clear integrated. Exports expose staged public drill views, never private seeds or locked follow-ups.
- Builders returned ownership; independent reviewer found no actionable defects. Functional tester found no defects in tested API/math/persistence behavior. UI inspection is separate from pending browser execution.

## Current verification

Tested dirty feature over `2791d73`; final engine adjustment covered by scoped rerun. Commands use Node PATH above.

- `npm test -- --maxWorkers=1`: **315 passed, 2 optional solver tests skipped**, 33 files passed / one skipped, 56.57s.
- `npx vitest run tests/cash-practice.test.ts tests/cash-practice-api.test.ts --maxWorkers=1`: **22/22 passed** after engine freeze, 4.02s. Independent golden weighted/raked payouts, joint collisions/ties, test-only evaluator cross-check, histories/stacks, deterministic variety and persistent assistance/privacy covered.
- `npm run build`: **passed**, repeated after final engine change. Subsequent CSS changes were formatting only and preserved existing rules.
- Independent actual API smoke after freeze: **all 31 valid seat/skill combinations**, 62 immutable answers, 15 hinted / 16 independent initial attempts, staged privacy, database reopen, export and clear **passed** with temporary data. User data untouched.
- Playwright `--list`: **118 cases collected in 15 files**, including 10 new desktop/mobile cash flows. Local browser attempt failed five desktop cases at Chromium launch; **zero application/browser cases executed**. Linux CI pending.
- Independent code review and `git diff --check`: **passed**; local documentation links resolve. Optional external solver execution not repeated because solver code is unchanged.
- Logs: `/tmp/cash-functional-vitest.log`, `/tmp/cash-functional-final-cash.log`, `/tmp/cash-functional-final-build.log`, `/tmp/cash-functional-playwright-collection.log`, `/tmp/cash-functional-final-api-smoke.log`.

## Next action

Inspect staged contents, commit the reviewed feature, publish `feat/online-cash-training` through the GitHub connector, verify its tree/head, and inspect Linux full-suite CI. Resolve actual CI findings and recheck affected behavior. Record final remote commit/run and clean working-tree state here; browser collection/static inspection is not browser success.
