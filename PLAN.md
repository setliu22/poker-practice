# Active plan

## Strategy-first daily practice — 2026-10-23 (complete)

User corrected the product direction: they already know poker rules and want Duolingo-style strategy practice with generated situations and a defensible best answer. Lead owns plan/handoff and integration. Build on the approved generated-exercises design, but make the current Learn / Daily Practice flow use server-seeded strategic scenarios rather than the current fixed foundations quiz. Keep version-1 lessons/events replayable for existing progress; new daily/path/review starts generate varied strategy questions, with saved generator provenance and usage events. No rules curriculum, no plugins, no mobile product, no learner-data reset.

Acceptance: Learn begins with generated strategy practice; the user sees position/opening, price/equity, postflop draws, hand reading/blockers, and value/EV situations as supported by exact local oracles and visible assumptions. “Best” means best under stated assumptions, not universal poker strategy. Every new instance is reproducible on retry/reload, unique across normal starts, answer keys stay private until submission, events remain locally exportable, and legacy version-1 history remains readable. Strategy skills form the path; exercise situations are generated.

Plan: `docs/superpowers/plans/2026-10-16-duolingo-course-generated-exercises.md` updated to reflect this correction. Generator and API work is integrated: five stable strategy skills drive fresh seeded situations; daily recommendations and review/repeat starts use the generator; saved answers reconstruct from seed and version; unsupported saved generators fail clearly; scenario freshness ignores generated slot IDs. Migration 014 preserves old events, receipts, and cursor high-water. The Learn page exposes the stable skill path and daily generation. Scoped independent review issues were fixed and regression-tested. Simulator requests now display a recovery message for incomplete responses instead of surfacing the browser's JSON parser exception. Final serial unit suite passed 434 tests with 2 optional skips; focused content/API/backup suites passed 58/58; desktop generated-course browser suite passed 21/21; simulator browser suite passed 18/18; TypeScript, Vite, API and worker production builds passed; `/api/health` returned `ok`; `git diff --check` passed. User data was not reset and no external publishing occurred.

## Navigation formatting fix — 2026-10-19 (complete)

Lead owns styles.css and learning-path.spec.ts for screenshot's crowded top navigation. Replace content-sized flex wrapping with equal columns at narrower desktop-panel widths; standardize icon/label spacing and keep each label within its button. Preserve wide sidebar. Add one resize geometry regression, inspect screenshot, run focused desktop course suite/build/format checks. No plugins, no mobile project or learner-data changes.

Done: equal navigation columns and fixed icon tracks prevent crowded labels; two columns below700px, five through1000px, existing wide sidebar preserved. Regression reproduced label overflow before the fix and passes at300/320/480/640/800/1280px. Corrected screenshot inspected; final desktop course suite20/20 and production build passed. Lead self-review complete.

## Narrow-panel formatting fix — 2026-10-19 (complete)

Lead owns styles.css and learning-path.spec.ts. Daily card's auto-sized status column consumes a narrow browser panel, and overflow-wrap breaks the remaining heading character by character. Reproduce with one desktop-browser resize regression; stack the card by its available container width, preserving the wider layout. Verify narrow/wide heading, CTA containment, screenshot, focused desktop course suite and build. This specifically requested panel-width fix does not add a mobile product or enable excluded mobile table suites. No plugins; preserve prior dirty work/data.

Done: course container query stacks heading/status/lesson/CTA below620px available width. Regression reproduced a zero-width heading before the fix; heading dimensions/button containment now pass at320/480/640/1280px. Inspected corrected narrow screenshot. Final desktop course suite19/19 and build passed; self-reviewed small CSS change. No further work for this bug.

## Copy cleanup — 2026-10-19 (complete)

User rejects conversation-derived decoration and redundant labels. Lead owns main.tsx, LearningPath.tsx and styles.css for a small reversible copy/layout cleanup: remove storage/status footer slogans, generic page introductions, course eyebrows and obvious feedback hints; preserve instructions, action names, errors and question assumptions. Remove orphaned styles/grid space. Verify build, focused desktop course/practice flows and formatting. No plugins or new copy-design approval gates. Durable copy rule: every visible phrase must help the user choose or complete a task; do not add implementation/privacy/game-format facts as decoration.

Done: removed the sidebar storage label, game-format footer, three generic page introductions, two course eyebrows, redundant resume/feedback prompts and duplicate Progress storage text. Data-tools copy now describes export/delete actions (PracticeData.tsx and its existing browser assertion also updated). Removed obsolete shell styles and closed grid space. Self-review and course screenshot inspection passed; 31/31 desktop course/practice/assessment tests and production build passed. Earlier dirty work and learner data preserved.

## Product refinement — 2026-10-19 (complete)

The user authorized a finished desktop web-app experience and explicitly prohibited plugins. Used native local shell/files/Playwright and scoped native agents only. This UI task superseded earlier UI approval gates; the generated-course backend remains a separate pending roadmap item.

Delivered: coherent five-destination desktop shell (Learn, Practice, Play, Progress, Reference); compact course home; focused lesson with question progress and safe pause/resume; active course row resumes rather than creating a duplicate attempt; path data controls on Progress; consistent surfaces/buttons/forms; keyboard/focus/retry/reload behavior preserved. No dependencies, backend changes, commits or publication; existing learner data and dirty work preserved.

| Ticket                                             | Ownership                                                                                                       | Evidence                                                                                                       |
| -------------------------------------------------- | --------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------- |
| P1: focused course/lesson and extracted data tools | builder returned LearningPath.tsx, new LearningPathDataControls.tsx and learning-path.spec.ts to lead           | done; final 18/18 desktop lesson tests                                                                         |
| P2: shell, styling and integration                 | lead: main.tsx, styles.css, index.html/favicon, navigation browser specs, playwright.config.ts and current docs | done; final build/format/diff checks                                                                           |
| P3: independent review                             | read-only reviewer, including final resume-row follow-up                                                        | done; no actionable findings                                                                                   |
| P4: functional verification                        | separate tester, isolated test DBs, no learner data                                                             | done; 89/89 full desktop before final row fix; final 18/18 affected suite afterward; visual checks at1280/1440 |

Content/API tests passed 34/34. Build passed after the final row correction. Historical explicit320px tests are tagged @mobile and excluded by default to respect desktop-only scope. Full review/testing details and earlier failures are in PROGRESS.md. No further UI work is required for this task.

## Superseded course-planning gate

The 2026-10-17 proposal treated the course as a beginner-first path and included rules quizzes and a hand-ranking lesson. The user clarified on 2026-10-23 that they already know the rules and expects Learn / Daily Practice to generate strategic situations. The current strategy-first task above supersedes that curriculum; preserve old content version 1 only for saved attempts and history. The updated product spec is `docs/superpowers/specs/2026-10-16-duolingo-course-and-generated-exercises-design.md`; the updated implementation plan is `docs/superpowers/plans/2026-10-16-duolingo-course-generated-exercises.md`.

The user previously selected a subagent-driven workflow. Current implementation uses scoped native subagents and lead-owned integration. No plugins are used.

## Prior completed task

The approved desktop Learn simplification is implemented and verified; its source/UI tests and handoff evidence remain in the dirty worktree. Preserve those changes as the baseline for this task. See `PROGRESS.md` for prior test evidence.
