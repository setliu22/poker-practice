import type {
  TableEventReason,
  TableEventView,
} from "../../shared/src/table-events";
import type { TableAction, TableView } from "../../shared/src/table";
import { validateCards } from "./index";
import { act, createTable, legalActions, type TableState } from "./table";

/** Internal durable events: checkpoint states contain private cards and runout. */
export type TableEvent = { sequence: number; version: 1 } & (
  | {
      kind: "checkpoint";
      payload: {
        state: TableState;
        reason: TableEventReason;
        partial?: boolean;
      };
    }
  | {
      kind: "action";
      payload: { seat: number; action: TableAction; amount?: number };
    }
  | { kind: "revision"; payload: { revision: number } }
);

/**
 * Restore the actual deal before any action, including bots before the hero.
 * This never samples policy decisions or derives private cards from the seed.
 * Only use for newly created hands whose complete action sequence is present;
 * old saves without a complete journal must remain partial checkpoints.
 */
export function initialHandState(source: TableState): TableState {
  validateCards(
    [...source.players.flatMap((p) => p.hole), ...source.runout],
    source.players.length * 2 + 5,
    source.players.length * 2 + 5,
  );
  const state = createTable(
    source.id,
    source.players.length,
    source.seed,
    source.dealer,
    source.handNumber,
    source.revision,
    source.policyVersion ?? 1,
    source.startingReads ?? [],
  );
  state.players.forEach((player, seat) => {
    const original = source.players[seat];
    player.hole = [...original.hole];
    player.name = original.name;
    player.style = original.style;
    player.botId = original.botId;
  });
  state.runout = [...source.runout];
  state.dealMode = source.dealMode;
  state.replayOf = source.replayOf && { ...source.replayOf };
  state.branchOf = source.branchOf && { ...source.branchOf };
  state.analysisIdentity = source.analysisIdentity;
  return state;
}

function validateOrder(events: readonly TableEvent[]) {
  events.forEach((event, index) => {
    if (event.version !== 1)
      throw new Error("Unsupported table event version.");
    if (event.sequence !== index + 1)
      throw new Error("Table event sequence is incomplete or out of order.");
  });
}

function applyEvent(
  state: TableState | undefined,
  event: TableEvent,
): TableState {
  if (event.kind === "checkpoint") return structuredClone(event.payload.state);
  if (!state) throw new Error("Table history must begin with a checkpoint.");
  if (event.kind === "action") {
    const { seat, action, amount } = event.payload;
    act(state, seat, action, amount);
  } else if (event.kind === "revision") {
    if (!Number.isInteger(event.payload.revision) || event.payload.revision < 0)
      throw new Error("Invalid table event revision.");
    state.revision = event.payload.revision;
  } else throw new Error("Unknown table event kind.");
  return state;
}

/** Reconstruct the entire journal, or the prefix strictly before an event. */
export function reconstructTable(
  events: readonly TableEvent[],
  beforeSequence?: number,
): TableState {
  validateOrder(events);
  if (
    beforeSequence !== undefined &&
    !events.some((event) => event.sequence === beforeSequence)
  )
    throw new Error("Table event was not found.");
  let state: TableState | undefined;
  const end = beforeSequence === undefined ? events.length : beforeSequence - 1;
  let start = end - 1;
  while (start > 0 && events[start].kind !== "checkpoint") start--;
  for (const event of events.slice(start, end)) {
    if (event.sequence === beforeSequence) break;
    state = applyEvent(state, event);
  }
  if (!state) throw new Error("No table state exists before this event.");
  return state;
}

/** Visit once in order. The state is borrowed for the callback, before actions
 * and after checkpoints/revisions; copy any fields retained by the consumer. */
export function visitTableEvents(
  events: readonly TableEvent[],
  visit: (event: TableEvent, state: TableState) => void,
) {
  validateOrder(events);
  let state: TableState | undefined;
  for (const event of events) {
    if (event.kind !== "action") state = applyEvent(state, event);
    if (!state) throw new Error("Table history must begin with a checkpoint.");
    visit(event, state);
    if (event.kind === "action") state = applyEvent(state, event);
  }
}

/** Action entries describe the decision BEFORE the recorded move was applied. */
export function publicTableEvents(
  events: readonly TableEvent[],
): TableEventView[] {
  validateOrder(events);
  let state: TableState | undefined;
  return events.map((event) => {
    if (event.kind !== "action") state = applyEvent(state, event);
    if (!state) throw new Error("Table history must begin with a checkpoint.");
    const entry: TableEventView = {
      sequence: event.sequence,
      version: 1,
      kind: event.kind,
      handNumber: state.handNumber,
      street: state.street,
      board: [...state.board],
      pot: state.players.reduce((sum, p) => sum + p.contributed, 0),
      heroDecision: false,
    };
    if (event.kind === "checkpoint") {
      entry.reason = event.payload.reason;
      entry.partial = event.payload.partial;
    } else if (event.kind === "action") {
      const { seat, action, amount } = event.payload;
      entry.seat = seat;
      entry.name = state.players[seat]?.name;
      entry.action = action;
      entry.amount = amount;
      entry.heroDecision = seat === 0;
      if (entry.heroDecision) {
        entry.hero = [...state.players[0].hole];
        entry.legal = legalActions(state, 0);
      }
      state = applyEvent(state, event);
    }
    return entry;
  });
}

/** Historical views never reveal showdown hands or analysis computed later. */
export function historicalTableView(state: TableState): TableView {
  return {
    id: state.id,
    revision: state.revision,
    handNumber: state.handNumber,
    dealer: state.dealer,
    street: state.street,
    board: [...state.board],
    pot: state.players.reduce((sum, p) => sum + p.contributed, 0),
    currentBet: state.currentBet,
    actor: state.actor,
    complete: state.complete,
    dealMode: state.dealMode ?? "random",
    replayOf: state.replayOf && { ...state.replayOf },
    branchOf: state.branchOf && { ...state.branchOf },
    players: state.players.map((player) => ({
      seat: player.seat,
      name: player.name,
      style: player.style,
      stack: player.stack,
      streetBet: player.streetBet,
      contributed: player.contributed,
      folded: player.folded,
      allIn: player.allIn,
      payout: player.payout,
      ...(player.seat === 0 ? { hole: [...player.hole] } : {}),
    })),
    legal: state.actor === 0 ? legalActions(state, 0) : null,
    // Settlement messages can contain hand ranks derived from hidden cards.
    // Keep only the engine's public betting and board-deal messages.
    history: state.history
      .filter((entry) =>
        /^(Posts (small|big) blind \d+|Folds|Checks|Calls \d+( \(all-in\))?|(Bets|Raises to) \d+( \(all-in\))?|(Flop|Turn|River) dealt)$/.test(
          entry.text,
        ),
      )
      .map((entry) => ({ ...entry })),
    rounds: [],
    review: [],
  };
}

/** A separate practice game, with only observations known at this decision. */
export function branchTable(
  state: TableState,
  id: string,
  sourceTableId: string,
  sequence: number,
): TableState {
  if (state.complete || state.actor !== 0 || !legalActions(state, 0))
    throw new Error("Choose an active hero decision to branch.");
  if (id === sourceTableId || id === state.id)
    throw new Error("A branch must be a separate game.");
  if (!Number.isInteger(sequence) || sequence < 1)
    throw new Error("Choose a valid decision sequence.");
  const branch = structuredClone(state);
  branch.id = id;
  branch.revision = 0;
  branch.branchOf = {
    tableId: sourceTableId,
    sequence,
    handNumber: state.handNumber,
  };
  branch.analysisIdentity = state.analysisIdentity ?? sourceTableId;
  branch.rounds = [];
  // Frame schema version 1 remains current; computed reviews are rebuilt later.
  branch.analysisVersion = 1;
  return branch;
}
