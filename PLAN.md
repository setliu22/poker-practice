# Active plan

Status: **Complete**. Owner: lead agent. Started 2026-10-13; completed 2026-10-14 UTC.

## Objective and acceptance

Establish the portable head-chef coding workflow, use it to deliver and independently review this change, preserve the existing Poker Practice work, verify the application, and publish the public GitHub repository.

Acceptance is met: any coding LLM can start from `START_HERE.md`; the plan, progress, verification and design files define ownership, bounded tasks, dependencies, fresh worker context, independent review/testing and honest fallback. Existing app work and workflow were checkpointed separately. Source, licensed chart assets and original history are published; local learner data, dependencies, builds and the optional external solver are excluded. GitHub CI passed all required checks on `cda70ae`; the final completion record changes only Markdown.

## Completed task queue

| ID  | Task and owner                                     | Owned writes                                                                  | Acceptance evidence                                                                                           | Status |
| --- | -------------------------------------------------- | ----------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------- | ------ |
| W0  | Publication assets / lead                          | `.gitignore`                                                                  | Root `/data/` ignored; required chart JSON/license/provenance included in `6546c94`                           | Done   |
| W1  | Portable workflow / workflow_builder               | Six workflow Markdown files and README links/history clarification            | Linked entrypoint, realistic contracts, formatting and link checks                                            | Done   |
| W2  | Independent design review / workflow_reviewer      | None                                                                          | No blocking/material findings                                                                                 | Done   |
| W3  | Functional/source checks / functional_verifier     | Ignored test artifacts only                                                   | Imports/lockfile/links valid; remote source/history audited; actual Linux browser evidence now available      | Done   |
| W4  | Integration/checkpoints / lead                     | Git index/commits, plan/handoff                                               | Preserved existing work; application `6546c94`, workflow `431c115`; staged contents reviewed                  | Done   |
| W5  | Public GitHub publication / lead                   | Remote/branch and authorized GitHub writes                                    | Original history preserved; remote source tree matched local; account authorization repaired                  | Done   |
| W6  | Automated verification / lead                      | `.github/workflows/verify.yml`                                                | Node 24 Linux unit/build/full desktop-mobile CI green, run `38505645001`                                      | Done   |
| B1  | Browser navigation repair / browser_fix_builder    | `tests/browser/learning.spec.ts`, `tests/browser/preflop-walkthrough.spec.ts` | Reopen earlier lessons after reload; assert saved scores; exact action locator; assertions retained           | Done   |
| B2  | Browser repair review/recheck / reviewer and lead  | Reviewer read-only; lead plan/handoff                                         | Independent review accepted; all 108 browser cases passed                                                     | Done   |
| C1  | Bound exhaustive-test timing / browser_fix_builder | `tests/table-review.test.ts`, `tests/decision-generator.test.ts`              | Finite 30s/60s budgets on two correctness cases; all seeds/samples/assertions retained; targeted 20/20 passed | Done   |
| C2  | Hosted CI scheduling / lead and reviewer           | CI, `VERIFY.md`, plan/handoff                                                 | One unit-test worker; API responsiveness checks unchanged; independent review and full CI passed              | Done   |

## Final state and next task

Public repository: [setliu22/poker-practice](https://github.com/setliu22/poker-practice). The user explicitly authorized public publication. Local `main` tracks `origin/main`; use Git metadata for the exact latest documentation commit. Tested code commit: `cda70aecf8973acfa7af69b0f92d06b836b137d5`.

GitHub connection write access now works. The local checkpoint `a435543` is preserved on `local-checkpoints/a435543`; connector-created commits carry the same reviewed source content. The original application history remains in the published branch. Local Chromium's macOS launch limitation is covered by passing Linux browser CI; optional real-engine tests were verified separately locally.

No implementation or publication task remains after this completion record is published. For the next substantive user request, inspect actual Git state and replace this completed plan with that objective, scoped ownership and acceptance criteria. Keep durable rules in `AGENTS.md` and design in `docs/agent-workflow.md`.
