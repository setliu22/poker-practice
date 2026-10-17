# Daily poker course and generated exercises

**Status:** Conversational design approved by the user on 2026-10-16. Written specification is awaiting user review. Implementation is not approved yet.

## Goal

Make Poker Practice feel like a simple daily learning course: one clear lesson to do today, visible practice consistency, a guided but navigable path, and short review of missed ideas. Replace fixed exercise instances with newly generated, replayable poker scenarios whose answers are calculated from validated rules, poker evaluators, and explicit assumptions.

The product serves beginners first while leaving existing practice and later lessons directly accessible to experienced players. It stays local and desktop-focused; this work adds no mobile-specific interface or tests.

## Product experience

The Learn page remains centered on one primary “Today's practice” action and the existing beginner-first path. The daily action resumes an unfinished lesson, otherwise recommends the next path lesson; after the path is complete, it can offer a review or repeat. Course nodes show the current, completed, and upcoming lessons. Progress detail remains on Progress rather than competing with the lesson action.

Show the current consecutive practice streak with a compact seven-day activity row. A day counts when a lesson-completion event is committed in the learner's selected IANA time zone. The activity row and streak derive from those same completion events. Missing a day may reset the current streak, but it never removes past activity, completed lessons, or learning history. Consistency is not presented as poker skill. The first release adds no streak currency, leaderboard, push reminder, or paid freeze mechanic.

Lessons remain short and untimed. Each exercise gives immediate feedback only after submission. The lesson ending highlights completion, revisits missed concepts, and offers an optional short review. Review recommendations are derived from recorded mistakes and remain labeled as practice recommendations, not mastery claims. Learners can repeat completed lessons and open other lessons without waiting for an unlock.

This follows the useful parts of language-learning course design: a guided path that mixes new work with review, daily practice, and targeted mistake review. Duolingo describes those patterns in its [home path design](https://blog.duolingo.com/new-duolingo-home-screen-design/), [Practice tab](https://blog.duolingo.com/guide-to-duolingo-practice-hub/), and [streak design](https://blog.duolingo.com/how-duolingo-streak-builds-habit/). The design adapts them to poker without copying Duolingo branding or treating streak length as a measure of understanding.

## Exercise generation

Question instances are generated for a new lesson instance from constrained, versioned templates. The learning objectives, explanatory language, chart provenance, and assumptions remain authored. Scenario values and cards vary within a validated domain; a new instance receives a new scenario set, while retrying or resuming the same instance reconstructs its original questions.

Each template has a stable template ID and version, a seeded scenario generator, a strict public-question schema, a deterministic answer oracle, and a validation step. The oracle returns the expected answer, grading rule, explanation, takeaway, skill ID, and stated assumptions. The server sends only the current public question before submission; it does not send its answer key, generator seed, or future question set in the ordinary exercise response.

The first generator version covers the current five lessons:

- Table flow and legal actions: vary whether action is open, a wager is faced, or checking is available; grade against the authored no-limit Hold’em rules.
- Hand rankings: deal distinct cards from a standard deck, construct a supplied board, and compute the best five-card hand using the existing poker evaluator. Choice generation must include one correct answer and distinct plausible distractors.
- Position and opening baselines: select a valid hand and table/position context from the pinned authored chart data. The answer is the chart's stated action, described as chart agreement rather than universally optimal play.
- Pot odds and equity: generate integer pot/call amounts and compute the break-even share using the existing pot-odds function. Equity exercises use a fully specified board and visible, weighted opponent range so the answer is exact under those inputs.
- Postflop reasoning: generate legal visible-card draw/out scenarios and exact next-card arithmetic. Any action comparison uses an explicitly supplied range, response model, and payoff calculation; its conclusion is conditional on those assumptions. Questions without one determinate answer remain authored discussion prompts and are not graded as uniquely correct.

Generation is constrained randomness, not an LLM composing poker advice. Every graded item must have one unambiguous answer under its stated assumptions. The generator must reject invalid card collisions, impossible scenario parameters, duplicate answer choices, missing correct options, and scenarios whose assumptions do not match their oracle. Percent questions use exact stored values and an explicit tolerance; answer display may round while grading remains based on the stored value.

Generated performance is evidence about the learner's responses to these app scenarios and assumptions. It is not proof of general poker skill, optimal strategy, or real-table results. Synthetic bot experiments, authored labels, generated learner questions, and any later model predictions remain separate data sources.

## Versioning, replay, and event data

The existing append-only `learning_path_events` ledger remains the source of truth. A committed lesson-open event records its entry point (daily recommendation, path selection, review, or repeat), content version, generator/template version, and a server-generated exercise seed. Each question-presentation event records a stable generated scenario fingerprint and whether it belongs to the lesson's transfer set. Existing answer, feedback, completion, and resume events continue to record what happened. Correct answers are recorded in feedback only after the learner submits.

The seed is for educational scenario generation only; it is separate from any poker table deal seed and never determines or exposes an opponent's cards or a future game runout. The seed and template versions let the server reproduce the same question and calculate its answer after reload. A new lesson instance uses a different seed. Reusing an event ID with a changed payload remains a conflict, while an exact start retry resolves to the same committed instance and seed.

New events use a versioned payload contract. Existing version-1 course events and completed attempts remain readable and replayable. New starts use the generated-content version; an in-progress older instance stays bound to its original content and grading rules. Do not rewrite historical events or relabel old attempts as generated scenarios. Progress and usage summaries remain derived from events rather than separately mutable counters.

The event stream continues to record lesson start/resume, question presentation, answer submission, feedback display, and completion. Entry point plus template/scenario provenance makes it possible to derive which practice features are used, where learners leave, how often they repeat, and how they respond to new variants. These records remain local, included in explicit user-controlled export and SQLite backup, and are never automatically uploaded. No account identity, external analytics service, automatic model training, or cross-user ingestion is added.

Progress can expose the last seven local calendar-day completion flags in the requested IANA time zone, derived from completion timestamps. Existing DST-safe date logic is reused. Any event export remains explicitly initiated by the user; it must preserve stable event IDs and versions for deduplication and replay.

## API and failure behavior

The local API owns seed creation, template selection, schema validation, generation, answer calculation, answer grading, and event writes. Starting an instance is transactional: either the lesson-open event with its seed is committed, or no instance is accepted. Repeating the same start event returns the same instance. Resuming loads the committed seed/version and reconstructs the same scenario.

Answer submission keeps the existing idempotency contract. The command carries a stable request ID and content version. The API validates that the question belongs to the active instance and that the submitted answer matches the generated answer type, grades it, then commits the answer event, feedback event, and exact response receipt in one transaction. An exact retry returns the saved feedback; changed reuse conflicts. A stale content version returns a conflict without overwriting the learner's entered answer. Feedback and correctness remain absent before submission.

If a scenario cannot be generated or validated, the start transaction fails with a clear retryable error and leaves no partial progress. The client can retry the same start command; only the successfully committed instance becomes the replay source. If event data is corrupt or an old generator/oracle version is unavailable, the API reports an explicit recovery error rather than silently regenerating a different question. Normal backup and restore remain available.

## Alternatives considered

1. **Shuffle a larger authored bank.** This is simple and highly controllable, but still presents a finite set of fixed questions. It does not meet the request for generated practice.
2. **Constrained, seeded scenario generation.** This is recommended. Existing poker logic and chart data provide answer oracles, and versioned seeds make each attempt reproducible. It requires generator validation and compatibility tests, but avoids relying on unverified answers.
3. **LLM-generated exercises.** This is not selected. A model cannot guarantee that every question has one correct poker answer, and runtime generation would add network/privacy, reproducibility, latency, and answer-quality risks.

## Verification and success evidence

Before the generated content version ships:

- Run deterministic generator tests over a large fixed seed set. Confirm same seed/version returns identical prompts and answers; different seeds produce scenario variety; all cards are legal and distinct; every choice question has exactly one expected choice; every percent answer matches its stated arithmetic; and every generated question passes strict schemas.
- Check each oracle against the existing poker evaluator, exact pot-odds/equity calculations, and pinned chart source. Include edge cases for ties, board-play hands, kickers, extreme but valid call prices, and draw-completion counts.
- Exercise content-version compatibility: old instances can be loaded, answered, resumed, exported, backed up, and restored with the same old rules. New starts are pinned to the new generator version.
- Verify API privacy and consistency: no answer key or seed in unanswered-question responses; one accepted event per answer; exact retries recover the stored receipt; conflicting IDs and stale revisions fail safely; and failed generation/answer transactions leave no partial progress.
- Verify seven-day activity and streak reconstruction across local midnight, time-zone changes, and daylight-saving transitions. Confirm it is computed from completion events and does not merge with fresh-transfer performance.
- Add desktop browser coverage for streak/activity presentation, daily start/resume, generated question submission and feedback, reload/retry stability, mistake review, keyboard access, and loading/error states. Do not run mobile-specific tests.
- Run focused learning-path/API tests, the relevant full serial test suite when practical, `npm run build`, formatting checks on changed files, and `git diff --check`. Use isolated test databases; never use learner data for destructive verification.

Success is demonstrated by reproducible generated variety, deterministic grading with no invalid or ambiguous cases in the tested domain, reliable resume/retry, preserved old event replay, and locally derivable practice-use summaries. Engagement counts and generated-question performance remain separate, and numerical retention or learning targets are set only after collecting a baseline.

## Non-goals

- Mobile-specific UI, tests, or compute.
- Accounts, cloud sync, automatic telemetry uploads, or a new analytics service.
- LLM-generated poker questions or advice, ML grading, retraining, or solver dependence.
- XP economies, competitive leaderboards, paid streak protection, or timed scoring.
- Replacing table-game history, changing bot play, or rewriting existing learner data.
- Claims of universal optimal play, proven poker skill, or learning gains from synthetic data.
