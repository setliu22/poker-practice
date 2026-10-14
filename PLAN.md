# Active plan

Status: In progress. Owner: lead. Branch `ui/beginner-simplification`, baseline clean `main` at `1f8be9c`.

## Objective

User wants simpler beginner screens with only necessary text. Reduce visible repetition and jargon across learning, decision practice, general exercises, progress and bot play. Show the hand/question, essential decision inputs, controls and one useful takeaway. Put optional history, calculations, detailed stats and source notes behind short disclosures. Keep brief qualifiers where needed to avoid presenting study assumptions or bot forecasts as proven strategy.

## Acceptance

- Default learning and feedback are markedly shorter; no repeated multi-paragraph caveats, sizing explanations or stacked instructional blocks.
- A beginner can understand the next action and units. Necessary pot/call/rake/range-response assumptions stay visible; model limits are concise and optional detail remains accessible.
- Preserve random generation, all tables/modes, first-answer/hint accounting, conditional grading, privacy, persistence, replay, export/clear, keyboard/focus, pending/error behavior and mobile bounds. No API, engine, schema or licensed data changes.
- Meaningful browser cases verify disclosures start closed and can be opened, concise feedback still provides essential context, and all original core flows remain usable. Reuse/update existing functional tests for intentional visible-copy changes; do not weaken hidden-answer or state assertions.
- Independent code review and functional checks/build; Linux full browser CI if local browser remains blocked. Update running app and verify delivered module rather than relying on filesystem watch.

## Ownership and tasks

| ID  | Role                                     | Exclusive write paths                                                                                                                                                                                     | Status                  |
| --- | ---------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------- |
| L   | Learning UI builder                      | `PreflopWalkthrough.tsx`, `Learn.tsx`, `ReadLesson.tsx`; browser preflop-walkthrough/learning/read-lesson tests                                                                                           | Complete                |
| C   | Cash UI builder                          | `CashPractice.tsx`; browser cash-practice tests                                                                                                                                                           | Complete                |
| B   | Bot UI builder                           | `BotPractice.tsx`, `RoundReview.tsx`, `MoveFacts.tsx`, `DecisionRating.tsx`, `MoveRecommendation.tsx`, `GameStats.tsx`; browser bots/compact-table/reset-hand/decision-rating/ranges/recommendation tests | Complete                |
| M   | Lead general practice/progress/reference | `main.tsx`, `styles.css`; browser practice/deal-modes/preflop/draw-density tests; root docs/README                                                                                                        | Complete                |
| R   | Independent reviewer                     | Read only after builders settle                                                                                                                                                                           | Complete                |
| V   | Independent tester / Linux CI            | Read only after builders settle                                                                                                                                                                           | Core passed; CI pending |
| I   | Lead integration/publication/handoff     | Root docs, commits, reviewed integration                                                                                                                                                                  | In progress             |

All UI paths are under `apps/web/src/`; browser tests under `tests/browser/`. Builders may request ownership expansion through lead; shared styles remain lead-owned. Preserve accessible region names where practical. Shorten labels deliberately and update only relevant semantic selectors when labels change. Keep default nine-seat learning and 2–9-seat cash/bot support.

Use existing guide/engine explanations under optional details rather than inventing new mathematical feedback. Do not hide range probabilities or call/fold responses needed to answer a drill. Visible conditional labels can be short, e.g. 'For this practice range' / 'Bot estimate'. No inferred mastery or removal of chart/source limits. Progress may summarize totals with breakdowns collapsed; hinted/independent/guided results must remain distinct.

Previous randomized walkthrough and cash lab fully delivered: application `30effb0`, GitHub run38574347619 passed326 tests/build/132 browsers. Preserve their behavior. Workers are spawned only with the tickets above; record results and return ownership on completion.
