# Local opening baselines

`openings.json` is a mechanical expansion of the directly defined `RANGES` entries in [PreflopR](https://github.com/bmorrow10/preflopR/tree/aed511d0451aea33a14f7e9204595fc2211f233f), by bmorrow10, pinned to commit `aed511d0451aea33a14f7e9204595fc2211f233f`. The source is licensed under MIT; its complete copyright notice and license are retained in [LICENSE](./LICENSE).

Original source file: [preflopR.r](https://github.com/bmorrow10/preflopR/blob/aed511d0451aea33a14f7e9204595fc2211f233f/preflopR.r). SHA-256 of its downloaded bytes: `75a8a7288bbe39361313ea4183514784f91ab462f9d4c99d3b9d50a8394b6090`.

The source README explicitly says the ranges are **not solver-derived**. Its R comments and captions make stronger claims that this app does not adopt. The author does not specify stack depth, rake, antes, or opening sizes. These are authored, illustrative raise/fold baselines, with no claim of expert approval or optimal play. They do not grade the learner's skill.

The app applies them only to its stated 100-BB, no-ante, no-rake context, on the learner's first preflop decision when everyone before them has folded and only the 5/10 blinds are in the pot. This is an explicitly assumed educational context, **not a verified exact match to a solved strategy**. The app-selected sizes of 2.5 BB (3 BB in the small blind, excluding heads-up button) are not supplied by upstream.

Included: `2_BTN`; `6_UTG`, `6_HJ`, `6_CO`, `6_BTN`, `6_SB`; `9_UTG`, `9_UTG+1`, `9_UTG+2`, `9_MP`, `9_HJ`, `9_CO`, `9_BTN`, `9_SB`. The source's six-player `UTG` is this app's `Lojack` (first to act); nine-player `MP` is the app's `Lojack` (three seats before the button).

Excluded: `2_BB`, which is not an unopened-pot opening decision; all source fallback logic; inherited ranges for other table sizes; facing limps, raises, or re-raises; later streets. Unsupported decisions return a reason, never a silently substituted chart.

The conversion expands `pairs_down_to`, `suited`, and `offsuit` calls into canonical starting-hand classes without altering which hands raise. Runtime Zod validation checks allowed source keys, seat/position correspondence, valid canonical hand classes, uniqueness, and chart count. Tests verify independently counted source fixtures, 169-cell ordering, and all 1,326 starting combinations. No upstream plotting code or runtime dependencies are required. Normal use stays offline.

Opening percentages count six combinations per pair, four per suited class and twelve per offsuit class, divided by 1,326. They describe the chart's starting-hand coverage; they are not chances of winning, action EV, or frequencies conditional on card blockers.
