# Daily Poker Course and Generated Exercises Implementation Plan

**Goal:** Make Learn a strategy-first daily practice path. Each daily or path-selected session generates fresh, deterministically graded poker decisions and preserves their provenance in the local event ledger. The user already knows poker rules; new practice does not teach basic rules or hand rankings.

**Architecture:** Preserve authored content version 1 for saved attempts and add generated content version 2 behind the existing API content boundary. The server creates a per-instance exercise seed, rebuilds the same versioned scenarios from the event ledger, and stores versioned provenance in the append-only SQLite events. The React Learn page consumes the current course/progress contracts; the local event ledger remains the source of truth.

**Tech Stack:** Node.js 24, TypeScript, Express 5, SQLite via better-sqlite3, Zod 4, React 19, Vitest, Playwright.

**Spec:** [Daily poker course and generated exercises](../specs/2026-10-16-duolingo-course-and-generated-exercises-design.md)

## Global Constraints

- Keep ordinary practice local and usable without accounts, network calls, paid services, or optional GTOpen. Do not add mobile-specific UI or tests.
- Preserve content version 1 and all old event payloads; new generated lessons use content version 2 and event schema version 2. Never rewrite or relabel historical events.
- Generate scenarios from server-created unsigned 32-bit exercise seeds. The same content, generator/template versions, and seed reproduce identical prompts and answers; a new instance receives a new seed.
- Keep seeds and grading keys out of unanswered-question responses. Public questions contain only the current prompt, choices/input, assumptions, and transfer status.
- Validate generated cards, ranges, amounts, choices, assumptions, and answers before committing a lesson-open event. Every graded question has one answer under its displayed assumptions.
- Keep poker table deal seeds, hidden opponent cards, future runouts, later observations, and completed-hand hindsight out of course generation and grading.
- Preserve transaction safety, immutable event history, exact idempotent retries, conflict behavior, and existing local export/backup/clear contracts.
- Keep authored chart provenance and label chart agreement, exact arithmetic, and conditional ranges honestly. A generated answer is the best action under visible exercise assumptions, not universal strategy or a poker-skill score.
- Keep usage records local and explicitly exportable. Do not add automatic uploads, model training, LLM-authored answers, or a new analytics service.
- Preserve keyboard access, dialog dismissal and focus return, and clear loading, retry, stale, and error states.
- Preserve the current worktree's pre-existing UI changes in `apps/web/src/Learn.tsx`, `apps/web/src/LearningPath.tsx`, `apps/web/src/PreflopWalkthrough.tsx`, `apps/web/src/CashPractice.tsx`, `apps/web/src/main.tsx`, `apps/web/src/styles.css`, and their browser specs. Extend the approved desktop UI baseline; do not reset or stage unrelated changes.

## Review Focus

1. **Generated scenario validity:** every tested seed produces collision-free cards, legal amounts and ranges, unique choices, one best answer under visible assumptions, and exact arithmetic; cover in Task 1.
2. **Seed and answer privacy:** generated seeds and grading keys never appear in ordinary lesson-state responses; content-version 1 remains readable; cover in Tasks 1–2.
3. **Retry and partial-write behavior:** identical start/answer retries return their committed state, changed IDs conflict, and invalid generation leaves no event; cover in Task 2.
4. **Migration continuity:** upgrading version-13 storage preserves old event bytes, cursors, receipts, indexes, triggers, and the next cursor; cover in Task 2.
5. **Calendar and interface behavior:** the seven-day row uses seven local calendar dates across DST, shows committed completions only, and remains keyboard-readable; cover in Tasks 2–3.

---

## Task 1: Add versioned, strategy-only generated practice content

**Suggested owner:** Shared-contract and course-content implementer. Own only the files below. Complete this contract before assigning Task 2 or Task 3.

**Files:**

- Modify `packages/shared/src/learning-path.ts`.
- Create `apps/api/src/learning-path-generated.ts`.
- Modify `apps/api/src/learning-path-content.ts`.
- Modify `tests/learning-path-content.test.ts`.

**Interfaces:**

- Keep `getLearningPathCatalog(): LearningPathCatalog`, with the returned current catalog using `contentVersion: "2"`.
- Extend the strict event schema to parse existing schema-version-1 events unchanged and schema-version-2 events. Version-2 `lesson-opened` payloads are `{ questionOrder: string[]; selectionReason: string; entryPoint: "daily-recommendation" | "path-selection" | "review" | "repeat"; exerciseSeed: number; generatorVersion: string }`, where the seed is an integer from 0 through 4294967295. Version-2 `question-presented` payloads add `{ isTransfer: boolean; scenarioFingerprint: string; templateVersion: string }` to the existing `questionId` and `isFreshTransfer` fields; `scenarioFingerprint` is 64 lowercase hexadecimal characters. The other event payloads keep their existing fields. Require the version-2 metadata when parsing schema-version-2 events and reject it on schema-version-1 events. Keep event schema version independent of content version so future content can reuse schema version 2.
- Add optional `entryPoint: "daily-recommendation" | "path-selection" | "review" | "repeat"` to `StartLearningInstance`. Require it for new content-version-2 starts while continuing to parse existing version-1 start commands without it.
- Add `recentPracticeDays: { date: string; completed: boolean; today: boolean }[]` to `LearningPathProgress`; `date` is a valid `YYYY-MM-DD` calendar date, the list has exactly seven entries ordered oldest to newest, and only the final entry has `today: true`.
- Export `generateVersion2Lesson(contentId: string, exerciseSeed: number): LessonDefinition | undefined` from `apps/api/src/learning-path-generated.ts`. Reuse the server-private `LessonDefinition` shape from `learning-path-content.ts` through a type-only import.
- Extend `getLessonDefinition(contentId: string, contentVersion: string, exerciseSeed?: number): LessonDefinition | undefined`, `getPublicQuestion(contentId: string, contentVersion: string, questionId: string, exerciseSeed?: number)`, and `gradeLearningPathAnswer(contentId: string, contentVersion: string, questionId: string, answer: LearningPathAnswer, exerciseSeed?: number)`. Version 1 continues to resolve the existing static definitions; version 2 requires a valid seed and resolves its deterministic generated definitions.
- Extend `selectLearningPathTransfer(contentId: string, contentVersion: string, seenQuestionIds: readonly string[], exerciseSeed?: number): { questionId: string; reason: string }` so version 2 transfer template IDs are selected from the same seeded lesson definition used to build `questionOrder`.
- Export `getScenarioFingerprint(contentId: string, contentVersion: string, exerciseSeed: number, questionId: string): string | undefined`. For version 2, return a lowercase SHA-256 hex digest over the generator version, template version, and canonical public scenario fields. Do not include the answer key in public data.

- [ ] **Step 1: Write failing generator and contract tests.** Add tests named `generates version 2 lessons deterministically from a seed`, `varies scenarios across the fixed seed set`, `rejects invalid generated seeds and impossible scenarios`, `grades every generated question under its displayed assumptions`, `keeps generated answers and seeds private`, and `continues to resolve content version 1`. Across seeds 0–255 for each strategy lesson, assert replay equality, meaningful scenario variety, legal non-colliding cards, valid strict DTOs, distinct choices with exactly one oracle-backed best answer, exact percentage grading within 0.1 percentage point, the four accepted entry points, and unchanged version-1 replay. Independently recompute generated examples from visible facts: chart baselines from `openingCharts`, call prices with `potOdds`, range equity with `equity`, draw outcomes from the unseen card set, blocker removal from the supplied combo list, and bet EV from displayed response frequencies.
- [ ] **Step 2: Run the focused tests and confirm they fail for the missing version-2 generator/contracts.**

Run: `npx vitest run tests/learning-path-content.test.ts`

Expected: the new version-2 and event-contract tests fail because the generator and version-2 schemas do not exist yet; existing version-1 tests still pass.

- [ ] **Step 3: Define the version-2 DTOs and deterministic generator.** In `learning-path-generated.ts`, expose versioned strategy skill IDs with stable question/template IDs and template version `"1"`. Generate 3–5 core questions per skill and at least two transfer templates, selecting a transfer for each instance. New content covers chart-backed position/opening choices, pot-price and range-equity decisions, postflop draw decisions, opponent-range hand reading and blockers, and bet/value EV under explicit response assumptions. Do not include rules quizzes or standalone hand-ranking lessons. Keep concept, coaching, explanations, takeaways, and assumptions authored. Reject invalid seeds, card collisions, impossible contexts, duplicate choices, missing best answers, and any oracle/template mismatch before returning a lesson. Preserve all existing static definitions as content version 1 for old attempts.
- [ ] **Step 4: Run the focused tests and confirm deterministic generation and version-1 compatibility.**

Run: `npx vitest run tests/learning-path-content.test.ts`

Expected: all content tests pass, including the fixed-seed matrix, public-answer privacy, and existing version-1 grading fixtures.

## Task 2: Persist generated provenance and reconstruct lessons transactionally

**Suggested owner:** API and SQLite implementer. Own only the migration, route, database loader, and tests listed below. Start after Task 1's contract is reviewed.

**Files:**

- Create `apps/api/migrations/014_learning_path_schema_v2.sql`.
- Modify `apps/api/src/database.ts`.
- Modify `apps/api/src/learning-path.ts`.
- Modify `tests/learning-path-api.test.ts`.
- Modify `tests/data-backup.test.ts`.

**Interfaces:**

- Keep `learningPathRoutes(db: Database.Database, nextExerciseSeed?: () => number): Router`; the production default returns `randomInt(0, 2 ** 32)`, and tests may inject a deterministic or invalid seed source.
- New starts from the current catalog create schema-version-2 events. The `lesson-opened` payload stores the user's entry point, server-selected seed, and generator version; each presentation stores whether the question is a transfer, its scenario fingerprint, and template version. Existing version-1 instances continue to reconstruct and accept answers using their original static content.
- State reconstruction, public-question lookup, and grading resolve the open event's seed internally. They never add it to `LearningPathInstanceState` or `LearningPathQuestion`.
- Version-2 transfer freshness compares the scenario fingerprint with prior presentation events for the same lesson/content version. Version-1 freshness retains its existing question-ID behavior.
- The progress projection returns the seven local calendar-day flags using the request's validated IANA timezone, ordered oldest through today. Keep `completedToday` and `currentStreakDays` derived from the same committed completion events.

- [ ] **Step 1: Write failing API, migration, and backup tests.** Add cases named `stores a server seed once and exact start retries reconstruct the same generated instance`, `uses a unique exercise seed for each new instance`, `records the selected entry point and rejects changed start retries`, `rebuilds generated questions after restart without returning the seed`, `records stable scenario fingerprints and derives transfer freshness from them`, `rolls back a lesson start when generated content is invalid`, `projects seven completion dates in the requested timezone across DST`, `migrates version-13 events and receipts without changing cursors`, and `backs up and restores version-2 learning events`. Assert that unanswered instance JSON has no seed, answer, explanation, or grading fields; exact start retries do not call the seed source twice; a repeated seed source selects another unused seed; new v2 events retain their schema/content/template versions and entry point; old v1 rows and answers still replay; failed generation writes no event; and the next cursor after migration exceeds the preserved high-water cursor.
- [ ] **Step 2: Run focused API and backup tests to confirm the new cases fail.**

Run: `npx vitest run tests/learning-path-api.test.ts tests/data-backup.test.ts`

Expected: the new v2 provenance, seven-date, migration, and recovery assertions fail before implementation; existing v1 ledger, retry, and backup tests pass.

- [ ] **Step 3: Add migration 014 and load it from `database.ts`.** Drop the existing immutability triggers, create replacement event/receipt tables with the event `schema_version IN (1,2)` constraint and receipt foreign key pointed at the replacement events, copy every event column (including explicit cursors and JSON payload text) and receipt byte-for-byte, drop the old receipt/event tables, rename the replacements, then restore the instance index and immutability triggers. Record migration 14 and leave versions 1–13 unchanged.
- [ ] **Step 4: Implement seeded start, event reconstruction, fingerprinting, and seven-day projection in `learning-path.ts`.** After idempotency checks, choose a seed unused by any prior version-2 `lesson-opened` event in the local ledger; if the injected/random source repeats an existing seed, select the next unused uint32 value, wrapping at 4294967295. Construct and validate the generated lesson before appending `lesson-opened`, and map generation failures to a retryable response with no partial writes. Persist the caller's validated entry point and v2 events, resolve questions and answer keys from the seed on every read/retry, keep the seed absent from normal responses, compare v2 transfer fingerprints, and derive the seven dates from calendar ordinals rather than subtracting 24-hour durations.
- [ ] **Step 5: Run focused API and backup tests to verify migration, privacy, replay, idempotency, DST, and rollback.**

Run: `npx vitest run tests/learning-path-api.test.ts tests/data-backup.test.ts`

Expected: all focused tests pass; version-1 records and receipts are unchanged, and version-2 starts resume the same generated scenarios after restart.

## Task 3: Refine the desktop learning flow and navigation

**Suggested owner:** Web UI implementer. Own only the UI, browser tests, and current product documentation listed below. Start after Tasks 1–2 expose the final DTOs and API behavior.

**Files:**

- Modify `apps/web/src/LearningPath.tsx`, `apps/web/src/main.tsx`, and `apps/web/src/styles.css`.
- Modify `tests/browser/learning-path.spec.ts`, `tests/browser/preflop.spec.ts`, `tests/browser/event-history.spec.ts`, `tests/browser/fast-assessment.spec.ts`, `tests/browser/decision-rating.spec.ts`, `tests/browser/draw-density.spec.ts`, `tests/browser/reset-hand.spec.ts`, `tests/browser/assistant.spec.ts`, `tests/browser/recommendation.spec.ts`, `tests/browser/compact-table.spec.ts`, `tests/browser/bots.spec.ts`, `tests/browser/ranges.spec.ts`, and `tests/browser/deal-modes.spec.ts`.
- Modify `README.md`, `docs/learning-path.md`, `docs/event-sourcing.md`, and `docs/usage-data-design.md`.

**Interfaces:**

- Change the top-level page key and visible navigation label from `"Bot table"` to `"Play"`; `Play` continues to render `BotPractice`, whose page heading and inner view labels remain `Bot table`.
- Export `LearningPathDataControls({ onChange }: { onChange: () => Promise<void> })` from `LearningPath.tsx`. Mount it inside a collapsed `Learning path data` disclosure in the Progress page and call `onChange` after a successful clear. Keep full-app export and clear-all controls separate.
- Render `LearningPathProgress.currentStreakDays` and `recentPracticeDays` beside the daily action as a compact streak label and seven chronological, accessible day markers. A marker's accessible name includes its date and completed/not-completed state; use the returned `today` flag for the current-day label.
- Keep one daily lesson action. Call `start(contentId, entryPoint)` with `daily-recommendation` from the daily card, `path-selection` from an uncompleted path row, `repeat` from a completed row, and `review` from the missed-ideas action. Each path row shows its lesson title and one concise state; do not repeat visible Start/Repeat copy beside the whole-row action. Preserve informative accessible names such as `Start <lesson title>` and `Repeat <lesson title>`.

- [ ] **Step 1: Update browser tests for the approved copy and layout.** In `learning-path.spec.ts`, add assertions for the seven recent practice days, the single daily action, concise course-row states, direct Play navigation, and path data controls only inside Progress. Update existing clear/download tests to expand `Learning path data` and preserve cancel, retry, and focus-return behavior. Change only top-level Bot table navigation locators in the other listed specs; keep assertions for the BotPractice page heading unchanged.
- [ ] **Step 2: Run the focused browser suite and confirm the new UI assertions fail.**

Run: `npm run test:browser -- tests/browser/learning-path.spec.ts`

Expected: the new recent-day, Progress disclosure, and Play navigation assertions fail before the UI changes; the runner lists only the desktop project.

- [ ] **Step 3: Implement the compact Learn page and scoped Progress controls.** Add the seven-day activity row using the API dates and streak; remove redundant explanation/status strings; keep each lesson's button label accessible without duplicating visible action copy. Extract the path export and confirmed clear controls into `LearningPathDataControls`, mount them in the collapsed Progress disclosure, and refresh progress after deletion. Keep app-wide export and clear-all behavior distinct.
- [ ] **Step 4: Rename the visible main-nav destination to Play and update only current product guidance.** Keep all five tabs directly visible. Update README and current learning-path/event/usage instructions to call the destination `Play (bot table)` where needed; retain `Bot table` as the heading inside the page and in historical design documents.
- [ ] **Step 5: Run focused desktop browser coverage and verify keyboard/focus behavior.**

Run: `npm run test:browser -- tests/browser/learning-path.spec.ts`

Expected: the learning path and Progress flows pass, including date labels, keyboard navigation, disclosure controls, clear cancellation/retry, and focus return.

## Integrated review and verification

After Tasks 1–3 are integrated, the lead runs an independent code review and a separate functional browser verification against the final tree. Give the reviewer read-only access and the functional tester desktop-only browser scope. Resolve findings in the owning ticket and rerun affected checks.

- [ ] Run `npx vitest run tests/learning-path-content.test.ts tests/learning-path-api.test.ts tests/data-backup.test.ts`.
- [ ] Run `npm test -- --maxWorkers=1` using isolated test databases.
- [ ] Run `npm run build`.
- [ ] Run `npm run test:browser`; confirm Playwright lists and executes the desktop project only.
- [ ] Run Prettier checks on the exact changed source/test/documentation paths and `git diff --check`.
- [ ] Inspect the integrated diff and update `PLAN.md`/`PROGRESS.md` with actual evidence, limits, branch/commit, preserved dirty work, and the next action. Do not publish or stage local learner data, dependencies, build output, or test artifacts.

**Definition of done:** Learn / Daily Practice starts with strategy-only generated variations; the skill path does not teach poker rules; unambiguous oracle-backed grading; version-1 attempts still replay; exact retries and rollback remain reliable; local usage and generator provenance can be reconstructed/exported; seven-day activity derives from committed events; the existing five-tab navigation and concise desktop Learn/Progress screens pass accessibility and desktop browser checks; and the integrated code review has no unresolved blocking findings.
