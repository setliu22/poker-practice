# Active plan

Status: In progress — Linux browser verification and publication. Owner: lead. Baseline clean `main` at `8204eef`; branch `fix/randomized-preflop-walkthrough`.

## Objective and acceptance

User found fixed KQs/KTo/AKs walkthrough scenes and wants random scenarios. Explain why deciding to open is distinct from choosing an opening size: the app uses an authored 2.5-BB baseline size for the entire opening range, not an amount calculated from one hand's strength. Keep context/range/position, opponent responses and upstream sizing limits explicit.

- Generate fresh legal cards, hand classes, position contrasts and observed opposing raise totals. The instructional sequence stays coherent: the same comparison hand must appear in both earlier and button positions; the same raised-pot situation must persist through call-cost/re-raise questions.
- New randomized walkthrough button changes substantive scenarios and clears old answers; replay/back navigation preserves current scenarios. Only reveal chart agreement after answering or explicitly opening a hint.
- Support directly provided 6/9-player charts, default nine. Show correct seats, folds, remaining players, blinds and pot amounts. No inferred eight-seat chart or claimed optimal sizing.
- Retain deterministic generation and backward-compatible six-player helper defaults. Preserve old lessons, data, licensed chart definitions and running app.
- Meaningful unit fixtures, desktop/mobile browser cases, build, independent review and functional verification. Publish reviewed result through authenticated GitHub and verify Linux CI, because local Chromium is blocked.

## Contracts and ownership

Builder G owns `packages/shared/src/preflop-walkthrough.ts` and `tests/preflop-walkthrough.test.ts`. Preserve existing exports/defaults. Add `walkthroughSeatsFor(players:6|9)`, extend `walkthroughChart(charts,position,players=6)` and `preflopTransfer(charts,seed,players=6)`. Add `generateWalkthrough(charts,seed,players:6|9)` returning `{players,seats,opening:{hand,hole},contrast:{hand,hole,earlyPosition},raised:{hand,hole,raiseTo,heroPosted:0,callCost,minimumRaiseTo,potChips},fingerprint}`. Opening selection includes both raise/fold hands. Contrast is outside the earlier direct chart but inside the button chart. Raised hands do not imply a strategic call/raise; only arithmetic is graded. Use full uint32 seeds, proper pairs/suited/offsuit cards, legal 20/25/30/40-chip observed raises; BB10 and SB5. Fingerprint excludes cosmetic suit variation and seed.

Builder U owns `apps/web/src/PreflopWalkthrough.tsx`, appended scoped rules in `styles.css`, and `tests/browser/preflop-walkthrough.spec.ts`. Consume G contract, default9/selector6or9, optional hints, clear sizing explanation and whitespace fixes. New vs replay distinction, stable paired scenes, current-state reset on table changes, no stale feedback, keyboard/focus/retry and 320px bounds. Only supported matching charts; no answer leakage in prompts. Seed generation uses crypto, bounded recent fingerprint avoidance; final transfer fresh choices cannot accidentally repeat current semantic position/hand.

Lead owns root docs, README, source note, integration and publication. G/U may propose contract changes through lead, never edit one another's files. Readonly reviewer/tester inspect final diff and test behavior after builders settle.

| Task | Role                         | Dependency                                               | Status                  |
| ---- | ---------------------------- | -------------------------------------------------------- | ----------------------- |
| G    | Generation builder           | Contract above                                           | Complete                |
| U    | UI/browser builder           | Contract above; wait for generator before running checks | Complete                |
| R    | Independent reviewer         | Stable G/U                                               | Complete                |
| V    | Functional tester / Linux CI | Stable G/U                                               | Core passed; CI pending |
| I    | Lead integration/handoff     | R/V                                                      | In progress             |

Previous online-cash lab is complete: code `bc8661f`, GitHub run 38510972941 passed315 tests/build/118 browser cases. Preserve it. Each worker needs this role/ticket and must return ownership when done; no idle/unassigned agents.
