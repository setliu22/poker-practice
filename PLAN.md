# Active plan

Status: Implementation in progress. The user approved the spec and plan and selected subagent-driven execution on 2026-10-16. Work is on isolated branch `codex/poker-learning-path`; Task 1 is next.

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

## Spec acceptance

- Covers user experience, learner path, architecture/data flow, local privacy and preservation, idempotent writes/replay, failure handling, metrics, tests, phases and non-goals.
- Respects the project's privacy, determinism, compatibility, honest-teaching, local-accessibility and provenance invariants.
- Decomposes later work so the first implementation can ship an end-to-end beginner path without requiring ML, accounts, background processing or cloud services.
- Self-reviewed for omissions, contradictions, scope and ambiguous requirements. The user approved the written spec and asked to proceed to implementation planning.

## Ownership and next gate

Lead owns `PLAN.md`, `PROGRESS.md`, the spec and handoff. Spec: `docs/superpowers/specs/2026-10-16-poker-learning-path-design.md`, committed as `7b07024` and approved by the user. The implementation plan is at `docs/superpowers/plans/2026-10-16-poker-learning-path.md`; the user approved it and selected subagent-driven execution. The feature branch contains a copy of the pre-existing requested source changes; the original checkout and local learner data remain untouched. Do not stage ignored data or unrelated artifacts.

The previous controlled mistake test, speed comparison, verification and exact results remain recorded in [PROGRESS.md](PROGRESS.md) and the linked experiment reports; preserve all existing dirty changes and learner data.
