# Strategy-first daily practice — 2026-10-23 (complete)

Branch `codex/poker-learning-path`, HEAD `1e465b3`, published to `origin/codex/poker-learning-path` at the same SHA. User clarified that they know the rules and Learn / Daily Practice should generate fresh strategic situations with one defensible best answer. Keep old version-1 attempts readable; new skill IDs must not collide with legacy completion history. No plugins, no mobile product, no learner-data reset.

The approved spec and implementation plan describe five strategy skills (preflop/chart baseline, pot price/equity, postflop decisions, ranges/blockers, betting EV) with seeded generated scenarios and local event provenance. Stable skill objectives organize the course; each new attempt gets a newly seeded situation set. The daily action, review, path selection, and repeat flows all carry their entry point into the event ledger. Existing version-1 lessons remain replayable.

Migration 014 and database setup preserve old event payloads, answer receipts, foreign keys, and the cursor high-water mark. Replay now checks the saved generator version before reconstructing questions. Fresh-transfer fingerprints use scenario facts, not per-session question slot IDs, so an identical generated situation does not count as novel. The standalone-backup fixture expects schema 14. The learner database was not reset or used for migration tests.

Final verification: full serial Vitest **434 passed, 2 optional skips**; focused content/API/backup suites **58/58 passed**; generated-course desktop Playwright suite **21/21 passed**; TypeScript, Vite, API, and worker production builds passed; `git diff --check` passed. `/api/health` returned `{"status":"ok"}` at `http://127.0.0.1:5173/`. The independent review findings on unsupported generator replay and duplicate-scenario fingerprints were fixed and covered by regressions. No plugins or mobile product work were used. GitHub Actions `Verify` run [40013639949](https://github.com/setliu22/poker-practice/actions/runs/40013639949) was in progress at handoff.

# Simulator response error — 2026-10-23 (complete)

The simulator displayed the browser's raw JSON parser exception when an API response body was empty. Reproduced it with a desktop browser test by returning an empty response to an action request; the existing client showed `Unexpected end of JSON input`. `BotPractice` now reports a clear recovery instruction while refreshing the table state. Reloading and reopening the user's saved simulator hand showed no alert. The new regression passed, the simulator browser suite passed **18/18**, the full serial unit suite passed **434 tests / 2 optional skips**, production build and formatting checks passed, and the API health check returned `ok`. No hand actions or learner data were changed during verification.

# Navigation formatting fix — 2026-10-19 (complete)

Fixed the screenshot’s crowded navigation with equal-width grid buttons and consistent icon/label spacing in narrow desktop browser panels. Two columns below700px and five through1000px; wide sidebar preserved. Only styles.css, the course browser regression and lead handoff docs changed for this task; prior dirty work and learner data preserved.

Evidence: regression first failed on label overflow, then passed at300/320/480/640/800/1280px; corrected300px screenshot inspected. Final desktop learning-path suite **20/20 passed in30.5sec** and production build passed. Small CSS fix self-reviewed; no plugins, workers or mobile project added.

# Current handoff

## Strategy-first daily practice — 2026-10-23 (complete)

Generated strategy practice, simulator error recovery, UI refinements, regression tests, and current docs are committed as `1e465b3` and pushed to `origin/codex/poker-learning-path`; verified with `git ls-remote`. GitHub Actions run 40013639949 was in progress at handoff. Full verification evidence and feature details are recorded above. Next action: inspect the Actions run result; no PR was created.

## Copy cleanup — 2026-10-19 (complete)

User rejected decorative technical/conversation-derived text. Removed Saved on this device from sidebar/Progress, No-limit Texas Hold’em footer, generic Practice/Progress/Reference introductions, Your course/One short lesson eyebrows, redundant resume and feedback hints. Data-tools explanation now describes export/delete actions. Removed orphaned sidebar/footer styles and closed daily-card grid spacing. Preserved action labels, error messages, question assumptions and teaching content. Durable rule in PLAN.md: visible copy must support a user task, not repeat conversation or implementation facts.

Evidence: **31/31 desktop browser checks passed** (learning-path, practice, fast-assessment) in41.7sec; production build passed; course-home screenshot inspected after removal. Small reversible copy/layout task used lead self-review, no new workers/plugins. Same worktree/branch and preserved dirty work as below; no learner data changed.

## Product refinement — 2026-10-19 (complete)

User requested a finished desktop web app and prohibited plugins. Used native local shell/files/Playwright and scoped native agents only. Implemented the five-destination sidebar (Learn/Practice/Play/Progress/Reference), teal/slate design and favicon, compact course home, focused question cards and progress, answer tiles, safe Back to course/Resume with draft/feedback/pending-answer retention, and path export/clear under Progress → Learning path data. The paused active lesson row now says Resume and returns to the same attempt without new events. Progress has compact side-by-side summaries. Current docs describe the actual navigation.

Worktree `/Users/a../.codex/worktrees/poker-learning-path/poker-practice`, branch `codex/poker-learning-path`, HEAD `53e74b9` plus preserved earlier dirty UI/spec changes and this task's source/tests/docs. Original checkout and learner data untouched. App running on5173/API3001 from feature worktree. No dependencies, backend changes, staging, commits, or publication.

Evidence on integrated dirty tree:

- Independent full default desktop Playwright: **89/89 passed in2.0min**. Nine historical explicit320px cases are excluded by @mobile tag/config, so future default runs avoid mobile compute. Initial run had seven mobile seat-geometry failures; a subsequent run had two transient timeouts (both passed targeted rerun) and two stale visibility assertions (fixed to open the new disclosure). Final full run was clean.
- After that full run, lead corrected paused active-row Start→Resume and extended the pause test to use the row and verify checkpoint/event equality. Final focused desktop learning-path suite: **18/18 passed in28.3sec**.
- Content/API tests: **34/34 passed**; no course/poker/API changes after those checks.
- Final `npm run build`: passed TypeScript, Vite and both API bundles. Existing >500kB client bundle advisory remains nonblocking.
- Independent code review and two scoped follow-ups found no actionable findings, including final resume-row logic.
- Independent functional/visual smoke at1280/1440 checked Learn, active question/feedback, Practice, Progress, Reference and active nine-player Play: no body overflow or clipped actions; draft pause/resume and dialog Escape/focus return passed. Isolated smoke/test DBs only; temporary smoke servers stopped. Screenshots `/tmp/poker-product-verify/`.
- Explicit formatting and diff checks recorded at final handoff. Optional live solver coverage not run; solver integration unchanged.

Workers returned ownership and completed; historical completed-agent entries cannot be deleted with the available tools. Ready for product use. Expanded generated-course content/sixth lesson remains separate pending work; this pass refines the existing product interface and flow.

## Earlier handoff

2026-10-17 UI correction completed: automatic lesson recovery previously displayed question 2 underneath a daily card asking the learner to resume. The daily card now stays hidden while an unfinished lesson is already rendered and returns on completion/home. Removed the requested streak disclaimer. Updated the existing desktop flow to advance to question 2, reload, verify the same question/focus and absence of a resume button, then finish the lesson. Focused Playwright suite passed **17/17 desktop**; `npm run build` passed (existing bundle-size advisory). The live Vite source at port 5173 was checked and contains the correction. Lead self-reviewed this small presentation change; no worker spawned. Earlier dirty work and learner data are preserved.

## Broader generated-exercise work

Updated: 2026-10-17. The user approved expanding the generated course to cover as many exact-answer PokerTrainer-inspired exercise formats as the local charts, visible scenario facts, poker evaluators, and stated arithmetic can support. Keep the existing five lessons and add a sixth lesson for hand reading with explicit opponent ranges and card blockers. Remove “Your streak counts days with a completed lesson. It measures practice consistency and does not measure poker skill.” from the Learn card without replacement; retain the streak value and seven-day activity markers. No source code changed for this revision.

The revised spec is [here](docs/superpowers/specs/2026-10-16-duolingo-course-and-generated-exercises-design.md) and awaits user review. Its exercise patterns abstract PokerTrainer's public quiz/tutorial categories without copying its content. The previous detailed implementation plan at [this path](docs/superpowers/plans/2026-10-16-duolingo-course-generated-exercises.md) must be updated after the revised spec is approved, then reviewed by the user before implementation. After that, follow the already selected subagent-driven workflow. Do not add mobile-specific UI or tests.

The Learn disclaimer has now been removed by the bounded UI correction above. Work remains on `codex/poker-learning-path`. The original `/Users/a../poker-practice` checkout and learner data remain untouched. Existing dirty UI task changes are preserved.

Documentation verification for this revision: the revised spec passed Prettier and `git diff --check`; it was self-reviewed for consistency, unsupported strategy claims, and ambiguous exercise labels. No application tests ran because no app source changed.

Next action: wait for user review of the revised spec. If approved, update and self-review the detailed implementation plan, then wait for its approval before editing app code.

Roster check: no workers are running; the previous UI reviewer, tester, and builder entries are completed. The current tools do not provide deletion for historical completed-agent entries.

## Prior completed UI task

The approved design simplifies Learn to one primary daily action, compact completion progress and a grouped five-lesson course path. It removes repeated summaries and the duplicate recommendation; detailed path and fresh-transfer results are on Progress. Cash Decision Lab moved to Practice. Legacy lessons and the preflop walkthrough moved to Reference. All lessons remain directly accessible/repeatable; saved cash sessions route to Practice after reload; back actions preserve focus. No mobile-specific work, API, model, poker, data or migration changes.

Implementation used TDD. RED reproduced the duplicate recommendation panel and later the wrong “Start” accessible name on completed lessons. Final GREEN: independent desktop Playwright run `PATH=/Users/a../.local/share/poker-practice/node-v24.21.0-darwin-arm64/bin:$PATH npm run test:browser -- tests/browser/learning-path.spec.ts --project=desktop` passed **17/17** on the final UI; the Practice/reference/chart preservation flows passed **11/11 desktop**, and the preflop walkthrough suite passed **8/8 desktop** after the Reference label change. The implementer also ran full serial Vitest before the final accessible-name-only follow-up: **416 passed, 2 optional skips** (42 files passed, one skipped). Final production build passed after restoring the package-lock dependency setup; the Vite bundle-size warning is non-blocking. Prettier check across all 13 changed files and `git diff --check` passed.

Independent code review found and verified the completed-lesson accessible-name issue was fixed; final verdict: ready, no remaining findings. Independent functional verification found no gaps in daily practice, course repeat/review, progress, Practice/Cash, Reference tools/charts, keyboard, reload and focus behavior. The browser suite is desktop-only; no mobile browser work ran.

During environment setup the lead accidentally invoked `pnpm run` without a script, which attempted to migrate the shared ignored `node_modules`. The original dependency folders were temporarily preserved in `node_modules/.ignored`; the lead restored the installation with `npm ci --no-audit --no-fund` using the identical `package.json` and `package-lock.json` from the original checkout and feature worktree. `npm ls --depth=0`, final build, final desktop browser suite and app health all passed afterward. No source/data files in the original checkout were changed by this recovery.

## Product and implementation

The user approved a beginner-first path for newer and experienced players and selected subagent-driven execution. The approved design/spec is [here](docs/superpowers/specs/2026-10-16-poker-learning-path-design.md); the task plan is [here](docs/superpowers/plans/2026-10-16-poker-learning-path.md). The course has five lessons in four units: legal actions, hand rankings, position/opening baselines, pot odds with a visible range, and introductory postflop reasoning. It stays local and does not train or use ML.

The event ledger preserves versioned lesson/question/answer/feedback/completion facts; exact answer retries recover saved receipts. Progress, missed-skill review, distinct lesson completion and next-lesson recommendations rebuild from events. The daily card resumes an active lesson, starts the next unfinished lesson or suggests the latest missed-skill lesson; completed-day and streak values are derived from committed lesson-completion timestamps in the browser's validated IANA timezone. The UI refreshes at local midnight and when the page returns, including DST transitions. Course engagement counts stay separate from fresh-transfer results, and reused transfer variants are labeled and excluded from the fresh count. Answers remain hidden until submission. Exports are explicit and cursor-pinned; full SQLite backups use validated restore to a new path. Legacy summaries stay separate rather than receiving fabricated history.

Learning-path commit sequence: `ac2db44` / `97807c1` (contract and first lesson/fix), `8306b88` / `4ae0bfd` (event API and review fix), `ff8f881` / `de90358` (UI and recovery/focus fix), `816dc90` (complete curriculum), and `26526a5` (fresh-transfer progress labels). The earlier requested event sourcing, local usage, backup/recovery and quick assessment are in baseline commit `eae3193`.

## Verification

- Independent content/API review approved Task 4 with no findings. Independent browser run passed **20/20** (10 desktop, 10 mobile). Lead focused rerun: **21 API/content tests passed**.
- Task 4b independent UI review approved with no findings. Independent browser run passed **22/22** (11 desktop, 11 mobile), including zero-state counts, fresh/reused labels, final UI/API count agreement, retry/resume, keyboard/focus, and mobile bounds.
- `npm test -- --maxWorkers=1`: **403 passed, 2 optional skips**; 42 files passed and one optional file skipped. A concurrent run had one timeout in an unchanged table-review test; the serial rerun passed without code changes.
- `npm run build`: passed TypeScript, Vite, API and assistant-worker bundles.
- Task 4c RED: focused tests **1 failed, 21 passed** and the new browser regression failed as expected. GREEN: focused API/content **22 passed**, learning-path browser **12/12 desktop**, full serial suite **404 passed / 2 optional skips**, build, Prettier and diff checks passed.
- After the user removed the mobile Playwright project, `npm run test:browser` listed one `desktop` project and passed **92/92** in 2.2 minutes. Playwright/CI documentation now names the desktop-only suite.
- Final independent scoped review marked all three findings addressed and found no new Critical or Important defects. Final Prettier and staged/unstaged `git diff --check` passed. Task 4c and documentation changes are committed separately after exact-path staging.
- Optional live GTOpen tests were not run; the course requires no solver.

## Earlier model assessment

The controlled synthetic mistake test used 600 fresh deal groups / 1,200 policy decisions. Raw scores reacted to an injected premium-overfold pattern, but the deployed model made **zero positive mistake calls** and abstained on most teacher-positive challenge choices; synthetic teacher labels are conditional on authored assumptions, not validated human skill. In the paired local endpoint benchmark, Quick assessment median latency was **1.16 ms** versus **1,001 ms** for detailed hints (**863×**), with different outputs and more abstention in Quick. Full protocols and limitations are in [the mistake experiment](docs/mistake-bot-experiment.md) and [model card](packages/poker/models/README.md).

## Pre-existing learning-path limit outside this UI task

The event export pins a high-water cursor but currently validates/materializes the whole ledger before filtering each page. This is a per-page performance cost if a local ledger grows; preserve the behavior and consider cursor-bounded SQL if measurements justify it. Learning-path results describe app questions and assumptions, not general poker skill or demonstrated improvement. No learner database or synthetic experiment rows were used for these checks.

Prior release checks passed 404 tests / 2 optional skips, build, formatting and desktop browser 92/92. The daily-practice ticket and two freshness fix rounds used TDD. Initial API/content RED was **13 failed / 21 passed**, and the daily-card browser regression failed before implementation. The midnight fix's RED reproduced stale status after crossing midnight; the request-ordering RED reproduced a delayed initial success being hidden by a newer failed refresh. Final GREEN: full serial Vitest **416 passed / 2 optional skips**; focused learning-path desktop Playwright **16/16**; `npm run build`; explicit Prettier check across the nine changed tracked files; and `git diff --check` all passed. Independent review found the midnight issue and the overlapping-read race; both were fixed and the final scoped re-review found no remaining Critical, Important or Minor issues. The app is responding at `http://127.0.0.1:5173/` and `/api/health` returns `{"status":"ok"}`. Optional live GTOpen tests were not run, and the event export's per-page cost still grows with the local ledger size; both limits remain documented. No learner database or synthetic experiment rows were used for verification.
