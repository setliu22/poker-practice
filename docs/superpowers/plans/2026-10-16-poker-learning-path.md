# Poker Learning Path Implementation Plan

**Status:** Complete. Tasks 1–4c and Task 5 are implemented, verified and independently reviewed. The user removed the separate mobile browser project; the single responsive web app remains.

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
- Keep the interface keyboard-operable for the desktop web app. Verify focus, loading, retry, resume, and feedback visibility. Do not maintain a separate mobile browser project or mobile-specific feature scope.

## Review Focus

1. **Repeated or conflicting answer commands:** exact retry returns the saved feedback with one answer event; same request ID with changed answer conflicts; stale course version is rejected. Cover in Task 2 API tests.
2. **Premature or unsupported disclosure:** unanswered questions contain no answer key or feedback; display acknowledgements are recorded only after the client renders them; feedback acknowledgements do not imply comprehension. Cover in Tasks 2 and 3 API/browser tests.
3. **Partial writes and recovery:** forced failure between answer-event and receipt writes leaves neither accepted; restart and event-based reconstruction preserve the attempt; migration and backup/restore preserve old and new records. Cover in Task 2 tests.
4. **Export stability and deletion:** pagination pins a high-water cursor despite later appends; clear-progress removes the new learning history and receipts while retaining static course content and saved games. Cover in Task 2 tests.
5. **Course correctness and access:** every lesson has 3–5 core exercises plus a separate fresh-transfer check, clear assumptions, honest authored feedback, hidden answers until submission, and keyboard operation. Cover in Tasks 1, 3, and 4 tests.

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

- [x] **Write contract and content tests first.** Added strict answer parsing, stable versions, question/transfer pool shape, pinned grading and public-data privacy assertions.
- [x] **Run `npx vitest run tests/learning-path-content.test.ts`.** RED confirmed the missing contract/content modules; later regression RED exposed an ambiguous preflop-round example.
- [x] **Add the shared contracts** with explicit versions, strict unknown-key rejection, and the interface shapes above.
- [x] **Author the first server-side lesson** on table flow and legal actions, with 3–5 core decisions, two transfer variants, clear assumptions and server-private answer keys.
- [x] **Run `npx vitest run tests/learning-path-content.test.ts`.** Focused suite passed 8/8 after the regression fix; lead and independent reruns passed.
- [x] **Commit only these files** after review: `ac2db44` added the contract/content/tests and `97807c1` corrected the round-completion example.

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

- [x] **Write API and recovery tests first.** Covered migration preservation, acknowledgement order, idempotent retry/conflicts, event IDs, resume, transfer selection, stale content, reconstruction, atomic rollback, export stability, clear and backup/restore.
- [x] **Run `npx vitest run tests/learning-path-api.test.ts tests/data-backup.test.ts`.** RED produced expected missing route/migration failures; focused suite later passed, with fixture corrections recorded in the task report.
- [x] **Add migration 013** with immutable event and exact answer-receipt tables plus update protection.
- [x] **Apply version 13 additively in `openDatabase()`** and verify old lesson, usage, game, installation and cursor data remain intact.
- [x] **Implement the route handlers and event reconstruction.** All planned event facts, retry-safe acknowledgements, ordered question selection and active-instance recovery are covered by API/browser tests.
- [x] **Make answer acceptance atomic.** Answer/feedback events and exact receipt commit together; conflict and forced rollback cases are tested.
- [x] **Implement stable export pagination.** Exports pin a high-water cursor; later events stay outside an in-progress export.
- [x] **Connect explicit recovery.** Backup manifests include both learning tables; path-only and app-wide clear preserve the intended unrelated data.
- [x] **Run `npx vitest run tests/learning-path-api.test.ts tests/data-backup.test.ts`.** The reviewed focused suite passed; later full serial verification passed 403 tests with 2 optional skips.
- [x] **Run `npm run build`** to verify shared types, route wiring and API compilation; build passed.
- [x] **Commit only this task's files** after review: `8306b88` added the API/ledger and `4ae0bfd` corrected latest-missed-skill ordering.

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

- [x] **Write the failing browser flow first.** RED confirmed the course heading was absent on desktop and mobile; the flow covers privacy, feedback, missed-question review, resume, clear confirmation, keyboard use and narrow viewports.
- [x] **Run `npm run test:browser -- tests/browser/learning-path.spec.ts`.** The initial absence check failed as expected; the completed desktop/mobile suite passed.
- [x] **Add the path to `Learn.tsx`.** Beginner progress and next lesson appear first while legacy lessons and advanced practice remain reachable.
- [x] **Implement the first lesson loop.** The client resumes API state, acknowledges displayed content, retries the exact answer command, gates feedback and completes lessons once without speed scoring.
- [x] **Add loading, stale-version, error and retry states** with focus management and keyboard-accessible controls; the fix round preserves retry operations and focus.
- [x] **Implement explicit data controls.** Learner-requested export follows pinned pages; path clear is confirmed; stable event IDs survive retries.
- [x] **Run `npm run test:browser -- tests/browser/learning-path.spec.ts`.** Desktop/mobile browser verification passed, including aborted-response receipt recovery, answer privacy, acknowledgement order, legacy labeling, keyboard, resume and narrow-screen behavior.
- [x] **Run `npm run build`** and the focused learning API suite after integration; both passed.
- [x] **Commit only this task's files** after review: `ff8f881` added the accessible path and `de90358` fixed retry/focus recovery.

### Task 4: Complete the beginner curriculum and deterministic review

**Suggested owner:** Course/content implementer. Own course content and learning-path tests; do not change the ledger API without a separate lead-approved ticket.

**Files:**

- Modify `apps/api/src/learning-path-content.ts`, `tests/learning-path-content.test.ts`, `tests/learning-path-api.test.ts`, and `tests/browser/learning-path.spec.ts`.

**Interfaces:**

- Add lessons to the existing `getLearningPathCatalog()` and lesson lookup/grading functions without changing their signatures or the Task 1 DTOs.
- `LearningPathProgress.reviewSuggestion` is `{ contentId: string; skillId: string; reason: string } | null`; derive it from committed answer-submitted/feedback-generated pairs by selecting the most recent incorrect skill and its lesson, with event cursor and catalog order as deterministic tie-breakers. Return `null` when no incorrect answer exists.
- Repeated lessons use `POST /instances` to create a new instance; never edit or replace an earlier answer event.

- [x] **Extend failing content tests first.** Added catalog-wide contract, independent examples, privacy and transfer-cycle tests.
- [x] **Run `npx vitest run tests/learning-path-content.test.ts`.** RED showed the unfinished units, new examples and transfer cycling were missing.
- [x] **Add hand rankings and the remaining course units:** position/opening choices, pot odds and equity against a visible supplied range, and introductory postflop reasoning. Reused the existing poker hand evaluator, `openingCharts`, and `potOdds` arithmetic; assumptions distinguish authored baselines and conditional calculations.
- [x] **Add deterministic missed-skill review** using the most recent incorrect skill, with catalog-order tie-breaking and a plain-language reason. Transfer selection uses unseen variants before least-presented cycling with authored-order tie breaks. Repeat lessons create new instances; fresh-transfer and engagement counters remain distinct; no mastery threshold is set.
- [x] **Extend the browser flow through all four units.** The desktop/mobile run verified assumptions, resume, new repeat instances, missed-skill selection, transfer freshness/reuse, progress counters and direct access to advanced practice.
- [x] **Run the focused content/API and browser suites.** Lead rerun: 21 API/content tests passed; independent browser tester: 20/20 desktop/mobile cases passed. Builder also reports 403 passed / 2 optional skips and a successful build.
- [x] **Commit only this task's files.** Lead reviewed/staged exactly the four assigned source/test paths; commit `816dc90` (`feat: complete beginner poker curriculum`).

### Task 4b: Surface fresh-transfer evidence in the course UI

**Status:** Approved; see commit `26526a5` and verification evidence in `PROGRESS.md`.

**Suggested owner:** Course UI implementer after Task 4 returns file ownership.

**Files:**

- Modify `apps/web/src/LearningPath.tsx` and `tests/browser/learning-path.spec.ts`.

**Interfaces:** No API, persistence or shared-contract changes. `LearningPathProgress.transferCorrect/transferAttempts` count only fresh transfer outcomes; `LearningPathInstanceState.isFreshTransfer` marks a first-seen variant at presentation.

- [x] **Add failing desktop/mobile assertions first.** Browser RED was 4 expected failures / 18 passes; assertions cover separate zero-state counts, fresh/reused labels and API-matching final fresh results.
- [x] **Implement accessible labels** using the existing progress DTO, region/note semantics, and existing styles; no focus or layout behavior was changed.
- [x] **Run the browser suite and build.** Independent rerun: 22/22 (11 desktop, 11 mobile); builder reports build pass. Full Vitest serial rerun passed 403 / 2 optional skips.
- [x] **Commit only the UI ticket's files.** Lead staged exactly the component and browser spec; commit `26526a5` (`feat: show fresh transfer progress`).

### Task 4c: Recommend and mark the next unfinished lesson

**Status:** Approved after scoped independent re-review and lead commit.

**Owner:** One scoped fix implementer, followed by an independent re-review.

**Files:**

- Modify `packages/shared/src/learning-path.ts`, `apps/api/src/learning-path.ts`, `apps/web/src/LearningPath.tsx`, `apps/api/src/table-routes.ts`, `tests/learning-path-api.test.ts`, `tests/learning-path-content.test.ts`, `tests/browser/learning-path.spec.ts`, and `docs/learning-path.md`.

**Acceptance:** Reconstruct distinct completed content IDs from committed completion events; expose the first unfinished catalog lesson as a deterministic recommendation; show completion markers and an explicit recommended next lesson in the path UI, while keeping every lesson and missed-skill review accessible. Add API and desktop browser regression coverage for completing one lesson, returning/reloading, and seeing the following lesson recommended. Strict schema fixtures and malformed-field assertions cover the additive progress DTO. Correct the two review wording mismatches: restore-manifest validation is conditional on a supplied manifest, and table-decision dataset copy accurately describes the shipped narrow assessment model without implying a general validated detector.

- [x] Write failing progress/browser regression tests first; RED: focused API/content 1 failed / 21 passed and the new browser regression failed for the missing recommendation.
- [x] Implement the additive progress DTO projection and accessible course recommendation/completion states; correct the two factual wording mismatches.
- [x] Run focused API/content tests (22 passed), learning-path browser suite (24 passed across desktop and mobile before the user removed the mobile project), `npm run build`, and serial full suite (404 passed / 2 optional skips).
- [x] Run scoped independent re-review for the recorded whole-branch findings and inspect the amended diff; all three findings were addressed, and no new Critical or Important defects were found.
- [x] Commit only this ticket's exact files after checks/re-review pass.

### Task 5: Document the data contract and verify the full release boundary

**Status:** Complete; documentation and release checks are committed after Task 4c review.

**Suggested owner:** Lead integrator. The lead retains exclusive ownership of `PLAN.md` and `PROGRESS.md`.

**Files:**

- Create `docs/learning-path.md`.
- Modify `README.md`, `VERIFY.md`, `PLAN.md`, `PROGRESS.md`, the approved design scope note, this active implementation plan, `playwright.config.ts`, and the CI browser-step label. The user removed the separate mobile browser project; this changes test execution only, not the single responsive web app.

**Interfaces:** This is a handoff/verification task. It does not change application interfaces or source behavior; the Playwright/CI configuration runs desktop only after the user's scope update.

- [x] **Document the behavior and limits.** `docs/learning-path.md` explains versioning, events, display acknowledgements, receipts, resume/rebuild, exports, backup/restore, clears, legacy rows, local handling and measurement limits.
- [x] **Update setup and verification docs.** README and VERIFY list the path and exact focused commands; local links and referenced test/script files were checked. The Playwright project and CI label now run desktop only as requested.
- [x] **Run the full required checks after the final configuration change:** serial Vitest passed 404 tests / 2 optional skips and build passed after Task 4c; desktop-only full browser suite passed 92/92 after removing the mobile project. Optional GTOpen tests were not run.
- [x] **Review the final diff and dirty tree after Task 4c.** Prettier, staged/unstaged `git diff --check` and exact-path staging passed.
- [x] **Update `PROGRESS.md` with actual outputs only** and mark the plan complete; no user-learning claim is made.
- [x] **Commit only the lead-owned documentation and verification files** after final review: stage the eight remaining files listed above and commit as `docs: describe poker learning path and verification`.

---
