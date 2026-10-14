# Current handoff

Updated: 2026-10-14 UTC. Owner: lead. Objective: randomize the preflop walkthrough and explain opening size separately from hand strength. Complete: implementation, independent review, full Linux CI and GitHub delivery verified.

## Delivered application

- Current branch `main`; feature branch `fix/randomized-preflop-walkthrough`; reviewed application commit `30effb0efc8b9733ff72f5bb758b71e028f42233`, tree `6b3f681bd0969f8a913f5208c13e2d928aa4bd13`, based on `8204eef`. The equivalent CLI checkpoint is preserved as `local-checkpoints/93dfac7`. GitHub connector trees were compared exactly before local synchronization.
- **New randomized walkthrough** changes hand classes, the earlier comparison position, and observed opposing raise totals. **Replay** and back navigation preserve examples. Paired position and betting-rule steps retain the same exact cards/context. Opening samples include raise and fold hands; hints remain optional.
- Walkthrough supports direct 6/9-player charts, default nine, with matching visible seats, folds, remaining actors and pot amounts. No eight-player chart inferred. Current contexts reset answers/feedback; bounded semantic collision avoidance prevents purely cosmetic repeats.
- Feedback separates whether to open from the app's **2.5-BB opening size for the whole non-blind opening range**. That size is a teaching assumption, not calculated from private hand strength or proven optimal. Opposing raises vary for arithmetic only: totals 20/25/30/40 imply call costs 20/25/30/40, minimum full re-raises 30/40/50/70 and pots 35/40/45/55. See [design and source](docs/preflop-practice.md).
- Legacy six-player defaults and seeded output preserved. No chart assets, licenses, API/schema, dependencies, old learning data or games changed. Previous online cash Decision Lab remains intact.
- Public repo: https://github.com/setliu22/poker-practice. Verified feature integrated into main; final handoff changes are documentation only. Read `git status` and `git log -1` for the exact final docs commit.

## Verification

[GitHub run 38574347619](https://github.com/setliu22/poker-practice/actions/runs/38574347619) on application commit `30effb0`: **326 unit/integration tests passed** (two optional solver tests skipped), **production build passed**, and **all 132 desktop/mobile browser cases passed** in 3.7 minutes. This includes 16 walkthrough cases checking actual mobile seat bounds/nonoverlap, focus/keyboard, hints, retries, resets and new/replay behavior.

- Independent full local `npm test -- --maxWorkers=1`: **326 passed, two optional solver tests skipped**, 33 files passed / one skipped, 57.41s. Walkthrough suite **13/13** passed.
- Independent production build passed after app freeze; full browser collection lists **132 cases in 15 files**, including 16 walkthrough desktop/mobile cases. Collection was followed by the successful full Linux execution above; local Chromium has a known Mach-port launch block.
- Independent temporary smoke covered **4,611 seeds per 6/9-player variant**, legal deterministic cards, all 169 opening classes, direct chart contrasts, and four independently specified raise/call/pot fixtures. Legacy six-player output exactly reproduced against `8204eef` for every seed. Read-only API check confirmed direct charts and pinned MIT provenance.
- Independent code review found no remaining actionable defects. Misleading 'Make the first raise' heading was corrected to neutral 'Choose an opening action'. Meaningful browser fixtures inspect randomized/replay/reset behavior, raise/fold examples, optional hints, keyboard/focus, retry, 320px bounds and nonoverlapping seats.
- `git diff --check` and local documentation links passed. Final handoff changes are documentation only. Logs: `/tmp/preflop-functional-{tests,build,playwright-list,smoke,api-get}.log`.
- Builders, reviewer and tester completed their assigned tickets and returned ownership. Only the lead is running. Current tools cannot delete historical agent entries; completed workers are not idle unassigned workers.

## Running app and next action

Dev session **99275** serves http://127.0.0.1:5173 with API port 3001. Its owned predecessor was restarted after Vite cached the old module despite file changes. Read-only HTTP checks confirm the updated randomized control, sizing explanation and API health. User can refresh the page; learner database preserved.

No required work remains for this objective. Start any next task from START_HERE.md and inspect the actual tree; the running app remains available for user testing. Preserve metadata-equivalent checkpoints and compare trees before tracking connector commits. Node runtime: `~/.local/share/poker-practice/node-v24.21.0-darwin-arm64/bin`; GitHub writes use the authenticated connector. Optional external solver code is unchanged and was not retested live.
