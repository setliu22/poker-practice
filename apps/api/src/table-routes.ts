import { Router } from "express";
import type Database from "better-sqlite3";
import { randomUUID, randomInt } from "node:crypto";
import {
  tableActionSchema,
  tableCreateSchema,
  tableNextSchema,
  type TableView,
} from "../../../packages/shared/src/table";
import {
  tableBranchSchema,
  type TableEventHistory,
} from "../../../packages/shared/src/table-events";
import type {
  DecisionDataset,
  DecisionExample,
} from "../../../packages/shared/src/decision-dataset";
import {
  act,
  runBots,
  replayTable,
  resetHand,
  tableView,
  type TableState,
} from "../../../packages/poker/src/table";
import {
  branchTable,
  historicalTableView,
  publicTableEvents,
  reconstructTable,
  visitTableEvents,
} from "../../../packages/poker/src/table-events";
import { analyzeTable } from "../../../packages/poker/src/table-review";
import { createPracticeTable } from "../../../packages/poker/src/easy-deals";
import { saveHandStats } from "./game-stats";
import {
  createExposureReceipt,
  recordDecisionUsage,
  usageSessionId,
} from "./usage";
import { fastAssessmentRequestSchema } from "../../../packages/shared/src/fast-assessment";
import { fastAssessment } from "../../../packages/poker/src/fast-assessment";
import {
  publicAssessmentSnapshot,
  validatePublicCandidate,
} from "../../../packages/poker/src/fast-assessment-features";
import {
  currentRevision,
  ensureJournal,
  loadTable,
  readEvents,
  recordTransition,
} from "./table-journal";

type Result = { status: number; body: TableView | { error: string } };
function insertGame(db: Database.Database, state: TableState) {
  db.prepare("INSERT INTO bot_tables VALUES(?,?)").run(
    state.id,
    JSON.stringify(state),
  );
  db.prepare("INSERT INTO bot_games VALUES(?,?)").run(
    state.id,
    new Date().toISOString(),
  );
  db.prepare("INSERT INTO bot_game_numbers(table_id) VALUES(?)").run(state.id);
}

export function tableRoutes(db: Database.Database) {
  const router = Router();
  router.post("/:id/fast-assessment", (req, res) => {
    const { revision, ...candidate } = fastAssessmentRequestSchema.parse(
      req.body,
    );
    const state = loadTable(db, req.params.id);
    if (!state) return void res.status(404).json({ error: "Table not found." });
    if (state.revision !== revision)
      return void res
        .status(409)
        .json({
          error: "This decision changed. Assess the current action instead.",
        });
    const invalid = validatePublicCandidate(
      publicAssessmentSnapshot(state),
      candidate,
    );
    if (invalid) return void res.status(400).json({ error: invalid });
    let result;
    try {
      result = fastAssessment(state, candidate);
    } catch (error) {
      return void res.status(400).json({ error: (error as Error).message });
    }
    const usageReceipt = createExposureReceipt(db, {
      tableId: state.id,
      revision,
      assessment: {
        kind: "fast",
        modelId: result.modelId,
        action: candidate.action,
        ...(candidate.amount === undefined ? {} : { amount: candidate.amount }),
        result:
          result.status === "ready"
            ? result.label === "model-gap"
              ? "modeled-gap"
              : "no-clear-gap"
            : result.status,
        ...(result.probability === null
          ? {}
          : { probability: result.probability }),
      },
    });
    // Inference and receipt issuance are pure reads. Only actual UI display
    // acknowledgements write a usage fact at /api/v1/usage/exposures.
    res.json({
      ...result,
      revision,
      handNumber: state.handNumber,
      usageReceipt,
    });
  });
  router.post("/", (req, res) => {
    const { players, dealMode } = tableCreateSchema.parse(req.body);
    const state = runBots(
      createPracticeTable(
        randomUUID(),
        players,
        randomInt(0, 4294967295),
        dealMode,
      ),
    );
    db.transaction(() => {
      insertGame(db, state);
      recordTransition(db, state, undefined, "created");
      saveHandStats(db, state);
    })();
    res.status(201).json(tableView(state));
  });
  router.get("/:id", (req, res) => {
    const state = loadTable(db, req.params.id);
    if (!state)
      return void res
        .status(404)
        .json({ error: "Table not found. Start a new table." });
    analyzeTable(state);
    const saved = db.transaction(() => {
      if (currentRevision(db, state.id) !== state.revision) return false;
      db.prepare("UPDATE bot_tables SET state=? WHERE id=?").run(
        JSON.stringify(state),
        state.id,
      );
      saveHandStats(db, state);
      return true;
    })();
    if (!saved)
      return void res.status(409).json({
        error: "This table changed while loading. Reload its current state.",
      });
    res.json(tableView(state));
  });
  router.get("/:id/events", (req, res) => {
    const state = loadTable(db, req.params.id);
    if (!state) return void res.status(404).json({ error: "Table not found." });
    const result: TableEventHistory = {
      tableId: state.id,
      revision: state.revision,
      events: publicTableEvents(readEvents(db, state.id)),
    };
    res.json(result);
  });
  router.get("/:id/events/:sequence", (req, res) => {
    if (!db.prepare("SELECT 1 FROM bot_tables WHERE id=?").get(req.params.id))
      return void res.status(404).json({ error: "Table not found." });
    const sequence = Number(req.params.sequence);
    if (!Number.isSafeInteger(sequence) || sequence < 1)
      return void res
        .status(400)
        .json({ error: "Choose a valid event sequence." });
    const events = readEvents(db, req.params.id);
    const event = events.find((event) => event.sequence === sequence);
    if (!event)
      return void res
        .status(404)
        .json({ error: "This recorded event was not found." });
    if (event.kind !== "action")
      return void res
        .status(400)
        .json({ error: "Choose a recorded action to inspect." });
    res.json(historicalTableView(reconstructTable(events, sequence)));
  });
  router.get("/:id/decisions", (req, res) => {
    const state = loadTable(db, req.params.id);
    if (!state) return void res.status(404).json({ error: "Table not found." });
    const events = readEvents(db, state.id);
    const labels = new Map(
      (
        db
          .prepare(
            "SELECT sequence,data FROM bot_decision_labels WHERE table_id=?",
          )
          .all(state.id) as { sequence: number; data: string }[]
      ).map((row) => [
        row.sequence,
        JSON.parse(row.data) as NonNullable<DecisionExample["label"]>,
      ]),
    );
    const examples: DecisionExample[] = [];
    let practice = false,
      partial = false;
    visitTableEvents(events, (event, before) => {
      if (event.kind === "checkpoint") {
        practice =
          event.payload.reason === "reset" ||
          event.payload.reason === "replay" ||
          event.payload.reason === "branch" ||
          Boolean(before.replayOf || before.branchOf);
        partial = Boolean(event.payload.partial);
      }
      if (event.kind !== "action" || event.payload.seat !== 0) return;
      const view = historicalTableView(before);
      const label = labels.get(event.sequence) ?? null;
      if (label) {
        const interval = label.modelRating.regretIntervalBb;
        label.modeledGap = interval
          ? interval[0] > 0
            ? true
            : interval[1] <= 0
              ? false
              : null
          : null;
      }
      examples.push({
        sequence: event.sequence,
        handNumber: before.handNumber,
        groupId: `${state.id}/${before.handNumber}`,
        practice,
        eligibleForTraining:
          !practice && !partial && label?.modeledGap !== null && label !== null,
        features: {
          street: before.street,
          hero: [...before.players[0].hole],
          board: [...before.board],
          pot: view.pot,
          toCall: view.legal?.toCall ?? 0,
          stack: before.players[0].stack,
          opponents: before.players.filter(
            (player) => player.seat !== 0 && !player.folded,
          ).length,
          dealer: before.dealer,
          history: view.history,
        },
        chosen: {
          action: event.payload.action,
          ...(event.payload.amount === undefined
            ? {}
            : { amount: event.payload.amount }),
        },
        label,
      });
    });
    const result: DecisionDataset = {
      version: 1,
      tableId: state.id,
      revision: state.revision,
      note: "Labels compare actions within the authored bot model, not optimal play or general poker skill. Null labels are unscored or inconclusive. Replay, branch, restarted and partial legacy decisions are excluded from independent training samples. Split evaluation by groupId (hand), never by decision row. No supervised detector has been trained.",
      examples,
      practiceCandidates: examples
        .filter((example) => example.label?.modeledGap === true)
        .sort(
          (a, b) =>
            (b.label!.modelRating.regretBb ?? 0) -
            (a.label!.modelRating.regretBb ?? 0),
        )
        .map((example) => example.sequence),
    };
    res.json(result);
  });
  for (const route of [
    "actions",
    "next",
    "reset-hand",
    "replay",
    "branch",
  ] as const) {
    router.post(`/:id/${route}`, (req, res) => {
      const sessionId = usageSessionId(req.get("X-Practice-Session"));
      const input =
        route === "actions"
          ? tableActionSchema.parse(req.body)
          : route === "branch"
            ? tableBranchSchema.parse(req.body)
            : tableNextSchema.parse(req.body);
      const identity = JSON.stringify({ route, ...input });
      const result: Result = db.transaction((): Result => {
        const saved = db
          .prepare(
            "SELECT c.response,r.request FROM bot_commands c LEFT JOIN bot_command_requests r ON r.table_id=c.table_id AND r.action_id=c.action_id WHERE c.table_id=? AND c.action_id=?",
          )
          .get(req.params.id, input.actionId) as
          { response: string; request: string | null } | undefined;
        if (saved) {
          // Old receipts do not contain a verifiable payload. Preserve their
          // retry contract on old routes; v1 clients must use a new key.
          if (
            (saved.request && saved.request !== identity) ||
            (!saved.request && req.baseUrl.includes("/v1/"))
          )
            return {
              status: 409,
              body: {
                error:
                  "This action ID already belongs to a different or legacy request. Use a new action ID for a new command.",
              },
            };
          return { status: 200, body: JSON.parse(saved.response) };
        }
        const source = loadTable(db, req.params.id);
        if (!source)
          return {
            status: 404,
            body: { error: "Table not found. Start a new table." },
          };
        if (source.revision !== input.revision)
          return {
            status: 409,
            body: {
              error: "This table has changed. Reload its current state.",
            },
          };
        if ((route === "next" || route === "replay") && !source.complete)
          return {
            status: 400,
            body: {
              error:
                "Finish the current hand before replaying it or dealing the next hand.",
            },
          };
        let state: TableState;
        if (route === "branch") {
          const { sequence } = tableBranchSchema.parse(input);
          const events = readEvents(db, source.id);
          const target = events.find((event) => event.sequence === sequence);
          if (!target || target.kind !== "action" || target.payload.seat !== 0)
            return {
              status: 400,
              body: { error: "Choose a recorded hero decision to branch." },
            };
          state = branchTable(
            reconstructTable(events, sequence),
            randomUUID(),
            source.id,
            sequence,
          );
        } else if (route === "replay")
          state = replayTable(source, randomUUID());
        else if (route === "reset-hand") state = resetHand(source);
        else if (route === "next") {
          state = runBots(
            createPracticeTable(
              source.id,
              source.players.length,
              randomInt(0, 4294967295),
              source.dealMode ?? "random",
              source.dealer + 1,
              source.handNumber + 1,
              source.revision + 1,
              2,
              source.reads ?? [],
            ),
          );
          state.branchOf = source.branchOf;
          state.replayOf = source.replayOf;
        } else {
          // Invalid poker actions must not append even a legacy checkpoint.
          state = structuredClone(source);
          const action = tableActionSchema.parse(input);
          try {
            act(state, 0, action.action, action.amount);
            runBots(state);
          } catch (error) {
            return { status: 400, body: { error: (error as Error).message } };
          }
          state.revision++;
        }
        if (route === "actions" || route === "next") analyzeTable(state);
        // All writes below roll back together on any SQLite/analysis failure.
        ensureJournal(db, source);
        if (route === "branch" || route === "replay") insertGame(db, state);
        else
          db.prepare("UPDATE bot_tables SET state=? WHERE id=?").run(
            JSON.stringify(state),
            state.id,
          );
        if (route === "reset-hand")
          db.prepare(
            "DELETE FROM bot_hand_stats WHERE table_id=? AND hand_number=?",
          ).run(source.id, source.handNumber);
        if (route === "next") saveHandStats(db, source);
        saveHandStats(db, state);
        const sequence = recordTransition(
          db,
          state,
          source,
          route === "actions"
            ? undefined
            : route === "reset-hand"
              ? "reset"
              : route,
        );
        if (route === "actions" && sequence !== undefined) {
          const checkpoint = readEvents(db, source.id, true)[0];
          const beforeView = historicalTableView(source);
          const chosen = tableActionSchema.parse(input);
          recordDecisionUsage(db, {
            tableId: source.id,
            revision: source.revision,
            actionId: input.actionId,
            sequence,
            handNumber: source.handNumber,
            action: chosen.action,
            ...(chosen.amount === undefined ? {} : { amount: chosen.amount }),
            sessionId,
            practice: Boolean(
              source.branchOf ||
              source.replayOf ||
              (checkpoint?.kind === "checkpoint" &&
                ["reset", "replay", "branch"].includes(
                  checkpoint.payload.reason,
                )),
            ),
            partial:
              checkpoint?.kind === "checkpoint" &&
              Boolean(checkpoint.payload.partial),
            publicFeatures: {
              street: source.street as "preflop" | "flop" | "turn" | "river",
              hero: [...source.players[0].hole],
              board: [...source.board],
              pot: beforeView.pot,
              toCall: beforeView.legal?.toCall ?? 0,
              stack: source.players[0].stack,
              opponents: source.players.filter(
                (player) => player.seat !== 0 && !player.folded,
              ).length,
              dealer: source.dealer,
              history: beforeView.history,
            },
          });
        }
        const view = tableView(state);
        db.prepare("INSERT INTO bot_commands VALUES(?,?,?)").run(
          source.id,
          input.actionId,
          JSON.stringify(view),
        );
        db.prepare("INSERT INTO bot_command_requests VALUES(?,?,?)").run(
          source.id,
          input.actionId,
          identity,
        );
        return {
          status: route === "branch" || route === "replay" ? 201 : 200,
          body: view,
        };
      })();
      res.status(result.status).json(result.body);
    });
  }
  return router;
}
