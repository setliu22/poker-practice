# Current handoff

Updated: 2026-10-16. Current request: implement the approved beginner-first poker learning path. Work is in isolated worktree `/Users/a../.codex/worktrees/poker-learning-path/poker-practice` on `codex/poker-learning-path`, based on `7b07024`. The prior requested event-history, usage and fast-assessment source changes were copied into this worktree for integration; the original `main` checkout and ignored learner data were not changed. No upload or external publication was requested.

## Product discovery

The user wants to serve newer and experienced players, starting with fundamentals, and preserve practice data for reliable usage analysis and possible future ML. The user approved the curriculum-first design, implementation plan, and subagent-driven execution. The plan is `docs/superpowers/plans/2026-10-16-poker-learning-path.md`; implementation has not started yet. The lead clarified that Task 2 owns the event-derived `reviewSuggestion` projection, while Task 4 adds course content and black-box coverage; this resolves a task ownership gap without changing the API contract.

## Learning-path implementation plan

- Draft: [implementation plan](docs/superpowers/plans/2026-10-16-poker-learning-path.md). It sequences the versioned course contract, event/API persistence and recovery, the first accessible lesson slice, the rest of the beginner curriculum, and final docs/verification.
- Handoff checks: Prettier passed on the plan, spec and handoff docs using the repository-local CLI with Node 24.21.0; `git diff --check` passed for tracked handoff docs; spec and plan links resolve; no placeholders remain.
- Scope: this turn changed planning/handoff documents only. Product tests and build were not run because no learning-path implementation was written.
- Next action: run baseline checks on this copied branch, then dispatch the Task 1 implementer and a fresh task reviewer. Preserve the original checkout and local learner data.

## Completed controlled experiment and speed comparison

- `npm run ml:mistake-test` generated 600 fresh synthetic deal groups / 1,200 policy decisions. The fixed stress policy folds premium hands 80% of the time; matched control folds them 10% of the time. Model, policy and thresholds stayed frozen. Synthetic rows are in ignored `data/ml/mistake-experiment.jsonl`; no learner database or usage rows were read or changed.
- On the 200-deal premium challenge, 125 choices changed between policies and the conditional teacher confirmed 123. Raw probabilities at a diagnostic-only threshold of 0.5 achieved 98.1% recall and precision for the leaky cohort. The deployed model made **zero positive gap flags**, abstaining on 156/159 teacher-positive leaky choices and returning a false “no clear gap” on three. In the natural cohort, all 11 changed premium folds were teacher-confirmed, and the model abstained on all 11. It responds in raw score, but shipped behavior does not flag this mistake.
- Teacher positives are conditional judgments under the authored opponent model and sampling assumptions, not validated poker errors. The challenge is premium-enriched and cannot estimate population prevalence or human personalization.
- `npm run ml:compare-speed` compared actual Quick assessment and detailed hint HTTP endpoints on 40 identical fresh decisions, alternating order with five warmup pairs. On Apple M1 Pro / Node 24: quick median **1.16 ms**, p95 **1.64 ms**; detailed hint median **1,001 ms**, p95 **1,162 ms**. Ratio of medians **863×** (median paired ratio 881×). First requests: 36 ms and 1,160 ms. The detailed endpoint samples 1,600 worlds and returns a multi-action explanation; quick may abstain, so this is a latency comparison with different outputs. Process startup, compilation, setup and browser rendering are excluded.
- Exact results, protocol, limitations and reproduction: [mistake experiment](docs/mistake-bot-experiment.md), [model card](packages/poker/models/README.md), [mistake report](packages/poker/models/mistake-experiment-report.json), [speed report](packages/poker/models/fast-assessment-speed-comparison.json).

## Verification

- `npm test`: **381 passed, 2 optional tests skipped**; 40 files passed, one skipped; 18.40 seconds.
- `npm run build`: passed TypeScript, Vite and both API bundles.
- Independent recomputation verified all 600 deal groups, 1,200 decisions, the frozen model and source hashes, disjointness from 13 prior synthetic datasets, every reported cohort metric and the paired bootstrap interval.
- The timing runner exercised actual loopback HTTP endpoints against a temporary file-backed database and asserts that application database rows remain unchanged. Independent report source/model hash check passed.
- Explicit Prettier check for the edited README/model/experiment docs and experiment scripts passed; `git diff --check` passed.
- Existing historical UI/browser evidence remains 160/160 desktop/mobile from the prior feature delivery; no browser tests were needed for this documentation and benchmark-only change.

## Existing preserved work

Event sourcing/replay, transactional idempotent table commands, local usage capture and recovery, and the frozen narrow quick-assessment model remain uncommitted. Usage collection is local and explicit; synthetic test rows are not counted as learner usage and are not used to retrain the model. The model currently supports only fresh heads-up button openings at 100 BB against policy-2 Mara and has no validated positive-gap threshold.

Next action: baseline verification is pending; then begin Task 1 on the approved feature branch. The original dirty checkout and learner data remain untouched.
