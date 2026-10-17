# Active plan

Status: Complete for the approved daily-practice extension. The original learning-path release is complete; daily practice is implemented, reviewed and verified on `codex/poker-learning-path`. The separate mobile browser project remains removed; the single web app retains responsive layouts and Playwright/CI run desktop only.

## Objective

Implement a reviewable, task-by-task Duolingo-inspired poker learning product serving newer and experienced players with a beginner-first path.

## Approved design

- Short lessons teach one concept, give several practice decisions, show feedback after submission, and offer review of missed ideas.
- The path starts with fundamentals and then connects to the app's existing advanced decision practice.
- Progress separates practice consistency from demonstrated understanding. Show attempt/mistake summaries first; define mastery thresholds after observing a baseline.
- A versioned, append-only learning ledger captures lesson/question/answer/feedback/completion events locally. Exact retries return the saved response; conflicting reuse is rejected; answer and event commit together.
- Progress and review summaries can be rebuilt. Answers, displayed assistance, teacher labels and model predictions remain distinct. No wins/losses as decision truth.
- Preserve explicit local exports/backups and clear-data behavior. No automatic uploads or ML training.
- Sequence: one beginner path + ledger; deterministic spaced review/mixed sessions; future offline ML evaluation only with opt-in real data and learner/scenario holdouts, and only if it beats a transparent baseline with safe abstention.

## Current bounded extension: daily practice loop

**Status:** Complete. The daily card and event-derived practice streak are implemented; midnight/DST freshness, focus recovery, and overlapping progress-read behavior are covered and independently reviewed. The user confirmed a daily-practice home experience after noting that the existing course path lacked a daily habit loop.

**Outcome:** Make one short practice session the primary course-home action while preserving the open lesson map and separating practice consistency from poker-skill evidence.

**Acceptance:**

- A visible “Today's practice” card appears before the course catalog. It resumes an active lesson, otherwise starts the next unfinished lesson, otherwise recommends the latest missed-skill lesson; if the course is complete with no missed skill, it invites the learner to choose any lesson.
- Mark today's practice complete only after a committed `lesson-completed` event. Derive the current practice-day streak and today's completion from the immutable event ledger, using the browser's IANA time zone for calendar-day boundaries. A streak measures completion consistency only; it is visibly separate from fresh-transfer results and not described as skill or mastery.
- Keep the progress read endpoint read-only. Do not add a migration, account, remote call, model, notification, mobile project, streak freeze, leaderboard, XP or lockout.
- Add focused API tests for empty progress, completion-derived day/streak, repeated completions on one day, missed days, timezone boundaries and invalid time zones; add strict DTO coverage and a desktop browser flow for the home action and completion state.
- Update the learning-path data contract docs and final handoff. Run focused API/content tests, desktop browser learning-path suite, build, serial full Vitest, Prettier and diff checks.

**Ownership:** Implementation and review are complete. The lead integrated the exact scoped product, test, data-contract and handoff files; the implementation worker did not stage or commit.

## Spec acceptance

- Covers user experience, learner path, architecture/data flow, local privacy and preservation, idempotent writes/replay, failure handling, metrics, tests, phases and non-goals.
- Respects the project's privacy, determinism, compatibility, honest-teaching, local-accessibility and provenance invariants.
- Decomposes later work so the first implementation can ship an end-to-end beginner path without requiring ML, accounts, background processing or cloud services.
- Self-reviewed for omissions, contradictions, scope and ambiguous requirements. The user approved the written spec and asked to proceed to implementation planning.

## Ownership and next gate

Lead owns `PLAN.md`, `PROGRESS.md`, the spec and handoff. Spec: `docs/superpowers/specs/2026-10-16-poker-learning-path-design.md`, committed as `7b07024` and approved by the user. The implementation plan is at `docs/superpowers/plans/2026-10-16-poker-learning-path.md`; the user approved it and selected subagent-driven execution. The feature branch contains a copy of the pre-existing requested source changes; the original checkout and local learner data remain untouched. Do not stage ignored data or unrelated artifacts.

The previous controlled mistake test, speed comparison, verification and exact results remain recorded in [PROGRESS.md](PROGRESS.md) and the linked experiment reports; preserve all existing dirty changes and learner data.
