# Poker Learning Path Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship a complete, beginner-first poker course with replayable local learning history, reliable resume and retries, and transparent progress while keeping existing practice modes available.

**Architecture:** Keep authored course content and grading on the API side so answer keys never enter browser responses. Define versioned Zod contracts in `packages/shared/src/learning-path.ts`. Store learner-visible course events and exact answer receipts in an append-only SQLite ledger, reconstruct attempts and progress from those events, and expose a cursor-paginated export. Build the first lesson as a full API-to-UI slice, then add the remaining fundamentals to the same contract. Use direct local queries as the initial projection; add no read-model worker.

**Tech Stack:** Node.js 24, TypeScript, Express 5, SQLite via better-sqlite3, Zod 4, React 19, Vitest, Playwright.

**Spec:** [Poker learning path design](../specs/2026-10-16-poker-learning-path-design.md)

## Global Constraints

- Preserve all existing dirty work and local learner data. Do not reset, clean, or overwrite unrelated files. The lead owns integration and updates to `PLAN.md` and `PROGRESS.md`.
- Keep ordinary practice local and usable without accounts, network access, paid services, background processing, or optional GTOpen. Do not add ML, cloud ingestion, automatic training, generated strategic advice, or streak-based skill claims in this phase.
- Store no learner name, email, or account identity. Treat the installation ID as pseudonymous; record only path/session/instance IDs, learner answers, authored feedback, client display acknowledgements, and necessary event metadata. Keep synthetic experiments separate from human course events.
- Keep answers and grading keys out of pre-submission API responses and browser bundles. Grade only the versioned authored question and learner-visible facts. Do not use hidden cards, deal seeds, later decisions, future board cards, or hand outcome to grade an earlier answer.
- Treat client acknowledgements as reports that the local client displayed a question or feedback, not proof that the learner saw or understood it. Keep submitted answers, authored feedback, displayed-help facts, and any future model outputs as separate event facts.
- New path events are immutable and versioned. Exact answer retries return their saved receipt; request-ID collisions with different payloads and stale content versions conflict. Commit the answer event and exact response receipt in one SQLite transaction; send success only after commit. Explicit learner-requested clearing may delete this ledger.
- Derive progress and missed-skill review from the event history. Keep legacy lesson and answer rows readable and labeled as legacy; never fabricate historical presentation or feedback events.
- Add only versioned SQLite migrations. Preserve table journal/usage contracts, seeded replay, saved-game reconstruction, PreflopR provenance and the optional external-solver boundary.
- Keep the interface keyboard-operable and responsive. Verify focus, loading, retry, resume, feedback visibility, and narrow-screen behavior.

## Review Focus

1. **Repeated or conflicting answer commands:** exact retry returns the saved feedback with one answer event; same request ID with changed answer conflicts; stale course version is rejected. Cover in Task 2 API tests.
2. **Premature or unsupported disclosure:** unanswered questions contain no answer key or feedback; display acknowledgements are recorded only after the client renders them; feedback acknowledgements do not imply comprehension. Cover in Tasks 2 and 3 API/browser tests.
3. **Partial writes and recovery:** forced failure between answer-event and receipt writes leaves neither accepted; restart and event-based reconstruction preserve the attempt; migration and backup/restore preserve old and new records. Cover in Task 2 tests.
4. **Export stability and deletion:** pagination pins a high-water cursor despite later appends; clear-progress removes the new learning history and receipts while retaining static course content and saved games. Cover in Task 2 tests.
5. **Course correctness and access:** every lesson has 3–5 core exercises plus a separate fresh-transfer check, clear assumptions, honest authored feedback, hidden answers until submission, keyboard operation, and no mobile horizontal overflow. Cover in Tasks 1, 3, and 4 tests.

## Tasks

### Task 1: Define the versioned learning contract and first lesson

**Suggested owner:** Course/content implementer. Own only the files listed in this task.

**Files:**

- Create `packages/shared/src/learning-path.ts`.
- Create `apps/api/src/learning-path-content.ts`.
- Create `tests/learning-path-content.test.ts`.

**Interfaces:**

- Export `LearningPathAnswer = { kind: "choice"; choiceId: string } | { kind: "percent"; value: number }`.
- `LearningPathCatalog = { pathId: string; contentVersion: string; title: string; units: { id: string; title: string; lessons: { contentId: string; title: string; skillId: string }[] }[] }`.
- `LearningPathQuestion = { id: string; title: string; prompt: string; skillId: string; answerKind: "choice" | "percent"; choices?: { id: string; label: string }[]; unitLabel?: string; assumptions: string[]; isTransfer: boolean }`.
- `StartLearningInstance = { eventId: string; instanceId: string; sessionId: string; contentId: string; contentVersion: string }`; `LearningPathEventAck = { eventId: string }`; `LearningPathAnswerCommand = { requestId: string; contentVersion: string; answer: LearningPathAnswer }`.
- `LearningPathFeedback = { correct: boolean; correctAnswer: LearningPathAnswer; explanation: string; takeaway: string; skillId: string }`.
- `LearningPathInstanceState = { instanceId: string; sessionId: string; contentId: string; contentVersion: string; title: string; concept: string; intro: string; selectionReason: string; question: LearningPathQuestion | null; questionIndex: number; totalQuestions: number; isFreshTransfer: boolean; feedback: LearningPathFeedback | null; complete: boolean }`.
- `LearningPathProgress = { startedLessons: number; completedLessons: number; resumedLessons: number; answerAttempts: number; transferAttempts: number; transferCorrect: number; activeInstanceId: string | null; bySkill: Record<string, { attempts: number; incorrect: number }>; reviewSuggestion: { contentId: string; skillId: string; reason: string } | null }`.
- `LearningPathEvent` shares `{ cursor: number; eventId: string; schemaVersion: 1; installationId: string; sessionId: string; instanceId: string; contentId: string; contentVersion: string; createdAt: string }` and is a discriminated union with strict payloads: `lesson-opened { questionOrder: string[]; selectionReason: string }`; `lesson-resumed { reason: "reload" | "return" }`; `question-presented { questionId: string; isFreshTransfer: boolean }`; `answer-submitted { questionId: string; requestId: string; answer: LearningPathAnswer }`; `feedback-generated { questionId: string; requestId: string; feedback: LearningPathFeedback }`; `feedback-shown { questionId: string; feedbackEventId: string }`; `lesson-completed {}`.
- Export strict Zod schemas for all command and wire types. `getLearningPathCatalog(): LearningPathCatalog`, `getLessonDefinition(contentId: string, contentVersion: string): LessonDefinition | undefined`, `getPublicQuestion(contentId: string, contentVersion: string, questionId: string): LearningPathQuestion | undefined`, `selectLearningPathTransfer(contentId: string, contentVersion: string, seenQuestionIds: readonly string[]): { questionId: string; reason: string }`, and `gradeLearningPathAnswer(contentId: string, contentVersion: string, questionId: string, answer: LearningPathAnswer): LearningPathFeedback` come from the API content module. `LessonDefinition` stays server-private and contains metadata, 3–5 core questions, at least two transfer variants, answer keys, grading rules, explanations and takeaways.
- Public questions include prompt, choice labels when applicable, skill ID, assumptions, and transfer flag. They never include correct answer, grading rule, or feedback. Each lesson presents 3–5 core questions plus one transfer question selected from its versioned transfer pool. `LearningPathFeedback` may identify the correct response only after submission.

- [ ] **Write contract and content tests first.** Add `it` cases for strict answer parsing, stable path/content versions, 3–5 core questions plus a separate transfer item selected from a pool of at least two, grading under the pinned version, and no answer or grading fields in serialized public data.
- [ ] **Run `npx vitest run tests/learning-path-content.test.ts`.** Confirm it fails because the new contract and content module do not exist.
- [ ] **Add the shared contracts** with explicit versions, strict unknown-key rejection, and the interface shapes above.
- [ ] **Author the first server-side lesson** on table flow and legal actions, with 3–5 core decisions and at least two transfer variants, clear assumptions, and beginner-friendly explanations. Keep answer keys and grading rules private to the API module.
- [ ] **Run `npx vitest run tests/learning-path-content.test.ts`.** Confirm contract, core-question count, transfer selection, grading, and serialization checks pass.
- [ ] **Commit only these files** after the user has approved an implementation method and all checks pass: `git add packages/shared/src/learning-path.ts apps/api/src/learning-path-content.ts tests/learning-path-content.test.ts && git commit -m "feat: define versioned poker learning content"`.

### Task 2: Add the durable event ledger and local learning API

**Suggested owner:** API/data implementer. Own only the migration, API, backup, and test files listed below; coordinate shared contracts with Task 1 before coding.

**Files:**

- Create `apps/api/migrations/013_learning_path.sql`.
- Create `apps/api/src/learning-path.ts`.
- Modify `apps/api/src/database.ts`, `apps/api/src/app.ts`, and `apps/api/src/data-backup.ts`.
- Create `tests/learning-path-api.test.ts` and extend `tests/data-backup.test.ts`.

**Interfaces:**

- Export `learningPathRoutes(db: Database.Database): Router` and mount it at `/api/v1/learning-path`.
- `GET /` returns `LearningPathCatalog`; `GET /progress` returns `LearningPathProgress`; `POST /instances` accepts `StartLearningInstance`; `GET /instances/:instanceId` returns `LearningPathInstanceState`.
- `POST /instances/:instanceId/resumed`, `/questions/:questionId/presented`, `/questions/:questionId/feedback-shown`, and `/complete` accept `LearningPathEventAck`; `POST /instances/:instanceId/questions/:questionId/answers` accepts `LearningPathAnswerCommand` and returns `LearningPathFeedback`.
- `DELETE /progress` clears only path events and receipts. The existing `DELETE /api/progress` also clears this ledger as part of its all-progress transaction.
- `GET /export?afterCursor=<n>&throughCursor=<n>&limit=<n>` returns `{ version: 1, installationId: string, throughCursor: number, events: LearningPathEvent[], nextCursor: number, done: boolean }`. The first page chooses and returns `throughCursor`; later pages must pass it back.

- [ ] **Write API and recovery tests first.** Add `it` cases for v12 migration preservation, acknowledgement ordering, exact retry versus changed-payload conflict, conflicting answer IDs for an answered question, event-ID collision, idempotent resume, unseen transfer selection, stale content rejection, restart reconstruction, receipt-write rollback, high-water export stability, path-only versus all-progress clear, and backup/restore.
- [ ] **Run `npx vitest run tests/learning-path-api.test.ts tests/data-backup.test.ts`.** Confirm new-route/migration cases fail before implementation; preserve current unrelated test state.
- [ ] **Add migration 013** with `learning_path_events` (autoincrement cursor, stable event ID, schema version, installation/session/instance/content identifiers, event type, timestamp, validated JSON payload) and `learning_path_answer_receipts` (request ID, instance/question IDs, canonical payload hash, event cursor, exact response JSON, and a unique instance/question constraint). Add an update-protection trigger; permit deletion only through explicit clear-progress handlers.
- [ ] **Apply version 13 additively in `openDatabase()`** and test that existing lesson, usage, game, installation and cursor records remain intact.
- [ ] **Implement the route handlers and event reconstruction.** Persist lesson-opened (including saved question order and selection reason), lesson-resumed, question-presented, answer-submitted, feedback-generated, feedback-shown and lesson-completed as distinct facts. Deduplicate exact event acknowledgements by event ID and conflict on changed-payload reuse. Require a question-presented event before grading and a feedback-shown event before advancing. Select an unseen transfer variant deterministically from prior presentation events, mark freshness in its presentation event, and reconstruct the same order after restart. Return the most recently opened incomplete `activeInstanceId` from progress so the UI can recover even if its local checkpoint is missing. Count only first-seen transfer answers in transfer performance.
- [ ] **Make answer acceptance atomic.** Validate instance, current question, content version and strict answer. Hash the canonical `{ instanceId, questionId, contentVersion, answer }` payload for request-ID comparison. In one immediate transaction append separate answer-submitted and feedback-generated events plus the exact response receipt. Return saved feedback for the same request ID and payload; return 409 for changed-payload reuse, a second request ID for an answered question, or stale versions. A forced receipt-write failure must roll back both events and return no success.
- [ ] **Implement stable export pagination.** Choose a high-water cursor on the first request, use cursor order, validate page size and cursor bounds, and keep later appends out of the in-progress export.
- [ ] **Connect explicit recovery.** Add both learning tables to the SQLite backup manifest counts. Implement path-only clear and extend the existing confirmed `DELETE /api/progress` transaction to clear learning events and receipts while retaining the source-defined course and saved games.
- [ ] **Run `npx vitest run tests/learning-path-api.test.ts tests/data-backup.test.ts`.** Verify exact replay, collision/stale conflicts, atomic rollback, restart reconstruction, migration preservation, pinned pagination, clear behavior and restored event/receipt counts.
- [ ] **Run `npm run build`** to verify shared types, route wiring and API compilation.
- [ ] **Commit only this task's files** after all checks pass: `git add apps/api/migrations/013_learning_path.sql apps/api/src/database.ts apps/api/src/app.ts apps/api/src/data-backup.ts apps/api/src/learning-path.ts tests/learning-path-api.test.ts tests/data-backup.test.ts && git commit -m "feat: persist replayable learning path events"`.

### Task 3: Build the first lesson as a complete accessible UI slice

**Suggested owner:** Web implementer. Own only the UI and browser-test files listed here.

**Files:**

- Create `apps/web/src/LearningPath.tsx`.
- Modify `apps/web/src/Learn.tsx` and `apps/web/src/styles.css`.
- Create `tests/browser/learning-path.spec.ts`.

**Interfaces:**

- Export `LearningPath()` from `apps/web/src/LearningPath.tsx`; it owns the beginner course flow and calls the Task 2 routes using Task 1 shared DTOs.
- The client uses `GET /api/v1/learning-path`, `GET /progress`, `POST /instances`, `GET /instances/:instanceId`, the question acknowledgement/answer routes above, and `GET /export`.
- Also use `DELETE /api/v1/learning-path/progress` only after confirmation. Keep existing legacy summaries reachable and label them as legacy/incomplete history without merging their counts into the new path progress.
- `POST /instances/:instanceId/resumed` records a client-acknowledged return to an existing incomplete instance. Progress counts that event to measure resumes without treating an open lesson as completed.
- Persist a stable `sessionId`, active `instanceId`, and pending `{ requestId, questionId, contentVersion, answer }` in local storage until the server confirms the answer. Reuse that exact pending object on retry; if the checkpoint is missing, recover `activeInstanceId` from `GET /progress` and reload it from the API.

- [ ] **Write the failing browser flow first.** Cover course landing, hidden feedback before submission, shown feedback after submission, missed-question review, reload/resume, path-only clear confirmation, keyboard-only operation, and a 320px viewport.
- [ ] **Run `npm run test:browser -- tests/browser/learning-path.spec.ts`.** Confirm the new course flow is absent.
- [ ] **Add the path to `Learn.tsx`.** Show beginner progress and the next lesson first while keeping existing authored lessons, walkthroughs and decision practice directly reachable.
- [ ] **Implement the first lesson loop.** Resume API state and append a `lesson-resumed` event when returning to a saved incomplete instance; acknowledge each question after it renders; submit with a stable request ID; retain the answer across transient errors/reload; show feedback only after the answer response; acknowledge feedback after rendering; and record lesson completion once. Do not show a speed score.
- [ ] **Add loading, stale-version, error and retry states** with heading focus after view changes and keyboard-accessible controls. On a stale-version response preserve the entered answer and offer a deliberate reload; on clear-progress dialog close or Escape, return focus to its trigger.
- [ ] **Implement explicit data controls.** Follow all cursor-pinned pages for the learner-initiated JSON download. Add a confirmation dialog for clearing only this path's progress; persist event IDs before sending acknowledgements and reuse those IDs on retry.
- [ ] **Run `npm run test:browser -- tests/browser/learning-path.spec.ts`.** Abort the browser response after `route.fetch()` commits an answer, then verify the same request ID recovers its feedback. Also verify unanswered response/DOM disclosure, event acknowledgement order, legacy-summary labeling, path-only clear confirmation, keyboard operation, resume and no horizontal overflow in desktop and mobile projects.
- [ ] **Run `npm run build`** and `npx vitest run tests/learning-path-api.test.ts` after the integrated UI is in place.
- [ ] **Commit only this task's files** after all checks pass: `git add apps/web/src/LearningPath.tsx apps/web/src/Learn.tsx apps/web/src/styles.css tests/browser/learning-path.spec.ts && git commit -m "feat: add accessible poker learning path"`.

### Task 4: Complete the beginner curriculum and deterministic review

**Suggested owner:** Course/content implementer. Own course content and learning-path tests; do not change the ledger API without a separate lead-approved ticket.

**Files:**

- Modify `apps/api/src/learning-path-content.ts`, `tests/learning-path-content.test.ts`, and `tests/browser/learning-path.spec.ts`.

**Interfaces:**

- Add lessons to the existing `getLearningPathCatalog()` and lesson lookup/grading functions without changing their signatures or the Task 1 DTOs.
- `LearningPathProgress.reviewSuggestion` is `{ contentId: string; skillId: string; reason: string } | null`; derive it from committed answer-submitted/feedback-generated pairs by selecting the most recent incorrect skill and its lesson, with event cursor and catalog order as deterministic tie-breakers. Return `null` when no incorrect answer exists.
- Repeated lessons use `POST /instances` to create a new instance; never edit or replace an earlier answer event.

- [ ] **Extend failing content tests first.** Add an `it` case that iterates the catalog and requires every lesson to have 3–5 core exercises, at least two transfer variants, a skill and assumptions, plus no public answer fields. Add independently checked expected values for hand ranking/legal-action, position/opening, pot odds/equity against a supplied range, and introductory postflop examples.
- [ ] **Run `npx vitest run tests/learning-path-content.test.ts`.** Confirm the unfinished units and review-selection cases fail.
- [ ] **Add hand rankings and the remaining course units:** position/opening choices, pot odds and equity against a visible supplied range, and introductory postflop reasoning. Reuse the existing poker hand evaluator, `openingCharts`, and `read-lesson.ts` arithmetic where applicable; treat charts as authored baselines and range-dependent evaluations as conditional on stated assumptions. Do not copy external chart data.
- [ ] **Add deterministic missed-skill review** using the most recent incorrect skill, with catalog-order tie-breaking and a plain-language reason. Choose an unseen transfer variant when available; after the pool is exhausted, cycle in authored order and mark it as reused. Create a new lesson instance for repeats and keep engagement counts separate from fresh-transfer results. Set no mastery threshold.
- [ ] **Extend the browser flow through all four units.** Verify the recommended next step into existing bot/cash practice, transfer questions, interruption/resume, repeat as a new attempt, missed-skill selection, visible assumptions, progress labels, and direct access to advanced practice.
- [ ] **Run `npx vitest run tests/learning-path-content.test.ts tests/learning-path-api.test.ts`** and `npm run test:browser -- tests/browser/learning-path.spec.ts`.
- [ ] **Commit only this task's files** after all checks pass: `git add apps/api/src/learning-path-content.ts tests/learning-path-content.test.ts tests/browser/learning-path.spec.ts && git commit -m "feat: complete beginner poker curriculum"`.

### Task 5: Document the data contract and verify the full release boundary

**Suggested owner:** Lead integrator. The lead retains exclusive ownership of `PLAN.md` and `PROGRESS.md`.

**Files:**

- Create `docs/learning-path.md`.
- Modify `README.md`, `VERIFY.md`, `PLAN.md`, and `PROGRESS.md`.

**Interfaces:** This is a handoff/verification task. It does not change application interfaces or source behavior.

- [ ] **Document the behavior and limits.** Explain lesson/content versions, event kinds, client-display acknowledgements, idempotent answer receipts, resume/rebuild, cursor-pinned export, SQLite backup, clear behavior, legacy rows, local-only handling, and the distinction between practice engagement and learning evidence. State that spaced scheduling and model evaluation are later phases and the experience is not a validated measure of general poker skill.
- [ ] **Update setup and verification docs.** Add the path and exact focused commands to `README.md` and `VERIFY.md`; confirm each referenced file and command exists.
- [ ] **Run the full required checks:** `npm test`, `npm run build`, and `npm run test:browser -- tests/browser/learning-path.spec.ts`. Report optional solver tests as not run; this feature must work without GTOpen.
- [ ] **Review the final diff and dirty tree.** Run `git diff --check`, `npx prettier --check` on the touched TypeScript/Markdown files, inspect `git status --short`, and confirm no database, export, build, model or test artifacts were added.
- [ ] **Update `PROGRESS.md` with actual outputs only** and set `PLAN.md` to complete only after all acceptance criteria pass. Do not claim user-level learning gains from content or synthetic data.
- [ ] **Commit only the lead-owned documentation files** after checks pass and within the user's authorized scope: `git add docs/learning-path.md README.md VERIFY.md PLAN.md PROGRESS.md && git commit -m "docs: describe poker learning path and verification"`.

---
