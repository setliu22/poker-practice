# Current handoff

Updated: 2026-10-14 UTC. Objective: simplify beginner-facing screens. Implementation, independent review and core verification complete; Linux browser CI/publication pending. Branch `ui/beginner-simplification`, baseline clean main `1f8be9c`.

## Changes

Learning, cash drills, bot play, general exercises, progress and reference now use short primary prompts and feedback. Calculations, history, detailed stats and source/model explanations start collapsed. Necessary cards, position, prices, range weights/responses, fixed rake and closing-bet assumptions remain visible. Cash feedback shows accepted moves and one concrete numeric reason. First answers, hints, guided counts, random/replay logic, privacy and data are preserved.

Progress keeps clear confirmation and now allows clearing cash-only history even when the legacy exercise total is zero; a dedicated real-flow browser regression was added. No API, engine, schema, dependency or licensed-data changes. Root integrated disclosure selector fixes for learning progress, opening guides and draw-density reviews without removing underlying math/privacy assertions.

## Verification

- Independent review passed with no remaining app findings. Bot bet/raise wording and stale BB test copy were corrected. Final draw-density disclosure adjustment was lead-reviewed after that review; app code unchanged.
- Independent `npm test -- --maxWorkers=1`: **326 passed, 2 optional solver tests skipped**, 33 files passed / one skipped, 46.84s.
- Production build and final TypeScript passed. Full Playwright collection: **138 cases in 15 files**; collection is not execution. Linux CI still needed for actual desktop/mobile behavior.
- Meaningful browser checks cover closed/keyboard-opened details, short feedback, visible required inputs, first-answer privacy/hints/reload, random/replay, complete gameplay, dialog focus, 320px bounds and cash-only clear confirmation.
- `git diff --check` passed. Logs `/tmp/beginner-functional-{unit,build,browser-list,types}.log`. Local Browser plugin has no available browser; project Chromium has the known Mach launch block. No redundant browser launch attempted.

## Runtime / next action

App started in owned dev session **6321**, http://127.0.0.1:5173 (API3001). Prior session99275 no longer existed and both ports were free. Read-only HTTP checks verify simplified guide/cash/progress source and API health; learner DB preserved.

Next: inspect staged source, commit and publish feature, verify remote tree/head and full Linux CI. Fix actual failures, integrate main and update final handoff. Workers completed their assigned roles and returned ownership; only lead work remains. Current tools cannot delete historical agent entries.

Node: `~/.local/share/poker-practice/node-v24.21.0-darwin-arm64/bin`. GitHub connector writes work; CLI credentials are session-limited. Preserve metadata-equivalent checkpoints and compare trees before synchronizing connector commits. Never publish learner data, dependencies, artifacts or external solver. Earlier cash/randomized features remain intact.
