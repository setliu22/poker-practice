# Poker Practice

A complete local learning app for heads-up, no-limit Texas Hold’em. Five exercise modes, a playable bot table, deterministic feedback, 12 original decision scenarios, and SQLite progress tracking. No login, API key, solver, paid service, or external connection is used during practice.

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

- **Who wins?** Every exercise is a fresh seeded random deal from the full deck, without fixed examples or filtering for hand strength. Feedback marks the stronger hand, names both hands, displays each best five in rank order, and outlines the deciding rank or kicker for matching categories. Ties are explicitly marked.
- **What beats me?** Classify four legal specific combinations. After answering, optionally reveal stronger categories derived by enumerating every legal opponent hand. Possible does not mean likely; uniform random cards are not a post-bet range.
- **Pot odds.** Enter required equity. The final pot includes the original pot, opponent’s bet, and call. Answers within 0.5 percentage points are accepted.
- **Equity vs. range.** Start on the river, or select the turn. Each explicitly listed combination is equally weighted. Turn equity enumerates all legal rivers separately for each combination. Ties receive half credit; blocked combinations are removed, malformed/duplicate ranges and empty surviving ranges are rejected by the engine. Feedback gives a graduated estimation result, exact equity, absolute error, and per-combination outcomes.
- **Make a decision.** Twelve original scenarios state cards, position, pot, stack, prior actions, actions/sizes, assumptions, provenance, and learning objective. Optional reasoning is saved but not automatically graded.

Progress separates categorical accuracy from numeric estimation error. Decision accuracy means choosing an accepted action under the stated assumptions, not universal optimality. Time spent is informational only. Recent sessions group attempts by UTC date; there is no timer or speed score.

**Practice my weak areas:** rank skills by mistake rate in the last 100 attempts, breaking ties by number of mistakes. Categorical unsupported answers and pot-odds answers outside tolerance count as mistakes; equity estimates more than 5 percentage points away count as misses for selection only. Target the highest-ranked skill and its mode on three out of four seed values; the fourth keeps ordinary seeded practice in the selected mode. With no recorded weakness, select ordinary practice. The chosen rule appears on each exercise. Showdown deals always remain completely random, including during weak-area practice; they are never filtered by a skill tag. Other fixture sets have limited variety.

Export all attempts as versioned JSON from Progress. Clearing requires a native confirmation dialog and deletes attempts and stored exercises. Export is for backup/analysis; importing is not implemented.

## Bot table

Open **Bot table** and choose **2–9 players, including you**. The remaining seats are eight distinct local opponents. Each seat has a **Playstyle** button with optional details; it opens a keyboard-accessible dialog and never reveals the current hidden hand. Counts can change between hands using **New table**. **Deal next hand** keeps the same opponents and rotates the dealer.

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

Each learner action gets a structured decision review with the cards/board at that moment, pot, call price, estimated opponent ranges, win/tie/loss probabilities, expected pot share, and a comparison of fold, check/call, and a legal bet size. Ranges start uniform over legal combinations and are weighted by the likelihood of each bot's **earlier** actions under its actual policy. Examples show exact combinations and their weights; category percentages summarize the whole range. No future actions, hidden cards, or actual future board enter this analysis.

For heads-up river decisions, action returns are enumerated exactly across every legal range combination and each possible bot response, including its raise sizes; the learner calls a further raise under the stated model. Other comparisons use 640 shared sampled worlds per decision with a separate response seed per world, so every action sees the same underlying cards. Recommendations use paired differences rather than adding the individual actions’ error bars. Approximate simultaneous 95% sampling intervals account for comparing up to two alternatives. Bots follow their rules for the remainder of the current betting round, the learner calls any further raises, and later streets check through. The engine settles side pots, ties, and chip payouts; expected net chips exclude sunk contributions.

These are conditional opponent-model results. Exact arithmetic does not establish that the bots resemble humans. Sampling intervals do not account for model error. Checking later streets through can substantially misprice draws, bluffs, and value bets on the flop/turn; the UI states this. A missing statistical difference is inconclusive, not proof of good play. Earlier cached reviews are recomputed when reopened.

Range odds use 400 simulations, except heads-up river range odds which enumerate every weighted combination. Multiway ranges use independent draws followed by rejection of colliding deals, conditioning the product of inferred hand weights on legal cards rather than favoring the first sampled seat. After a hand ends, **all bot cards, including folded cards**, are revealed for study. A separate hindsight replay uses those cards as known dead cards, excludes folded opponents from the contest, and redraws unknown future community cards. Actual-card river/turn odds are exact; preflop/flop odds are simulated. Multiway tied pot share is divided among all tied winners. Hindsight odds and winning a hand do not prove that an earlier action was good.

Call-price and pure-bluff break-even arithmetic is shown separately with its assumptions. Pure-bluff arithmetic assumes a loss whenever called; equity alone is never used to calculate betting EV. The full chronological action log and exact chip result remain available. Older saved hands are reconstructed from their recorded actions when that replay matches the saved state; otherwise reviews begin with new actions.

**Play** keeps the table and actions visible with a compact profit summary. **Games** provides a selectable saved-game list, a completed-hands filter, incremental display of longer lists, and separate game reviews. Each game has a stable number, players, start time, cumulative profit, per-street model scores, and hand results. **New game** saves the previous table and opens setup; **Resume game** returns to its saved hand.

Graphs show cumulative recorded profit and individual scored hands against their completion times. Points support pointer and keyboard inspection; the hand-results table provides the underlying outcomes. Unscored hands never become zero-score graph points. Empty games get a genuine empty state. Profit and scores update only after a hand completes; stacks reset to 1,000 each deal.

**Delete game** confirms the selected game and warns if a hand is unfinished. The API atomically deletes that table, hand statistics, numbering row, and command receipts. A revision check prevents deleting a game that changed in another tab; successful retries are harmless. Deleting another game leaves the active table intact. Deleting the current game clears the browser’s saved pointer. Existing game numbers never shift or get reused. Deleted games do not reappear after restarting.

The decision score describes the **trainer model**, not poker skill. For each postflop action we compare the chosen action with alternatives on shared worlds or by exact enumeration. A comparison is withheld if a paired error margin exceeds `max(10 chips, 10% of pot)`, or if a good-looking result still allows regret beyond that threshold. This precision threshold is an explicit product choice, not a poker law. Scored choices use central expected regret (without subtracting uncertainty): `max(0, 100 × (1 − regret / max(10, pot)))`. Game/street scores average only assessed choices and show assessed/unscored coverage; excluded difficult/noisy choices can make a partial score look better than overall play. Preflop and incomplete hands are excluded; actual hidden cards and eventual winnings never grade choices. Legacy unpaired scores are marked unscored; reopening a saved hand can upgrade its analysis while preserving its result and completion date.

Games are stored in SQLite separately from exercise metrics, progress export, and “Clear progress.” Commands use revisions and unique IDs to prevent duplicate bets/deals. Game summaries use public JSON metadata and a single pass over hand statistics instead of loading full private review states or issuing a query per game.

Migrations 3–4 retain old saved tables, their latest available completed hand, and stable numbering; older overwritten hands cannot be reconstructed. Legacy game start dates reflect when tracking was added. Continuous stacks, selectable difficulty, and full-session export remain future work.

Bot API:

- `GET /api/games` — saved games, revision numbers, completed-hand statistics and grading coverage.
- `DELETE /api/games/:id` — body `{ "revision": <current revision> }`; returns 204, including repeat deletions; 409 if changed, 400 for invalid input.

- `POST /api/tables` — `{players: 2..9}`
- `GET /api/tables/:id` — current public table view
- `POST /api/tables/:id/actions` — `{revision, actionId: UUID, action: "fold"|"check"|"call"|"raise", amount?: integer}`
- `POST /api/tables/:id/next` — `{revision, actionId: UUID}`; only after the hand finishes

The server strips hidden cards, the seed and the future board from all table responses. It returns 409 for stale revisions, 400 for invalid actions/counts, and 404 for missing tables.

## Exact versus illustrative feedback

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
packages/poker/src/ Pure evaluator, deck, seeded deals, pot odds, range/equity logic
packages/shared/src/ Zod request/exercise schemas and shared TypeScript types
 tests/             Vitest unit/integration tests and Playwright browser tests
```

The original evaluator scores five-card hands with category and lexicographic rank/kicker vectors, then examines all five-card subsets of five to seven available cards. Ace-low straights normalize to five-high. Card validation rejects duplicates and invalid ranks/suits. Equal rank vectors tie regardless of suits. Equity conditions the remaining deck on known hero, board, and opponent cards.

SQLite uses WAL, foreign keys, a unique attempt per exercise, and a versioned initialization migration. Exercises retain their canonical specification and seed. Attempts store exercise/scenario ID, mode, submitted answer, optional reasoning, feedback/error, elapsed time, date and tags. Synchronous inserts plus the unique exercise constraint make answer submission idempotent: repeated valid requests return the first saved feedback and never create another attempt.

API:

| Method | Route                       | Purpose                                                  |
| ------ | --------------------------- | -------------------------------------------------------- |
| GET    | `/api/health`               | Local health check                                       |
| GET    | `/api/modes`                | Five available modes                                     |
| POST   | `/api/exercises`            | `{mode, seed?, street?: "river" or "turn", targetWeak?}` |
| POST   | `/api/exercises/:id/answer` | `{answer, timeMs, explanation?}`                         |
| GET    | `/api/progress`             | Separate metrics, skills, recent attempts and sessions   |
| GET    | `/api/attempts`             | Complete attempt history, newest first                   |
| GET    | `/api/export`               | Download versioned JSON                                  |
| DELETE | `/api/progress`             | Clear exercises and attempts                             |

`answer` is an offered option string, a percentage number, or an ordered array of `beats`, `ties`, `loses` for comparison exercises. Zod validates requests and public exercises; the grader validates mode-specific answers. Invalid requests return 400, missing exercises 404, new exercises 201. The API binds to loopback; this is a single-user local app, not a hardened public service.

## Tests and verification

```sh
npm test
npm run build
npx playwright install chromium
npm run test:browser
```

On Linux, Playwright may require `npx playwright install --with-deps chromium`. Browser installation requires network access once; subsequent tests and normal practice are local. Browser tests use their own `data/browser-test.sqlite` database, clear it between cases, and start/stop both servers automatically. They use dedicated ports 5174 and 3002, so an existing app can keep running.

Verified during delivery:

- **106 Vitest tests passing:** all hand categories/ranking order, kicker comparisons, wheel straights, board-only ties, seven-card selection, duplicates, odds/tolerance, blockers/empty ranges, ties, known turn outcomes, legal stronger categories, seeded generation, all 12 authored scenarios, independent scenario equity checks, input validation, reopened-database persistence, concurrent/repeated submissions, export/clear targeted selection, bot privacy, betting order, short-raise reopening, side-pot eligibility, odd chips, 200 complete seeded bot hands with chip conservation, range inference/blockers, future-information isolation, exact turn odds, multiway tie shares, cached/private reviews, old-hand reconstruction, eight distinct profiles, normalized/legal mixed size policies, position/draw/trapping behavior, multiway bluff reduction, smoothed adaptation, public-only observations, policy version compatibility, pot-normalized decision scoring, game profit aggregation, saved-game persistence/idempotency, transactional deletion/rollback, stale revision protection, stable numbering, confidence-aware grading, and graph data.
- **300 seeded showdown comparisons** inside the evaluator verification test against independent MIT-licensed `pokersolver`. Expected category fixtures and known odds/equity cases are independently specified, not produced by the implementation under test.
- **20 Playwright cases:** desktop and phone exercise/feedback flows, progress updates, keyboard submission/focus, all modes including turn equity, mobile overflow/card readability, searchable reference, clear/cancel confirmation, zero external network requests during practice, playing/resuming 2-, 6-, and 9-player bot tables, and named playstyle dialogs with keyboard dismissal/focus restoration mobile bounds, saved-game profit, reopening games, score explanations, keyboard chart inspection, and deletion cancellation/retry/current-game cleanup.
- **Production build:** TypeScript checking, Vite assets, and bundled Node API.

Screenshots captured by the browser tests are available in ignored `test-results/` for visual inspection.

## Licenses and dependencies

The source and original exercises are MIT licensed (see `LICENSE`). The runtime poker engine has no evaluator dependency. `pokersolver` 2.1.4 is a **test-only**, MIT-licensed independent evaluator: https://github.com/standard-deviant/pokersolver (license also included in `node_modules/pokersolver/LICENSE.md`). Express, React, Vite, Zod, Vitest, Playwright and better-sqlite3 are installed from their official npm packages; exact compatible versions are recorded in the committed lockfile. SQLite is embedded locally through better-sqlite3.

## Limits and sensible next steps

The exercise bank is intentionally small: authored decisions and comparison fixtures can repeat. Generation is reproducible; broader datasets and spaced repetition would add variety. Equity covers equal-weight exact combinations on river/turn only, not flop/preflop, weighted notation, or a solver. Pot odds excludes rake, side pots, unequal all-ins, multiway action and future betting. Authored strategy relies on stipulated behavior; changing that behavior can change the recommendation. Add additional independently reviewed scenarios before presenting wider strategic coverage.

There is one local learner, no authentication, and no progress import or cloud sync. Practice state resets when navigating away or reloading; completed attempts persist. Database files contain local learning history. Further work could add saved in-progress exercises, richer per-skill histories, and an import tool. No payments, real-money play, human multiplayer, social feed, or LLM layer is included.
