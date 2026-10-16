# Poker learning path design

**Status:** The user approved the curriculum-first direction and the three design sections on 2026-10-16. This written spec is awaiting user review. No implementation is authorized yet.

## Goal

Make Poker Practice feel like a guided, rewarding course for improving at poker. Serve newer and experienced players through a beginner-first path that moves from fundamentals into the app's existing decision practice. Preserve useful learning history locally from the first lesson so progress, future evaluation and carefully gated personalization have reliable evidence.

## Context

The app already has short authored lessons, randomized preflop walkthroughs, generated river decisions, online cash practice, bot tables, an append-only hand journal, local bot-table usage events, JSON export and SQLite backup/restore. The learning path should connect these capabilities without forcing experienced learners through basics or disrupting existing practice.

The current `usage_events` ledger is tied to bot table IDs. Existing lesson answers live in separate legacy tables and do not share a generic lesson event stream. The first learning path needs versioned course events while leaving old data readable and preserving the existing table-game journal and usage contracts.

## Learners and experience

The first path is beginner-first, with an advanced continuation for people who already know the rules. A learner can always open existing practice modes directly; course progression recommends a next step without locking away the rest of the app.

The path introduces one concept per lesson. Its initial progression is:

1. Table flow, legal actions and hand rankings.
2. Position and opening choices.
3. Pot odds and equity against an explicitly supplied range.
4. Postflop decisions and reasoning.
5. Existing bot and cash decision practice for more realistic, conditional situations.

A lesson gives a short explanation, three to five practice decisions, immediate feedback after submission, and a review of missed ideas. Answers and explanations remain hidden until the learner submits. Practice has no speed score. Content states its assumptions and source; chart agreement, authored teaching answers and conditional bot forecasts are described as such, not as universal optimal strategy.

Progress distinguishes engagement from demonstrated understanding. The MVP records completed lessons, attempts, error categories and performance on fresh transfer questions. If a daily goal or streak is added, it describes practice consistency only and stays separate from skill evidence. Do not set a mastery cutoff until a baseline has been observed. Current legacy summaries remain available and are identified as legacy where their event history is incomplete.

## Learning event and state design

Add a local learning ledger independent of the existing bot-table usage ledger. It is the durable record for the new path. An event has a stable event ID, schema version, local installation ID, session ID, lesson-instance ID, content ID and version, event type, timestamp and validated payload. A monotonic per-database cursor provides stable export pagination and event ordering. Event types cover lesson opening, question presentation, answer submission, feedback display and lesson completion; later review scheduling can add a versioned event type.

Question presentation and feedback display are recorded only after a client acknowledgement. Those facts mean the local client reported the content as displayed; they do not prove a human read or understood it. Requested assistance, displayed assistance, the learner's answer, authored teacher feedback and model predictions remain separate facts. Missing or late display events remain unknown rather than being inferred.

The server keeps the exact versioned lesson specification needed to grade and replay an attempt. Before submission, API responses omit correctness and feedback. Each answer command carries a stable request ID. The API strictly validates the request and content version, grades deterministically, then commits the immutable answer event and its exact response receipt in one SQLite transaction. An exact retry returns that saved response. Reuse of the ID with a different payload returns a conflict. A stale lesson version returns a conflict so the client can reload; it is never silently graded against newer content. The browser retains the same request ID and entered answer for a retry after a transient failure.

Progress summaries and review queues are derived read models. They can be recomputed from the ledger and are not independent sources of truth. The MVP can calculate them directly from the small local event history; add a materialized projection only if measured local query cost warrants it. No background worker is needed for grading, progress or the initial review rule.

Existing schemas and records remain intact. Do not backfill views, displayed assistance or session boundaries that were never recorded. Existing answers may appear as legacy progress, but they must remain distinguishable from versioned new-path events. Replay uses the stored lesson/content version and attempt provenance; repeating a question creates a new attempt rather than overwriting the first answer.

## Persistence, export and privacy

Ordinary practice stays local, works without an account or internet, and makes no automatic uploads. The app stores no learner name, email or other account identity for this feature. An installation ID is pseudonymous, not anonymous; exports remain under the user's control. The ledger records only the learner-visible situation reference/version, their response, the feedback actually shown, relevant assistance state, and necessary timing/session metadata. It does not use hidden opponent cards, an actual future runout, a deal seed, later decisions or hand outcome to assess an earlier answer.

Include new learning events in an explicit versioned JSON export, ordered by cursor with a frozen upper cursor for multi-page exports. Stable installation/event IDs support deduplication in a user-controlled copy. Full SQLite backups include the learning ledger and use the existing validated backup path. Clearing learning progress requires confirmation, removes its events and derived summaries, and preserves course content and saved games. Existing downloaded copies remain user-owned files. No historical event is deleted silently or represented as a synthetic learner event.

Synthetic bot experiments, real learner behavior, authored teacher labels and model predictions stay separate in exports and analyses. No automatic training or remote ingestion is part of the MVP. Any later hosted collection must be explicit opt-in, explain what is shared, preserve deletion behavior and isolate learner identities.

## API, transaction and recovery behavior

The local API owns lesson-version validation, grading, event writes, idempotency receipts and progress reconstruction. A successful answer response is sent only after the transaction commits. If persistence fails, no accepted-answer response is returned; the client keeps the answer and request ID for an exact retry. If the commit succeeds but the response is lost, that retry recovers the original feedback without duplicating the attempt. A conflicting retry or stale content version reports a clear conflict and lets the learner refresh without losing entered work.

After restart, the course reloads the active attempt and derives progress from committed events. A damaged or missing read model is rebuilt from the event stream. If the event stream itself fails integrity checks, surface the error and retain normal backup/recovery choices; do not silently rewrite history. SQLite migrations are additive/versioned and preserve all existing lesson, game, usage, replay and receipt data.

## Product phases

### Phase 1: first complete beginner path

Ship one usable end-to-end path with versioned lessons, answer/feedback flow, local resume, learner progress and durable learning events. Reuse existing authored practice where its assumptions fit. Start with transparent deterministic lesson selection and missed-skill review. Keep existing advanced practice reachable. Do not add ML, accounts, cloud sync or background analysis.

### Phase 2: spaced practice and short workouts

Use saved skill and attempt results to build deterministic spaced reviews and short mixed sessions. Store enough versioned selection context to reproduce or explain why a review was chosen. Keep practice consistency measures separate from transfer performance. Define numerical retention and learning targets after observing a baseline.

### Phase 3: optional model evaluation

Consider supervised personalization only after there are enough real, opt-in learner records, independently labeled examples and coverage across learners and situations. One learner's local history can personalize that learner's review, but cannot establish a general human leak detector. Any cross-learner study requires explicit opt-in ingestion. Use predeclared evaluation rules and holdouts grouped by learner and scenario to prevent leakage. Compare against the deterministic review rule, evaluate calibration and abstention, and do not ship if it fails to improve the baseline safely. A model prediction never becomes its own ground truth; wins/losses do not label decisions.

## Success measures

The first release records local measures for path starts, lesson completion, interrupted/resumed lessons, repeat practice and performance on fresh transfer questions. Report engagement and learning evidence separately. Learning measures describe performance on this app's stated situations and assumptions, not general poker skill.

Reliability acceptance for the first release is exact: every accepted answer has one durable event; exact retries create no duplicate; conflicting reuse cannot overwrite it; progress rebuild matches committed events; and a failed transaction cannot leave a partial answer or progress update. New and existing data survive schema upgrade and full backup/restore. These controls are verified with unit/API tests and browser flows for resume, keyboard use, narrow screens, hidden answers, loading errors and retry behavior. Numeric product targets are set only after a baseline is collected.

## Non-goals for the first release

- Hosted accounts, cross-device sync, automatic uploads or an analytics service.
- Model-selected lessons, automated retraining, chat-based coaching or generated strategic claims.
- Competitive leaderboards, real-money play, timed scoring or a streak presented as skill.
- Replacing the existing table journal, changing poker policy behavior or rewriting historical records as if complete telemetry existed.
- Claiming solver optimality, universal poker skill or learning gains from synthetic challenge data.

## Project constraints

- Preserve public-information boundaries, seeded replay, old saved-game reconstruction, versioned migrations and transaction/idempotency behavior.
- Keep normal practice local, usable without optional services, responsive and accessible by keyboard.
- Keep answers hidden until submission and distinguish exact arithmetic, authored assumptions, sampled estimates and conditional forecasts.
- Retain existing PreflopR provenance/licensing; do not copy unverified commercial charts or bundle unresolved GTOpen software.

## First implementation boundary

The first implementation plan should deliver one complete, intentionally small beginner course: table flow and hand rankings, position and opening choices, pot odds and equity, and an introductory postflop decision unit. Build its first unit as an end-to-end slice, then add the remaining units on the same lesson/event contracts. Include versioned exercise/answer handling, immutable local learning events, rebuildable progress, explicit export/backup coverage, and accessible resume/error states. Leave existing advanced practice directly available, keep legacy records readable, and include migration, API and browser verification. Spaced scheduling and ML evaluation are later phases after this course works end to end.
