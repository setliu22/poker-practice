# Current handoff

Updated2026-10-14UTC. Active objective: randomize the guided preflop scenarios and explain opening size separately from hand strength. Implementation, independent review and core verification complete; GitHub Linux browser CI pending.

## Actual state

- Branch `fix/randomized-preflop-walkthrough` from clean `main` at `8204eef157f27f119a2a3a2ed4c0e0e8283276ed`. Generator, UI, tests, README and design note ready for feature commit. No chart assets, API/schema, runtime dependencies or learner data changed.
- Previous cash Decision Lab complete and preserved: code `bc8661f`, run38510972941 passed315 unit/integration tests/build/118 desktop/mobile cases. Public repository https://github.com/setliu22/poker-practice.
- Dev session **99275** runs `npm run dev` with Node24 at127.0.0.1:5173 (API3001). Earlier session98071 was restarted because Vite cached the old module despite filesystem changes. Read-only HTTP check now verifies new randomized controls/neutral heading in served module and API health `ok`. User can refresh the app.

## Implemented changes

- Generated 6/9-seat walkthroughs defaultnine; direct matching authored charts only. New randomized walkthrough changes hand classes, earlier comparison position and observed opposing raise totals; replay/back preserve scenes. Exact paired cards remain the same across the position comparison and raised-pot arithmetic steps.
- Opening example includes both raise and fold hands. Optional hints; no automatic chart answer in prompt. Feedback explicitly separates whether to open from the app's fixed **2.5BB whole-range teaching size**, which is not calculated from the private hand's strength or claimed optimal.
- Visible seats/action order, fold counts, remaining actors, pot and legal betting totals derive from current context. Opposing totals20/25/30/40 give callcost20/25/30/40, minimum full re-raise30/40/50/70, pot35/40/45/55. Arithmetic does not imply a strategic response.
- Bounded semantic repeat avoidance for new walkthrough and final transfer; reset feedback/answers on context changes. Scoped full-ring responsive grid, focus/retry behavior, whitespace corrections. Legacy six-player helper defaults/output preserved.
- [Design and sizing source](docs/preflop-practice.md) explains authored-range limits. Primary GTO Wizard source inspected; no copied solver ranges or changed licensed data.

## Verification and ownership

- Independent code review: no remaining actionable findings; neutral opening-action heading correction verified. Review covered generation, arithmetic/positions, UI state/privacy and meaningful tests.
- Independent full `npm test -- --maxWorkers=1`: **326 passed, 2 optional live-solver tests skipped**, 33 files passed/one skipped,57.41s.
- `npm run build`: **passed** after application freeze. Walkthrough unit suite13/13 passed.
- Independent temporary smoke: **4611 seeds per6/9 variant**, deterministic legal cards,169 opening classes, contrasts and all four arithmetic fixtures; exact legacy six-player output reproduced against8204eef for all seeds. Read-only direct chart API/provenance check passed.
- `npm run test:browser -- --list`: **132 cases collected in15 files**, including16 walkthrough desktop/mobile cases. Actual browser execution pending Linux CI; local Chromium known Mach-port launch block, no redundant launch attempt.
- `git diff --check`: passed. Logs `/tmp/preflop-functional-{tests,build,playwright-list,smoke,api-get}.log`.
- Builders, independent reviewer and tester finished and returned ownership. No idle/unassigned agents required. Final handoff edits remain lead-owned; retire completed workers and report actual live roster.

## Next action

Inspect staged source, commit, publish the branch via authenticated GitHub connector, compare tree/head and inspect Linux full suite. Resolve real CI findings, then integrate and update final handoff. Preserve checkpoints when connector commit metadata differs from CLI. Node runtime: `~/.local/share/poker-practice/node-v24.21.0-darwin-arm64/bin`. No required live solver work; its code is unchanged.
