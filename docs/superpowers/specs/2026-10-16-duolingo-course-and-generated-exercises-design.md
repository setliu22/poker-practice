# Daily poker course and generated exercises

**Status:** Revised and approved through the user's 2026-10-23 clarification: they already know poker rules and expects Learn / Daily Practice to generate strategy situations. Implementation is in progress.

## Goal

Make Poker Practice feel like a simple daily strategy course: one clear practice session today, visible practice consistency, a navigable path of poker skills, and short review of missed decisions. Generate fresh strategic situations instead of teaching poker rules through a fixed question list. Every answer must be calculated from a pinned chart, exact poker evaluator, or explicit payoff assumptions.

The user already knows poker rules. Strategy practice should still be approachable at different experience levels, but the first-run experience goes straight to decisions. The app remains local and desktop-focused; this work adds no mobile-specific interface or tests.

## Product experience

Keep five direct desktop destinations: Learn, Practice, Play, Progress, and Reference. “Play” is the existing bot table, renamed so its purpose is clear. Keep it directly visible rather than nesting it inside Practice; the user preferred the five-tab mockup because it keeps the app's distinct destinations one click away.

Keep Learn centered on one primary daily strategy practice and a navigable path organized by skill. The daily action resumes an unfinished instance; otherwise it recommends an uncompleted skill or a recent missed skill. Each start generates new scenarios for that skill. Repeating a skill also produces a new seeded situation set. Show one clear action and the completion-derived streak with a compact seven-day activity row. Skill nodes show one concise state; detailed progress stays on Progress. Do not present a fixed list of answerable situations as the course.

Remove the explanatory sentence “Your streak counts days with a completed lesson. It measures practice consistency and does not measure poker skill.” from the Learn card without replacing it with another disclaimer. Keep the visible streak value and seven-day activity markers. The underlying metric remains a count of completed-lesson days and is never used as a poker-skill score.

Move path-specific export and clear controls off Learn into a collapsed “Learning path data” section on Progress. Preserve their narrower scope and confirmation for clearing path history, separate from full-app export and clear-all controls.

Show the current consecutive practice streak with a compact seven-day activity row. A day counts when a lesson-completion event is committed in the learner's selected IANA time zone. The activity row and streak derive from those same completion events. Missing a day may reset the current streak, but it never removes past activity, completed lessons, or learning history. Consistency is not presented as poker skill. The first release adds no streak currency, leaderboard, push reminder, or paid freeze mechanic.

Practice sessions remain short and untimed. Each generated exercise gives immediate feedback only after submission. The session ending highlights completion, revisits missed decisions, and offers an optional short review. Review recommendations derive from recorded mistakes and remain practice recommendations, not mastery claims. Learners can repeat any skill or open other skills without waiting for an unlock.

This follows the useful parts of language-learning course design: a guided path that mixes new work with review, daily practice, and targeted mistake review. Duolingo describes those patterns in its [home path design](https://blog.duolingo.com/new-duolingo-home-screen-design/), [Practice tab](https://blog.duolingo.com/guide-to-duolingo-practice-hub/), and [streak design](https://blog.duolingo.com/how-duolingo-streak-builds-habit/). The design adapts them to poker without copying Duolingo branding or treating streak length as a measure of understanding.

## Exercise generation

Every new daily or skill practice instance receives a freshly generated scenario set from constrained, versioned templates. The skill objectives, coaching, chart provenance, and assumptions remain authored; there is no fixed answer bank. Repeating a skill creates new scenarios. Retrying or resuming the same instance reconstructs its original questions from the saved server seed and generator version.

Each template has a stable template ID and version, a seeded scenario generator, a strict public-question schema, a deterministic answer oracle, and a validation step. The oracle returns the expected answer, grading rule, explanation, takeaway, skill ID, and stated assumptions. The server sends only the current public question before submission; it does not send its answer key, generator seed, or future question set in the ordinary exercise response.

The first generated strategy path covers five skill areas. It skips rules quizzes and standalone hand-ranking lessons. Each skill has multiple question templates and generated values; every action is the best answer under the visible exercise assumptions:

- **Position and preflop decisions:** vary a valid hand and position from pinned chart data and ask what the authored baseline recommends. State that chart agreement does not prove universal optimal play. Do not invent calling, 3-betting, or defense recommendations without validated data for those spots.
- **Pot price and equity:** generate integer pot/call amounts and visible weighted opponent ranges. Calculate exact pot price and conditional range equity. A call/fold choice is graded only when price, range, payout, and no-future-betting assumptions are explicit.
- **Postflop decisions:** generate made-hand, draw, texture, and call-price situations. Use exact card enumeration and state whether the task asks about completion probability, showdown share, or the best all-in action. A completing card is never described as a guaranteed winner.
- **Hand reading and blockers:** provide Hero’s cards, public board/action facts, and a concrete weighted candidate range. Ask which combinations blockers remove, how the surviving range changes, or which share is ahead/tied/behind. The supplied range is a hypothetical model, not a read of a real opponent.
- **Betting and expected value:** show explicit opponent response frequencies and exact payoff outcomes, then ask which listed action has the highest expected chip value. The answer is conditional on those assumptions, not a general recommendation for a real table.

PokerTrainer’s public [quiz page](https://pokertrainer.se/poker-quizzes/) and [tutorial index](https://pokertrainer.se/poker-tutorials/) inform these high-level strategic formats. Adapt exercise patterns only; do not copy PokerTrainer wording, questions, charts/ranges, images, branding, or claims. The app grades only from its own versioned charts, visible generated facts, deterministic evaluators, and explicitly stated payoff assumptions.

Generation is constrained randomness, not an LLM composing poker advice. Every graded item must have one unambiguous answer under its stated assumptions. The generator must reject invalid card collisions, impossible scenario parameters, duplicate answer choices, missing correct options, zero/invalid remaining ranges, and scenarios whose assumptions do not match their oracle. Percent questions use exact stored values and an explicit tolerance; answer display may round while grading remains based on the stored value. Keep the lesson objectives and feedback authored while varying scenarios. Prefer the largest set of exercise types that meets these correctness and provenance requirements; do not add an ungrounded strategy type merely to increase variety.

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
- Check each strategy oracle against the existing poker evaluator, range-combo normalization/comparison, exact pot-odds/equity calculations, pinned chart source, and displayed response payoffs. Include blocker removal, empty-after-blocker ranges, weighted range matchups, valid call prices, draw outcomes, and EV ties.
- Exercise content-version compatibility: old instances can be loaded, answered, resumed, exported, backed up, and restored with the same old rules. New starts are pinned to the new generator version.
- Verify API privacy and consistency: no answer key or seed in unanswered-question responses; one accepted event per answer; exact retries recover the stored receipt; conflicting IDs and stale revisions fail safely; and failed generation/answer transactions leave no partial progress.
- Verify seven-day activity and streak reconstruction across local midnight, time-zone changes, and daylight-saving transitions. Confirm it is computed from completion events and does not merge with generated-scenario performance.
- Add desktop browser coverage confirming the Learn streak disclaimer is absent while the streak and activity row remain; cover daily start/resume, generated question submission and feedback from the new lesson, reload/retry stability, mistake review, keyboard access, and loading/error states. Do not run mobile-specific tests.
- Run focused learning-path/API tests, the relevant full serial test suite when practical, `npm run build`, formatting checks on changed files, and `git diff --check`. Use isolated test databases; never use learner data for destructive verification.

Success is demonstrated by reproducible generated variety across the five strategy skills and their supported exercise formats, no fixed rules curriculum, deterministic grading with no invalid or ambiguous cases in the tested domain, reliable resume/retry, preserved old event replay, and locally derivable practice-use summaries. Engagement counts and generated-question performance remain separate, and numerical retention or learning targets are set only after collecting a baseline.

## Non-goals

- Mobile-specific UI, tests, or compute.
- Accounts, cloud sync, automatic telemetry uploads, or a new analytics service.
- LLM-generated poker questions or advice, ML grading, retraining, or solver dependence.
- XP economies, competitive leaderboards, paid streak protection, or timed scoring.
- Replacing table-game history, changing bot play, or rewriting existing learner data.
- Claims of universal optimal play, proven poker skill, or learning gains from synthetic data.
