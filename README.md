# Poker Practice

A local learning app for no-limit Texas Hold’em, with 2–9-player tables, online cash decision practice, a playable bot table, deterministic feedback, and SQLite progress tracking. No login, API key, solver, paid service, or external connection is used during practice.

**For coding agents:** read [START_HERE.md](START_HERE.md) for the portable head-chef workflow, current plan/handoff, and verification instructions. The [system design](docs/agent-workflow.md) explains bounded delegation and independent review.

## Install and run

Install **Node.js 24 LTS** (with npm). Run these commands from the repository root:

```sh
npm ci
npm run db:setup
npm run dev
```

Open **http://127.0.0.1:5173**. The single `npm run dev` command starts both Vite and Express; Ctrl+C stops both. The API listens at `127.0.0.1:3001`. Database setup is idempotent and also happens automatically when the API starts, so a clean checkout works without a manually created database.

Initial dependency installation needs internet access. Normal practice needs only the running local servers, even when disconnected from the internet. Local use is the guaranteed no-cost option; hosting is not provided.

For a built application served entirely by Express:

```sh
npm run build
npm start
```

Open **http://127.0.0.1:3001**. Run from the repository root so migrations and built assets can be found. `npm start` requires a preceding build. `PORT` changes the API port; for development, also update the Vite proxy. `POKER_DB` optionally sets a database file path. Default: `data/poker.sqlite`.

## Practice

Screens show the hand, the question, and a short explanation after you answer. Open the optional details for calculations, history, statistics, or sources.

Open **Learn → Online cash Decision Lab** for focused river decisions at **2–9-seat tables**, starting at nine seats. Table size and players still in the hand are displayed separately. Practice bluff catching, value betting, bluffing, and closing three-player calls using public betting histories, 100-BB starting stacks, and explicitly supplied weighted ranges. Multiway practice requires at least three seats.

Choose an action, explain your reasoning, estimate a percentage, and record your confidence before seeing feedback. A hint is optional and marks the answer as assisted. Each first answer is saved once; a guided follow-up changes the range weights so you can test what changes your decision. **Fresh review** creates another situation instead of scoring the same revealed question again. Progress separates independent answers, assisted answers, and guided follow-ups, identifies action/reasoning/estimation mistakes, and suggests a cue for your next session.

These are exact calculations **under the supplied study assumptions**, not solved human ranges or site-specific strategy. River calls close the action; bet/check exercises stipulate responses. The fixed study rake is disclosed and does not represent any site's actual fees. Earlier-street equity does not automatically settle a decision with later betting. See [the lab's design and calculation limits](docs/online-cash-practice.md).

- **Who wins?** Choose **Random deals** for natural deals from the full deck, or **Balanced hands** to practice all nine winning hand categories at approximately equal frequencies. Balanced deals use randomized ranks, suits, extra cards and board/hole-card allocation, with evaluator checks that the winning category matches the selected category. Quads and straight flushes therefore appear much more often than in natural deals. Both styles are fresh, seeded and reproducible. The chosen category and answer stay hidden until submission. Feedback marks the stronger hand, names both hands, displays each best five in rank order, and outlines the deciding rank or kicker for matching categories. Ties are explicitly marked.
- **What beats me?** Classify four legal specific combinations. After answering, optionally reveal stronger categories derived by enumerating every legal opponent hand. Possible does not mean likely; uniform random cards are not a post-bet range.
- **Pot odds.** Enter required equity. The final pot includes the original pot, opponent’s bet, and call. Answers within 0.5 percentage points are accepted.
- **Equity vs. range.** Start on the river, or select the turn. Each explicitly listed combination is equally weighted. Turn equity enumerates all legal rivers separately for each combination. Ties receive half credit; blocked combinations are removed, malformed/duplicate ranges and empty surviving ranges are rejected by the engine. Feedback gives a graduated estimation result, exact equity, absolute error, and per-combination outcomes.
- **Make a decision.** Twelve original scenarios state cards, position, pot, stack, prior actions, actions/sizes, assumptions, provenance, and learning objective. Optional reasoning is saved but not automatically graded.

Progress separates categorical accuracy from numeric estimation error. Decision accuracy means choosing an accepted action under the stated assumptions, not universal optimality. Time spent is informational only. Recent sessions group attempts by UTC date; there is no timer or speed score.

**Practice my weak areas:** rank skills by mistake rate in the last 100 attempts, breaking ties by number of mistakes. Categorical unsupported answers and pot-odds answers outside tolerance count as mistakes; equity estimates more than 5 percentage points away count as misses for selection only. Target the highest-ranked skill and its mode on three out of four seed values; the fourth keeps ordinary seeded practice in the selected mode. With no recorded weakness, select ordinary practice. The chosen rule appears on each exercise. With Random deals selected, showdown deals remain unfiltered even during weak-area practice. Balanced hands overrides weak-area switching for an explicitly selected Who wins mode so its balanced distribution is preserved. Other fixture sets have limited variety.

Export attempts and cash-practice history as versioned JSON from Progress. Cash drill exports include earned questions and feedback; private generation seeds and locked follow-ups stay hidden. Clearing requires confirmation and deletes attempts and stored exercises, including cash drills and hints. Export is for backup/analysis; importing is not implemented.

## Bot table

Open **Bot table** and choose **2–9 players, including you**. Seats surround an oval table, with your seat at the bottom and the pot and community cards in the center. The remaining seats are eight distinct local opponents. Each opponent's three-dot **Playstyle** button opens optional details in a keyboard-accessible dialog and never reveals the current hidden hand. Player count and starting-hand settings can be selected at any idle moment, including during an active hand. **New table** starts a separate saved game with those settings; the previous hand remains saved and can be resumed from **Games**. Editing settings does not change a live hand, and playing does not erase settings selected for a new table. **Deal next hand** keeps the current game's opponents and deal setting, and rotates the dealer.

A circular **D** marker identifies the dealer button and moves to the next seat each hand. Position names include button, blinds, cutoff, hijack, lojack and under the gun where applicable; heads-up correctly combines button and small blind.

Choose **Easy deals** under **Starting hands** before **Start table** or **New table** to filter your starting cards. The authored pool contains all pocket pairs, any two cards ten or higher, suited aces, and suited connectors from 65s upward (290 of 1,326 combinations). It is a practice selection rule, not a universally playable-hand chart. Boards and bots are not weakened or separately filtered. Position and earlier raises can still make a hand in this pool a fold. Next hands preserve the game's setting; replays preserve the recorded cards and mode.

Each move review starts with **What you faced**: position, competing opponents, pot, stack, current best five, board observations, and call price. It distinguishes a fully matched heads-up closing call from price-only arithmetic with later bets, pending responses, or pot eligibility complications. Sampled showdown odds are marked approximate. **Advanced: modeled action comparison** is optional and remains a conditional bot-model forecast.

**Preflop guide** beside the betting controls opens a centered, keyboard-accessible 13×13 chart with your hand highlighted. Fourteen local, MIT-licensed PreflopR opening baselines cover directly provided 2-, 6-, and 9-player positions. They require your first action in an unopened pot with everyone before you folding. Limps, raises/re-raises, big-blind decisions, later streets and unsupported table counts show a reason instead of a substitute chart. Reviews compare actions and explain sizing differences; Reference includes a browsable library. These are **illustrative**, not solver-derived or expert-verified. Upstream stack/rake/ante/sizing assumptions are unspecified; the app's 100-BB/no-rake context and 25/30-chip sizes are disclosed educational assumptions, not verified strategic matches. See [data provenance and retained license](packages/poker/data/preflop/README.md).

**Model agreement score** compares the chosen action with the tested alternatives using only its public-information snapshot and inferred ranges. Its authored scale is `100 / (1 + missed modeled EV in big blinds)`: 100 matches the best tested choice in the bot model, 50 represents one big blind of missed modeled value. It is not a winning probability or general poker-skill grade. Numeric scores require adequately sampled paired comparisons with supported missed value or supported agreement; overlapping zero/positive intervals show **Inconclusive**. Sampling ranges exclude errors in the opponent model. Saved games average only rated decisions and disclose excluded counts; legacy skill grades stay withheld. Revealed cards and hand results never affect the rating. See [decision feedback](docs/decision-feedback.md).

**Opponent ranges** includes a keyboard-accessible 13×13 grid for each competing bot. Cells aggregate the inferred probability of pairs, suited and offsuit classes after your cards and the visible board block combinations. Select a cell for its probability mass and legal/positive-weight counts; × means all combinations blocked, and — means zero model weight. These percentages total 100% across the range, not chance of winning or recommended action frequencies. Current-made-hand comparison uses only the already-dealt board and is separate from future showdown odds.

On flop and turn, **Draw density** shows the weighted share of each opponent's estimated range with an ordinary flush draw or open-ended straight draw. Overlap is counted once; a disclosure shows both categories and their overlap. Card blockers and invalid weights are handled by the existing range normalization. Made/stronger hands and other draw categories are excluded from this measure; no density is shown preflop or river. A draw need not win, and these marginal range percentages do not include multiway card-collision conditioning or predict calls/folds.

Heads-up reviews also compare the immediate **fold/call/re-raise** response to each tested bet size by enumerating the same authored policy used by that bot. Specific example hands show the joint probability of that exact combination and response. These are exact averages under the stated model, not guaranteed human reactions. Multiway response trees are not replaced by independently multiplied fold estimates. No hidden opponent cards or future community cards inform the grids or response previews.

**Replay this hand** appears after a hand finishes. It opens a separate saved game with the original recorded hole cards and future board, dealer, blinds, starting stacks, initial public reads, policy version and bot random seed. The original result and profit remain saved. Repeating your actions reproduces bot actions and outcomes; choosing different actions lets you explore another branch of the same deal. Opponent cards become hidden again. Modeled odds and review samples also repeat when the public situation is identical. Replay games retain their practice provenance across following hands. This is an interactive replay, not automatic playback of the original action history.

**Decision history and branches:** Open **Hand history**, choose a recorded action, and select **Try another action** to continue from that exact decision in a separate practice game. Opponent cards and later cards stay hidden in historical views. Earlier hands and restarted attempts remain in an append-only journal; old saves are marked partial. Versioned commands preserve retry receipts and reject stale revisions or action IDs reused with another payload. The journal can rebuild the current state after a lost/corrupt cached projection.

**Practice suggestions and decision data** can select supported bot-model gaps and export public decision-time features with explicit conditional labels. Replay/branch/restarted/partial data is excluded from independent training examples. The app now includes a separately trained fast screen of conditional teacher feedback; broad human leak detection and personalization remain future work. See [event sourcing and API contracts](docs/event-sourcing.md).

**Quick assessment** gives local ML feedback without playing an action. Its first model supports fresh heads-up button openings at 100 BB against Mara, with fold/call/raise-to-20/raise-to-25 choices. On 1,000 fresh synthetic test choices, decisive predictions covered 53.7% and agreed with the detailed teacher 95.53% of the time. It currently predicts **no clear gap** only; folds, possible gaps and unsupported contexts abstain and retain detailed analysis. A no-clear-gap result can be inconclusive and does not prove good play. [Model card](packages/poker/models/README.md).

A controlled synthetic premium-overfold test showed that raw probabilities tracked the injected pattern on an enriched challenge set, while the shipped assessment still made no positive mistake calls. In a matched 40-decision local benchmark, Quick assessment took 1.16 ms median versus 1,001 ms for the detailed hint (about 863× lower latency, with less output and frequent abstention). See the [experiment protocol, results and limits](docs/mistake-bot-experiment.md).

**Local practice data** records decision views, displayed fast/hint/odds/guide feedback and accepted choices with pseudonymous session IDs, timestamps and journal links. Actions and their usage records commit together; missing assistance telemetry stays unknown. Nothing uploads automatically. Download a paged usage JSON export or a full SQLite backup, or clear usage while keeping games. Backups use committed WAL state and validated restore to a new path. [System design, measured performance and recovery](docs/usage-data-design.md).

Each hand starts with 1,000 chips per seat, blinds 5/10, no ante and no rake. This is per-hand practice, not a continuous bankroll or elimination tournament. Play preflop through river using fold, check, call, and bet/raise. Raise amounts are **total chips committed this street**, not additional chips. The minimum and maximum are shown; “Set all-in” fills the amount before submission. Legal all-in calls, short raises, cumulative raise reopening, uncalled-chip returns, main/side pots, and split pots are handled server-side. Odd chips go clockwise from the dealer. Minimum raises/reopening are modeled on the [Poker TDA rules](https://www.pokertda.com/view-poker-tda-rules/); physical-table procedures are outside this app’s scope.

Bots use original contextual policies and seeded mixed actions. They consider position, effective remaining stack/pot ratio, call price, preflop raises/limpers, current made-hand strength, flush/straight/backdoor draws, board texture, blockers, earlier aggression, checked-through streets, and multiway pressure. They mix legal small/medium/large sizes, with selected overbets and shallow-stack shoves. These are deliberately different opponents with exploitable tendencies, not a solver or competitive poker AI.

| Name   | Playstyle              | Main tendency                                                                                              |
| ------ | ---------------------- | ---------------------------------------------------------------------------------------------------------- |
| Mara   | Patient trapper        | Slow-plays some safer monsters, check-raises, and increases later aggression; protects more on wet boards. |
| Theo   | Tight-aggressive       | Selective preflop; bets value and good draws, checks many medium hands.                                    |
| Juno   | Loose-aggressive       | Wider starts, steals, re-raises, and more selected bluffs.                                                 |
| Felix  | Sticky caller          | Calls more marginal pairs/draws and raises less.                                                           |
| Iris   | Selective defender     | Tighter starts and more folds against expensive pressure.                                                  |
| Nico   | Draw-focused aggressor | More calls and semi-bluffs with strong draws; some missed-draw bluffs.                                     |
| Sloane | Pressure bettor        | Probes checked-through streets and mixes larger polarized sizes.                                           |
| Remy   | Adaptive observer      | Gradually adjusts to smoothed public fold/call/raise observations.                                         |

All bots receive only their own hole cards, visible board, public betting/stack/position context, legal actions and public reads. They never receive the shuffled deck, future board, or opponents’ hole cards. Policy hand/draw scores are **heuristics, not equity estimates**. Bot descriptions expose tendencies, not an action's hidden reason. Remy's read history persists across hands of the same table, uses prior observations to moderate small samples, and resets for a new table. Other personalities use much smaller read adjustments or none. Opponents remain in fixed seats as the dealer rotates.

New tables and next hands use policy version 2. Older version-1 hands retain the legacy policy family until the next deal. Policy events retain the version and public context at the time; range inference and counterfactual bot responses use the corresponding policy family, including raise-size probabilities. Correctness fixes can revise earlier model estimates; the inferred ranges are conditional teaching assumptions, not calibrated human ranges. New decision snapshots include public histories/reads, so later observations cannot influence earlier feedback. This version does not use MIT PokerBots participant code or claim optimal play.

Each learner action gets a structured decision review with the cards/board at that moment, pot, call price, estimated opponent ranges, win/tie/loss probabilities, expected pot share, and a comparison of fold, check/call, and several legal bet sizes. Preflop ranges group pocket pairs, suited hands and offsuit hands; postflop groups show made hands using only the board at that decision. Counts refer to supported combinations, not equally likely hands. A later fold does not remove an opponent from an earlier snapshot. Mismatched street/board snapshots are rejected rather than used for feedback. Ranges start uniform over legal combinations and are weighted by the likelihood of each bot's **earlier** actions under its actual policy. Examples show exact combinations and their weights; category percentages summarize the whole range. No future actions, hidden cards, or actual future board enter this analysis.

For heads-up river decisions, action returns are enumerated across every legal range combination and possible bot response, including integer split-pot payouts. Bet/call and bet/fold-to-a-re-raise plans are explicitly labeled and compared. Other comparisons use 640 shared sampled worlds with separate response seeds. Opponents use their actual policies on all remaining streets. The learner's later actions use Theo's authored public-information policy, which can fold, check, call or raise; this is a specified continuation, not a claim about optimal play or what the learner will actually do. Tested sizes include minimum, half-pot, pot, and the submitted raise where distinct. Net chips exclude sunk contributions. Paired approximate 95% sampling intervals account for all tested alternatives.

These are **conditional bot-model forecasts, not optimal-strategy recommendations or poker-skill grades**. Exact arithmetic does not establish that the bots resemble humans. Sampling intervals do not account for model error. A missing statistical difference is inconclusive, not proof of good play. Earlier cached reviews are recomputed when reopened. Private royal flushes never fold; shared-board guarantees are treated separately so private unbeatable hands can still bet for value.

**Check My Odds** is an optional button next to your cards during an active hand. It shows outright win probability, first-place tie probability, expected showdown pot share (including multiway ties), competing opponent count, and whether the estimate uses public-action-inferred ranges or random legal hands. It uses only your hole cards, the already-dealt board, public betting observations and modeled ranges. Opponent hidden cards, the deal seed, future board, and completed-hand reviews are never consulted. All-in opponents remain in the contest; folded players are excluded. Folded unknown cards are sampled uniformly, without modeling their fold likelihood.

The estimate opens in a centered, viewport-sized dialog. Calculation status stays beside your cards and does not block betting. Close the dialog with its button, Escape, or the backdrop; focus returns to **Check My Odds**. Reopening an unchanged estimate is immediate. Acting or changing hands clears it.

Live odds assume every remaining opponent reaches showdown: they do not predict folds, future wagers, or whether calling/raising is advisable. Share splits ties equally before integer odd-chip allocation or side-pot eligibility; it is equity, not chip EV. Position affects ranges and betting decisions, not showdown odds when cards and ranges stay fixed. Seats explicitly identify button and blinds; the button rotates once per hand, including the heads-up button/small-blind rule.

Live estimates use **6,000 fixed samples**, with no favorable-result stopping. Near 50%, the pointwise 95% Wilson interval for win/tie shrinks from roughly ±4.9 percentage points at 400 samples to ±1.3 at 6,000. Expected share uses a conservative 95% Hoeffding bound for a variable between zero and one; it does not incorrectly treat multiway share as binary. Intervals describe sampling only, not opponent-model accuracy. Heads-up river, small heads-up turn ranges (at most 5,000 outcomes), and guaranteed royal-board ties are enumerated without sampling error under the stated ranges. Sampling yields every 64 outcomes to keep Express responsive. Repeated checks of the same revision share a bounded in-memory result cache. Requests are revision-checked before and after calculation, and the UI clears/cancels stale results when playing or switching hands/games. Odds requests perform no database writes and never run bots.

Completed-hand review odds retain a lightweight 400-sample estimate, except heads-up river range odds and guaranteed royal-board ties which enumerate outcomes. The optional live button uses the higher-precision calculation described above. Multiway ranges use independent draws followed by rejection of colliding deals, conditioning the product of inferred hand weights on legal cards rather than favoring the first sampled seat. After a hand ends, **all bot cards, including folded cards**, are revealed for study. A separate hindsight replay uses those cards as known dead cards, excludes folded opponents from the contest, and redraws unknown future community cards. Actual-card river/turn odds are exact; preflop/flop odds are simulated. Multiway tied pot share is divided among all tied winners. Hindsight odds and winning a hand do not prove that an earlier action was good.

Call-price and pure-bluff break-even arithmetic is shown separately with its assumptions. Pure-bluff arithmetic assumes a loss whenever called; equity alone is never used to calculate betting EV. The full chronological action log and exact chip result remain available. Older saved hands are reconstructed from their recorded actions when that replay matches the saved state; otherwise reviews begin with new actions.

**Play** keeps the table and actions visible with a compact profit summary. **Games** provides a selectable saved-game list, a completed-hands filter, incremental display of longer lists, and separate game reviews. Each game has a stable number, players, start time, cumulative profit, decision-review counts and hand results. **New game** saves the previous table and opens setup; **Resume game** returns to its saved hand.

Graphs show cumulative recorded profit against completion times. Points support pointer and keyboard inspection; the hand-results table provides the underlying outcomes. Empty games get an empty state. Profit and review counts update after a hand completes; stacks reset to 1,000 each deal. Skill-score graphs are withheld because these bots are not validated strategy teachers.

**Delete game** confirms the selected game and warns if a hand is unfinished. The API atomically deletes that table, event history, decision labels, hand statistics, numbering row, and command receipts. A revision check prevents deleting a game that changed in another tab; successful retries are harmless. Deleting another game leaves the active table intact. Deleting the current game clears the browser’s saved pointer. Existing game numbers never shift or get reused. Deleted games do not reappear after restarting.

**Poker skill is not scored by the bot table.** General bot-response and assumed-continuation comparisons remain available for study, but do not become numeric skill grades, even when their arithmetic is exact or sampling intervals are narrow. Older saved grades are suppressed in API summaries; completed-hand upgrades preserve historical profit and completion dates. Exercise accuracy for original authored scenarios remains separate and depends on their explicitly stated assumptions.

Games are stored in SQLite separately from exercise metrics, progress export, and “Clear progress.” Commands use revisions and unique IDs to prevent duplicate bets/deals. Game summaries use public JSON metadata and a single pass over hand statistics instead of loading full private review states or issuing a query per game.

Migrations 3–4 retain old saved tables, their latest available completed hand, and stable numbering; older overwritten hands cannot be reconstructed. Legacy game start dates reflect when tracking was added. Continuous stacks, selectable difficulty, and full-session export remain future work.

Bot API:

- `GET /api/games` — saved games, revision numbers, completed-hand statistics and decision-review counts (skill scores withheld).
- `GET /api/preflop-charts` — local attributed illustrative opening library.
- `DELETE /api/games/:id` — body `{ "revision": <current revision> }`; returns 204, including repeat deletions; 409 if changed, 400 for invalid input.

- `POST /api/tables` — `{players: 2..9, dealMode?: "random" | "easy"}`
- `GET /api/tables/:id` — current public table view
- `POST /api/tables/:id/actions` — `{revision, actionId: UUID, action: "fold"|"check"|"call"|"raise", amount?: integer}`
- `POST /api/tables/:id/odds` — `{revision}`; read-only live equity, 409 if stale, 400 if completed/folded, 404 if missing, 422 if ranges cannot be estimated.
- `POST /api/tables/:id/guide` — `{revision}`; read-only opening guide or unsupported-situation reason; 409 if stale, 400 if finished/folded/off-turn, 404 if missing.
- `POST /api/tables/:id/next` — `{revision, actionId: UUID}`; only after the hand finishes
- `POST /api/tables/:id/replay` — `{revision, actionId: UUID}`; creates a separate game from the completed recorded deal, preserving the original. Retries return the saved replay response.

The server strips hidden cards, the seed and the future board from all table responses. It returns 409 for stale revisions, 400 for invalid actions/counts, and 404 for missing tables.

## Exact versus illustrative feedback

See [Beginner poker concepts](docs/beginner-poker-concepts.md) for chart frequencies versus winning probability, position, re-raise terminology, ties, pot odds, and clean/dirty/chop outs. The teaching sequence is hand/position basics, illustrative opening guides, pot odds, then conditional modeled EV. [Decision feedback](docs/decision-feedback.md) documents chart scope, model agreement scoring and weighted draw density.

Winners, best hands, legal opponent comparisons, possible stronger categories, pot odds, and river/turn equity are exact, deterministic calculations performed on the server. Answers are never generated by an LLM or remote service. Exercise responses omit feedback, accepted actions, and hidden answer fields until submission.

Nine decision scenarios are marked **Calculated result**. They define each relevant response probability and payout. Expected values count net chips from the current decision; money already in the pot is available to win, and new hero contributions are subtracted. Ties split the final pot. Three scenarios are **Illustrative strategy**: authored recommendations where exact response frequencies or future actions are unspecified. Multiple answers are accepted where reasonable. Optional written reasoning is saved, not graded. All scenarios carry “original educational example” provenance and describe their limits. They are not solver outputs, GTO claims, or expert-approved material.

## Architecture

```text
apps/web/           React + Vite; accessible responsive UI, local API requests
apps/api/src/       Express routes, authored scenarios, generation/grading, database
apps/api/migrations/001_initial.sql  Exercise storage (schema version 1)
apps/api/migrations/002_bot_tables.sql  Saved bot tables and command receipts (version 2)
apps/api/migrations/003_bot_games.sql   Game dates and completed-hand statistics (version 3)
apps/api/migrations/004_game_numbers.sql Stable game numbers (version 4)
apps/api/migrations/010_table_events.sql Append-only events, request identities and labels
apps/api/migrations/011_usage.sql Local usage identity, sessions and immutable facts
apps/api/migrations/012_usage_compatibility.sql Data/cursor-preserving early-schema upgrade
apps/api/src/table-journal.ts Event persistence and projection recovery
apps/api/src/table-routes.ts Versioned/legacy table command and history routes
apps/api/src/usage.ts Signed display acknowledgements and usage export
apps/api/src/data-backup.ts WAL-consistent snapshot and validated new-path restore
packages/poker/src/ Pure evaluator, deck, seeded deals, pot odds, range/equity logic
  showdown.ts        Shared showdown sampler/enumeration and uncertainty intervals
  live-odds.ts       Public-information live snapshots and range-based odds
  preflop-charts.ts  Licensed local opening baselines and strict public-history matching
  decision-rating.ts Conditional model agreement ratings and sampling safeguards
  table-events.ts    Deterministic journal reducer and historical privacy boundary
  fast-assessment.ts Public-only calibrated local ML screening
packages/poker/models/ Trained artifact, aggregate report and reproduction card
  range-draws.ts     Weighted flush/open-ended draw classification
packages/shared/src/ Zod request/exercise schemas and shared TypeScript types
 tests/             Vitest unit/integration tests and Playwright browser tests
```

The original evaluator scores five-card hands with category and lexicographic rank/kicker vectors, then examines all five-card subsets of five to seven available cards. Ace-low straights normalize to five-high. Card validation rejects duplicates and invalid ranks/suits. Equal rank vectors tie regardless of suits. Equity conditions the remaining deck on known hero, board, and opponent cards.

SQLite uses WAL, foreign keys, a unique attempt per exercise, and a versioned initialization migration. Exercises retain their canonical specification and seed. Attempts store exercise/scenario ID, mode, submitted answer, optional reasoning, feedback/error, elapsed time, date and tags. Synchronous inserts plus the unique exercise constraint make answer submission idempotent: repeated valid requests return the first saved feedback and never create another attempt.

API:

| Method | Route                       | Purpose                                                                                          |
| ------ | --------------------------- | ------------------------------------------------------------------------------------------------ |
| GET    | `/api/health`               | Local health check                                                                               |
| GET    | `/api/modes`                | Five available modes                                                                             |
| POST   | `/api/exercises`            | `{mode, seed?, street?: "river" or "turn", targetWeak?, showdownStyle?: "random" or "balanced"}` |
| POST   | `/api/exercises/:id/answer` | `{answer, timeMs, explanation?}`                                                                 |
| GET    | `/api/progress`             | Separate metrics, skills, recent attempts and sessions                                           |
| GET    | `/api/attempts`             | Complete attempt history, newest first                                                           |
| GET    | `/api/export`               | Download versioned JSON                                                                          |
| DELETE | `/api/progress`             | Clear exercises and attempts                                                                     |

`answer` is an offered option string, a percentage number, or an ordered array of `beats`, `ties`, `loses` for comparison exercises. Zod validates requests and public exercises; the grader validates mode-specific answers. Invalid requests return 400, missing exercises 404, new exercises 201. The API binds to loopback; this is a single-user local app, not a hardened public service.

## Tests and verification

```sh
npm test
npm run build
npx playwright install chromium
npm run test:browser
```

On Linux, Playwright may require `npx playwright install --with-deps chromium`. Browser installation requires network access once; subsequent tests and normal practice are local. Browser tests use their own `data/browser-test.sqlite` database, clear it between cases, and start/stop both servers automatically. They use dedicated ports 5174 and 3002, so an existing app can keep running.

Historical verification (earlier deliveries):

These counts describe earlier snapshots, not the current working tree. Current commands, outcomes, and coverage limits are recorded in [PROGRESS.md](PROGRESS.md); use [VERIFY.md](VERIFY.md) to reproduce checks.

- **254 Vitest tests passing across 21 files:** all hand categories/ranking order, kicker comparisons, wheel straights, board-only ties, seven-card selection, duplicates, odds/tolerance, blockers/empty ranges, ties, known turn outcomes, legal stronger categories, seeded generation, all 12 authored scenarios, independent scenario equity checks, input validation, reopened-database persistence, concurrent/repeated submissions, export/clear targeted selection, bot privacy, betting order, short-raise reopening, side-pot eligibility, odd chips, 200 complete seeded bot hands with chip conservation, range inference/blockers, future-information isolation, exact turn odds, multiway tie shares, cached/private reviews, old-hand reconstruction, eight distinct profiles, normalized/legal mixed size policies, position/draw/trapping behavior, multiway bluff reduction, smoothed adaptation, public-only observations, policy version compatibility, withheld bot-derived skill scores (including historical grades), game profit aggregation, saved-game persistence/idempotency, transactional deletion/rollback, stale revision protection, stable numbering, confidence handling, graph data, private-royal safeguards, exact odd-chip EV, future-street betting, multiple raise sizes and river continuation plans, snapshot consistency, live odds on all streets, weighted first-place ties, all-in/folded seats, joint card collisions, precision bounds, secret-property access guards, read-only SQL verification, result caching, concurrent/stale requests, exact recorded-deal replays across policy versions, stable replay odds/reviews, replay privacy/idempotency, original-result preservation, persisted replays across database restarts, blocker-aware 169-class range summaries, exact current-made-hand comparisons, immediate authored-policy response probabilities/traps/privacy, conservative closing-call facts, rotating position names, Easy deal selection and persistence, and all nine balanced winning categories verified independently against pokersolver.
- **300 seeded showdown comparisons** inside the evaluator verification test against independent MIT-licensed `pokersolver`. Expected category fixtures and known odds/equity cases are independently specified, not produced by the implementation under test.
- **88 Playwright cases:** desktop and phone exercise/feedback flows, progress updates, keyboard submission/focus, all modes including turn equity, mobile overflow/card readability, searchable reference, clear/cancel confirmation, zero external network requests during practice, playing/resuming 2-, 6-, and 9-player bot tables, and named playstyle dialogs with keyboard dismissal/focus restoration mobile bounds, saved-game profit, reopening games, model explanations, keyboard chart inspection, deletion cancellation/retry/current-game cleanup, live odds without changing the hand, loading while betting, stale-response cancellation, error/retry flows, centered odds dialogs with Escape/focus restoration and cached reopening, all 2–9 oval seat layouts with the learner at the bottom, five-card boards and completed split-pot seats at 320px, interactive replay with the original result preserved, rotating dealer markers, Easy deal selection, Balanced practice selection and answer privacy, primary decision facts, response size comparisons, and keyboard/mobile range grids.
- **New feedback verification:** pinned-source opening counts/provenance, strict chart eligibility, read-only guide SQL checks, guide privacy/cache rebuilding, score normalization and confidence bounds, legacy score suppression, public-only ratings, persisted rating coverage/idempotence, tiny-loss and unavailable UI labels, weighted draw unions/overlap/blockers, ace-boundary draws, made-hand exclusions, and independent draw-density integration fixtures. Browser coverage includes chart dialogs/library, keyboard/focus/cancellation, 320px layouts, qualified numeric/inconclusive/unavailable ratings, and flop/turn draw disclosures.
- **Production build:** TypeScript checking, Vite assets, and bundled Node API.
- **Table setup follow-up:** eight desktop/mobile browser checks pass for settings during active hands, keeping pending selections through actions, creating a different-sized table without rewriting the original game, resuming its original settings, and keyboard operation.

Screenshots captured by the browser tests are available in ignored `test-results/` for visual inspection.

## Licenses and dependencies

The source and original exercises are MIT licensed (see `LICENSE`). The imported PreflopR opening data retains its [MIT notice](packages/poker/data/preflop/LICENSE) and [pinned provenance](packages/poker/data/preflop/README.md); no commercial trainer charts are copied. The runtime poker engine has no evaluator dependency. `pokersolver` 2.1.4 is a **test-only**, MIT-licensed independent evaluator: https://github.com/standard-deviant/pokersolver (license also included in `node_modules/pokersolver/LICENSE.md`). Express, React, Vite, Zod, Vitest, Playwright and better-sqlite3 are installed from their official npm packages; exact compatible versions are recorded in the committed lockfile. SQLite is embedded locally through better-sqlite3.

## Limits and sensible next steps

The exercise bank is intentionally small: authored decisions and comparison fixtures can repeat. Generation is reproducible; broader datasets and spaced repetition would add variety. Equity exercises cover equal-weight exact combinations on river/turn; live bot odds cover all streets using inferred exact-combination weights. Compact range notation is not implemented. Optional local GTOpen preflop reference charts are now available through the integration described below. Pot odds excludes rake, side pots, unequal all-ins, multiway action and future betting. Authored strategy relies on stipulated behavior; changing that behavior can change the recommendation. Add additional independently reviewed scenarios before presenting wider strategic coverage. The original reported preflop display of 1,035 combinations/finished hand categories could not be reproduced from available saved states; per-street regression tests and snapshot validation protect current reviews. Bot ranges and Theo continuations remain authored approximations, not human-calibrated strategies. A nine-player decision review with eight active opponents took about 2.8 seconds locally; computation remains local and may take longer on older machines.

There is one local learner, no authentication, and no progress import or cloud sync. Practice state resets when navigating away or reloading; completed attempts persist. Database files contain local learning history. Further work could add saved in-progress exercises, richer per-skill histories, and an import tool. No payments, real-money play, human multiplayer, social feed, or LLM layer is included.

### Layered live preflop assistant

The default **Before you act** panel shows the starting-hand category, exact position, effective stack against each opponent, competing/pending players, and public action history. Its short prompts explain practical issues such as ace-kicker domination and facing a re-raise. The existing illustrative opening charts appear only when their table size and unopened-pot assumptions match. Unsupported contexts explicitly have no chart; there is no invented limp, three-bet or eight-player strategy dataset.

Expand **How might opponents respond?** to inspect a legal action/raise-to size. The assistant samples 800 joint deals from public-action-inferred ranges and runs the actual bot policies sequentially until the next learner decision or street. It shows conditional response rates, Wilson sampling intervals, public observed counts/rates separately, plausible starting-hand matrices, and differences from the previous size inspection. An opponent not reached in those branches has no measured response, rather than a fabricated zero fold tendency.

Expand **Showdown equity and modeled EV** for 6,000-sample showdown estimates and 1,600-world action comparisons. Showdown equity assumes competitors reach showdown; it does not include fold success. EV continues future betting, with either Theo's authored learner policy or a deliberately conservative check/fold sensitivity test. Each EV row decomposes its average into uncontested wins, showdowns and learner folds; these contributions sum to its net-chip estimate. Paired comparisons use shared sampled worlds and multiple-comparison uncertainty. These are conditional bot-model estimates, not optimal poker strategy or general skill grades. Increasing sample counts does not validate the bot assumptions.

`POST /api/tables/:id/assistant` accepts a strict revision/layer/action/amount/continuation request. Context is cheap; optional calculations run in at most two worker threads so the game server remains responsive. The worker receives a sanitized public snapshot with no hidden opponent cards, actual runout, deal seed or completed review. The endpoint performs no database writes and rejects stale results. Source and bundled production workers are included in the root build. Tests cover privacy, reproducibility, sequential probability totals, EV decomposition, independent confidence fixtures, endpoint validation/read-only behavior, keyboard operation and 320px layouts.

**Restarting one hand:** Use **Restart hand** in the current game strip, either mid-hand or after completion. Confirming restarts the recorded deal in the same game, with the same dealer, cards, seed and bot observations from the start of that hand. Earlier hands remain saved; the current hand's result is removed and replaced when its replay finishes, so it is not counted twice. New choices can change later bot responses. Once cards have been revealed, a replay is not a blind decision assessment. The separate completed-hand **Replay** feature still creates a new game when you want to preserve the original result. The transactional `/api/tables/:id/reset-hand` endpoint validates the revision and deduplicates repeated requests.

The **Decision assistant** shortcut in the current game strip scrolls to the live preflop tools. Opening charts and this assistant apply before the flop; the **Preflop guide** button is hidden on later streets. Live odds and post-action decision reviews remain available independently.

**Compact live table:** Learning material stays out of the main page flow. **Decision assistant**, **Review decisions**, and **Hand history** open scrollable dialogs with a persistent Close button, Escape dismissal and focus return. Opening charts start collapsed inside the assistant. The desktop sidebar shows only three recent actions; phones use the history dialog. Completed hands show a short result and next-hand controls, with showdown details expandable. Closing study panels restores the compact game view without discarding any saved feedback.

### Automatic move highlight and local solver charts

During each live decision, the app automatically compares legal choices and several legal raise sizes using 1,600 shared sampled worlds. The highest estimated-return action is highlighted beside the betting controls. Close paired comparisons are explicitly tentative; the highlight is a bot-model preference, not a claim of general optimal poker play. A suggested raise size has a separate highlighted button to fill the input without betting. A different entered size is never highlighted as though it were the suggested size. Changing the hand aborts the request and stops its worker.

**Solver range chart** opens a context-matched GTOpen chart. It works for limps and raises as well as unopened spots when the exact tree fits the local budget. A missing opening baseline also links to this solver chart. Recommendations against the practice bots and adaptive-solver reference frequencies are distinct: the solver's most-used action is a mixed-strategy frequency, not showdown probability or proof of the best response to the named bot.

One-time optional installation (network needed for installation only):

```sh
npm run solver:setup
```

This installs the pinned external GTOpen revision `b69ea07c79884fc598757dc45c712e73976db810` and an isolated minimal Rust toolchain under `~/.local/share/poker-practice/`, builds the CPU server, and runs its library tests. It does not modify your shell profile. GTOpen source/binaries are not bundled or redistributed in this repository: the inspected upstream revision has no explicit license file or Cargo license declaration. Do not describe it as MIT-licensed or redistribute it without resolving licensing. Local execution uses no account, payment or API key. The main app remains usable without the optional solver installation.

Start Poker Practice normally with `npm run dev` or `npm run build` followed by `npm start`. The API starts GTOpen on demand on loopback port 3738 (API port + 737 by default), using four CPU threads, a 50,000-node budget and 384-MB arena cap. Its dedicated process can remain running after the app stops; use the process listening on that solver port if you need to stop it. `POKER_GTOPEN_HOME` changes the install directory; `POKER_SOLVER_PORT` changes the dedicated local port; `POKER_SOLVER_DISABLED=1` disables solves. Keep this dedicated session for Poker Practice rather than manually changing its profiles through another UI.

Charts use the full actual table size, equal starting stacks, no rake, a finite raise menu and at least three raise levels. Exact historical sizes are added to the corresponding seat's menu. The bridge walks every public action and checks actor, pot, contributions, active seats and final session configuration. It rejects unsupported sizes, unequal initial stacks, rare/unreached nodes and oversized trees instead of returning a smaller-table substitute. Nine-seat trees often exceed the conservative budget; core practice and the automatic bot-model highlight remain available. GTOpen's balanced heads-up / coupled-deck multiway continuations are approximate and do not solve future postflop betting. A small model gap is not a certificate of full-game poker optimality. Charts show iteration, target/gap, preliminary status and assumptions.

`POST /api/tables/:id/solver-chart` accepts only `{revision}`. Chart jobs run separately from gameplay, serialize access to the solver session, and queue up to three requests. Completed charts are cached in SQLite through migration 005, with version/config/public-history keys. They survive API restarts. No opponent hole cards, future board, deal seed or completed review is sent. Neither inspecting a chart nor filling a suggested size advances a turn or writes game commands/profit statistics.

Verification: `npm test` covers advice selection, close comparisons, all streets, hidden-information exclusion, blockers through reused equity/range tests, exact action matching, stack/seat mapping, class indexing, illegal chart rejection and request validation. `npm run test:browser` covers action highlights, size matching, mixed charts, keyboard/mobile use and read-only behavior. With the local solver installed, run `TEST_GTOPEN=1 npx vitest run tests/solver-live.test.ts` for real-engine unopened/limped/raised/multiway charts, persistent caching and resource-limit rejection. See [integration assessment](docs/gtopen-assessment.md).

### Guided learning

The default **Learn** screen includes a randomized preflop walkthrough for **6 or 9 players**, starting at nine. A visual table follows public folds to the button, asks whether to open a generated hand, compares another generated hand in an earlier position and on the button, then explains a generated opposing raise through call cost and the legal minimum re-raise. Paired steps reuse the same hand so the changed position or question remains clear. **New randomized walkthrough** changes the scenarios; previous, retry and replay controls preserve the current examples. The final step generates fresh exact-card decisions from matching direct charts, with an optional baseline hint.

Whether a hand belongs in the opening range and how much to open are separate questions. **2.5 BB is the app's illustrative opening size for the entire non-blind opening range**; it is not calculated from the strength of the particular hand. The walkthrough does not solve an optimal raise size. See [preflop practice and sizing](docs/preflop-practice.md).

Opening actions follow the licensed PreflopR authored raise/fold baselines, not solved strategy. Chart agreement is not a poker skill score. The 100-big-blind, no-rake/ante app setting and 2.5 BB opening size are explicit teaching assumptions because source sizing/depth are unspecified. An earlier raise changes the question: the opening chart never grades a response to that raise. The raised-pot steps check the call cost and minimum legal raise, and explain why raiser range and remaining players matter.

**More practice and earlier lessons** is collapsed below the walkthrough. It retains river value-betting and generated all-in exercises with their existing saved history, export and clearing behavior. The all-in generator supplies artificial weighted ranges and exact runout feedback; see [its scope and limitations](docs/update-your-read.md). No old learning data is deleted by the new default flow.
