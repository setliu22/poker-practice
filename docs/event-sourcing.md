# Replayable decisions and reliable commands

The table stores its private deal and every accepted human/bot action in SQLite. The journal reconstructs the exact game without choosing bot actions again. A learner can inspect the public state before a recorded decision and create a separate practice branch. Source results stay saved.

Use **Bot table → Hand history → View decision → Try another action**. Earlier hands and restarted attempts remain in the history. **Practice suggestions and decision data** offers supported bot-model gaps and a JSON export. Old saves start with a partial-history notice; actions lost before this feature cannot be manufactured.

## Data model

Migration `010_table_events.sql` adds three local tables:

| Table                  | Grain and purpose                                                                                                                                                                               |
| ---------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `bot_table_events`     | `(table_id, sequence)`: version, kind and private payload. A checkpoint stores the actual deal/state; action events store seat/action/raise-to amount; revision events mark completed commands. |
| `bot_command_requests` | `(table_id, action_id)`: normalized route and parsed input, paired with the existing immutable response receipt in `bot_commands`.                                                              |
| `bot_decision_labels`  | `(table_id, sequence)`: derived, versioned public-information bot-model assessment of a hero action, stored separately from its features.                                                       |

Sequences order events within a game. New deals/reset/replay create checkpoints before any bot action; subsequent events record each bot action too. A branch checkpoint holds its exact decision prefix, including earlier actions, reads, decision frames, legal betting state and policy version. Branches carry `{tableId, sequence, handNumber}` provenance. Following hands retain the derived game's origin.

`bot_tables.state` is the current projection and review cache. Gameplay reads use the journal's most recent checkpoint and following events, then reuse matching cached reviews. Startup rebuilds the projection before listing saved games. A missing or corrupt state value can be recovered while its table identity and journal exist. This is projection recovery, not a backup: intentionally deleting a game cascades to its events, labels and receipts. Keep ordinary SQLite backups for disk loss.

Database triggers reject event updates and direct deletion while the parent game exists. Resetting a hand appends a new attempt; it can replace the current hand's result in the existing statistics contract, but does not erase the old event sequence. Explicit **Delete game** removes that game's local history. Existing migration files remain unchanged.

## Request path and consistency

For a command, one synchronous SQLite transaction:

1. Validates the parsed request identity against an existing receipt. An exact retry returns the original response, even after subsequent commands. A reused key with another route/payload returns 409.
2. Reconstructs current gameplay and compares `revision`. Conflicting or stale commands return 409. Illegal actions return 400 before any write.
3. Applies the legal hero action and seeded bot continuation, or constructs a next/reset/replay/branch state.
4. Saves projection, relevant statistics, checkpoint/action/revision events, derived labels and response/request receipts atomically. Any failure rolls everything back.

HTTP retries may occur after a write committed but its response was lost. The branch UI retains its action ID across errors and dialog close/reopen; replaying that request creates one branch. The response receipt may describe an earlier revision intentionally. Clients can fetch the current game separately. Do not reuse action IDs for new intentions.

Historical receipts created before request identities were recorded remain usable through legacy routes. V1 rejects unverifiable legacy receipts and asks for a fresh key. This compatibility exception does not affect receipts created after migration.

## Versioned API

All command inputs use strict Zod validation. `revision` is a nonnegative integer; `actionId` is a UUID. The unversioned table routes remain aliases for existing clients. Existing odds/guide/assistant/optional-solver endpoints remain available at their original paths.

| Method | Route                                 | Input / result                                                                                                |
| ------ | ------------------------------------- | ------------------------------------------------------------------------------------------------------------- |
| POST   | `/api/v1/tables`                      | `{players, dealMode?}` → new table, 201. New-table creation itself has no idempotency key; table commands do. |
| GET    | `/api/v1/tables/:id`                  | Reconstructed current table with ordinary active/completed visibility rules.                                  |
| POST   | `/api/v1/tables/:id/actions`          | `{revision, actionId, action, amount?}`; amount is total chips this street for a raise.                       |
| POST   | `/api/v1/tables/:id/next`             | `{revision, actionId}`; requires completed current hand.                                                      |
| POST   | `/api/v1/tables/:id/reset-hand`       | `{revision, actionId}`; restores the same deal in place, retaining old events.                                |
| POST   | `/api/v1/tables/:id/replay`           | `{revision, actionId}` → separate whole-hand replay, 201 (retry 200).                                         |
| GET    | `/api/v1/tables/:id/events`           | Explicit public event metadata and current revision, never stored payloads.                                   |
| GET    | `/api/v1/tables/:id/events/:sequence` | State **before** a recorded action. A checkpoint/revision is not an inspectable action.                       |
| POST   | `/api/v1/tables/:id/branch`           | `{revision, actionId, sequence}` → separate game before a recorded hero action, 201 (retry 200).              |
| GET    | `/api/v1/tables/:id/decisions`        | Version-1 public feature rows, labels, practice provenance and ranked practice candidates.                    |

Missing games/events return 404; invalid inputs/branch targets return 400; conflicting requests return 409. Event payload version is currently 1. Intentional incompatible engine/reducer changes must retain a versioned replay path or migrate with explicit compatibility evidence; rerunning today's bot policy is not event replay.

## Information boundary

Private checkpoints contain opponents' cards, seed and future board so the server can settle the actual deal. They never cross the API boundary. The public event projection builds an allowlisted shape. A historical state includes hero cards and the board/history visible at that prefix, masks opponents even if the source finished, and strips computed reviews/showdown-hand messages. Later reads/actions do not enter earlier decision frames. Current odds/advice/solver inputs keep their existing public-information boundaries.

A branch copies the private deal internally but exposes only information available at its selected decision. A person may remember cards revealed previously; branch/replay/restarted-attempt data is identified as practice and excluded from independent training examples. Reconstruction creates no statistics or gameplay writes; calculation requests do not advance the game or repair the projection.

## Supervised learning bridge and personalized practice

A [trained fast-assessment screen](usage-data-design.md) now predicts the authored teacher's conditional comparison in a narrow heads-up opening scope. Broad human leak detection and learner personalization are still untrained. This dataset supplies the sequence/context and explicit label provenance needed to build those features without using wins/losses as decision labels:

- Features contain hero cards, current board, street, pot, call price, stack, competing-opponent count, dealer and public history at the decision. The chosen action is separate; there are no opponent holes, runout, seed, payouts or outcome fields.
- Labels reuse analysis version 7 and model-rating version 1. A strictly positive supported regret interval marks a conditional modeled gap. An upper bound of zero marks supported agreement. Unavailable/inconclusive labels remain null or have `modeledGap: null`; they are not negative examples.
- Replay, branch, restarted-attempt and partial legacy decisions have `eligibleForTraining: false`. A genuinely fresh next hand after an ordinary reset can be independent again. A derived branch/replay game retains its practice origin. Grouped validation must split by `groupId` (table ID/hand number), not by individual decision row.
- `practiceCandidates` ranks supported modeled gaps by estimated missed chips in big blinds. The UI selects the recorded decision for inspection and branching. This is conditional bot-model practice selection, not an ML prediction or a poker-skill judgment.

A future trained classifier should add a versioned feature encoder, sufficient independently labeled hands, grouped train/validation splits, calibration and held-out evaluation. These labels inherit authored bot/continuation assumptions; their narrow sampling intervals do not validate human strategy or certify optimal play. The fast assessment was trained separately on synthetic examples; trustworthy human leak detection and personalization require their own data and evaluation. Usage recording, exports and recoverable backups are described in the [data design](usage-data-design.md).

## Verification and limits

`tests/table-events.test.ts` covers deterministic policy-version replay, actual recorded deals, historical masking, branches, checkpoint/revision boundaries and short all-in reopening. `tests/table-events-api.test.ts` covers command identity/races, rollback at receipt failure, old/new-save compatibility, privacy, deletion, projection recovery and dataset selection. `tests/browser/event-history.spec.ts` exercises desktop/mobile history, branches, original preservation, export, focus and uncertain/stale requests. Consult current [PROGRESS.md](../PROGRESS.md) for observed outcomes.

Dataset generation walks each game's journal once; active gameplay reads only its latest checkpoint suffix. History and export remain synchronous local operations and return the whole game's journal/data. Large-history pagination and asynchronous analysis remain future scaling options. Existing strategy caches and optional analysis workers stay in place; no additional queue, remote account, solver download or paid service is required.
