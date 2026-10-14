# Active plan

Status: In progress — Linux browser verification and publication. Owner: lead agent. Started 2026-10-14 UTC.

## Objective

Improve Poker Practice to build skills that transfer to online no-limit Hold’em cash games. User specified online cash and corrected the six-player assumption: include full-ring contexts (including 8/9-player tables) with selectable table size, actual positions and active-player counts. Do not hardcode six-max. Baseline: clean `main` at `2791d73`; work branch `feat/online-cash-training`. The previous workflow/publication task is complete.

Deliver an integrated river Decision Lab with independent decision practice, range/price reasoning, useful feedback and persistent mistake review. Keep honest limits on authored strategy and bot models; do not claim measured real-world improvement without evidence.

## Acceptance

- New practice uses recognizable online cash situations with positions, effective stacks, public action and legal cards/sizes.
- Learner commits an answer before feedback; explanations distinguish arithmetic and stated assumptions from general optimal strategy.
- Practice records meaningful first-attempt learning evidence and supports revisiting weaknesses with fresh variations, without treating profit or bot-model agreement as skill.
- Existing saved data, practice modes, bots, keyboard/mobile accessibility, public-information isolation and local/offline use continue to work.
- Independent code review and functional verification pass. Relevant unit/API/browser tests and production build have current evidence; use GitHub branch CI if local Chromium remains unavailable.
- Lead updates this plan and `PROGRESS.md` at milestones; preserve all prior work.

## Implementation contracts

Add an online-cash river Decision Lab with four skills: bluff catching, value betting, bluffing, and closing multiway calls. Select 2–9 seats, default nine; exclude multiway for two seats. Supplied weighted ranges and response assumptions make arithmetic exact and conditional. First answers include action, reasoning, percentage estimate and confidence. Hints are tracked before submission; immutable first answers, assisted work, and guided changed-assumption follow-ups remain separate. Fresh review uses new specifications and excludes recent fingerprints. Preserve old learning variants and saved data.

Lead owns `packages/shared/src/cash-practice.ts`. Engine exports `generateCashDrill(seed, players, skill)`, `gradeCashQuestion(question, answer, assisted = false)`, `cashHint(question)`, `cashSkillLabels`, `cashSkillCues`. Backend owns adaptive selection and aggregation. API prefix `/api/cash-practice`: POST `/drills`, GET `/drills/:id`, POST `/drills/:id/hint` -> `{hint}`, POST `/drills/:id/answer` -> drill view, GET `/progress?players=9`. Transfer hidden until initial answer. New private specifications version 1. Export/clear include new persisted data.

## Task queue

| ID    | Task / owner                                       | Write ownership                                                                                               | Dependencies                | Acceptance                                                                                                                                                   | Status                  |
| ----- | -------------------------------------------------- | ------------------------------------------------------------------------------------------------------------- | --------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------ | ----------------------- |
| D1–D3 | Discovery / auditor and lead                       | Shared contract, plan/handoff                                                                                 | Baseline                    | Audit learning, verify primary sources, settle additive contract                                                                                             | Complete                |
| B1    | Conditional river engine / engine builder          | `packages/poker/src/cash-practice.ts`, `tests/cash-practice.test.ts`, `docs/online-cash-practice.md`          | Shared contract             | Weighted legal joint worlds, split pots, rake, legal public history/stacks/positions; deterministic varied generation and independent arithmetic fixtures    | Complete                |
| B2    | Persistence and API / API builder                  | `apps/api/src/cash-practice.ts`, migration 009, `database.ts`, `app.ts`, `tests/cash-practice-api.test.ts`    | Shared and engine interface | Immutable idempotent answers, staged privacy, durable hints/progress, fresh adaptive review, export/clear integration                                        | Complete                |
| B3    | Learner flow / UI builder                          | `apps/web/src/CashPractice.tsx`, `Learn.tsx`, `main.tsx`, `styles.css`, `tests/browser/cash-practice.spec.ts` | Shared/API contracts        | Prominent entry; 2–9 seats; reasoning before feedback; changed-assumption practice, fresh review, useful progress; responsive keyboard/error/reload behavior | Complete                |
| R1    | Independent code review / fresh reviewer           | None                                                                                                          | Integrated B1–B3            | Privacy, math, persistence, teaching and UI findings resolved                                                                                                | Complete                |
| V1    | Independent functional verification / fresh tester | None                                                                                                          | Integrated B1–B3            | Relevant and full tests/build, browser evidence or recorded environment limitation with Linux CI                                                             | Core passed; CI pending |
| I1    | Integrate and hand off / lead                      | Root docs, shared contract, integration                                                                       | R1/V1                       | Complete checks, inspect diff, commit and user-authorized GitHub publication; accurate current handoff                                                       | In progress             |

Builders have disjoint ownership. Shared-contract changes go through the lead; reviewers/testers remain independent. No generated opening charts for eight seats, solver dependency, win-rate claims, or retroactive grading of revealed hands.
