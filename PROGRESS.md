# Current handoff

Updated: 2026-10-16. The approved beginner-first poker learning path is implemented, verified and independently reviewed on `codex/poker-learning-path` in `/Users/a../.codex/worktrees/poker-learning-path/poker-practice`. Task 4c adds distinct completed-lesson progress and recommends the next unfinished lesson. The user removed the separate mobile browser project from scope; the single web app retains responsive layouts while Playwright and CI run desktop only. The app is running at `http://127.0.0.1:5173/` with a temporary database at `/tmp/poker-practice-codex.sqlite`. The original `/Users/a../poker-practice` checkout and learner data remain untouched.

## Product and implementation

The user approved a beginner-first path for newer and experienced players and selected subagent-driven execution. The approved design/spec is [here](docs/superpowers/specs/2026-10-16-poker-learning-path-design.md); the task plan is [here](docs/superpowers/plans/2026-10-16-poker-learning-path.md). The course has five lessons in four units: legal actions, hand rankings, position/opening baselines, pot odds with a visible range, and introductory postflop reasoning. It stays local and does not train or use ML.

The event ledger preserves versioned lesson/question/answer/feedback/completion facts; exact answer retries recover saved receipts. Progress, missed-skill review, distinct lesson completion and next-lesson recommendations rebuild from events. Course engagement counts stay separate from fresh-transfer results, and reused transfer variants are labeled and excluded from the fresh count. Answers remain hidden until submission. Exports are explicit and cursor-pinned; full SQLite backups use validated restore to a new path. Legacy summaries stay separate rather than receiving fabricated history.

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

## Known limits and next action

The event export pins a high-water cursor but currently validates/materializes the whole ledger before filtering each page. This is a per-page performance cost if a local ledger grows; preserve the behavior and consider cursor-bounded SQL if measurements justify it. Learning-path results describe app questions and assumptions, not general poker skill or demonstrated improvement. No learner database or synthetic experiment rows were used for these checks.

The plan is complete. Optional live GTOpen tests were not run, and the event export's per-page cost still grows with the local ledger size; both limits are documented. No learner database or synthetic experiment rows were used for verification.
