import type Database from "better-sqlite3";
import {
  initialHandState,
  reconstructTable,
  type TableEvent,
} from "../../../packages/poker/src/table-events";
import type { TableState } from "../../../packages/poker/src/table";
import { recoverFrames } from "../../../packages/poker/src/table-review";
import type { TableEventReason } from "../../../packages/shared/src/table-events";

export function readEvents(
  db: Database.Database,
  id: string,
  currentHandOnly = false,
): TableEvent[] {
  const tail = currentHandOnly
    ? " AND sequence >= (SELECT MAX(sequence) FROM bot_table_events WHERE table_id=? AND kind='checkpoint')"
    : "";
  return (
    db
      .prepare(
        `SELECT sequence,version,kind,payload FROM bot_table_events WHERE table_id=?${tail} ORDER BY sequence`,
      )
      .all(...(currentHandOnly ? [id, id] : [id])) as {
      sequence: number;
      version: 1;
      kind: TableEvent["kind"];
      payload: string;
    }[]
  ).map((row) => ({ ...row, payload: JSON.parse(row.payload) }) as TableEvent);
}
function append(
  db: Database.Database,
  id: string,
  event: Omit<TableEvent, "sequence">,
) {
  const { sequence } = db
    .prepare(
      "SELECT COALESCE(MAX(sequence),0)+1 AS sequence FROM bot_table_events WHERE table_id=?",
    )
    .get(id) as { sequence: number };
  db.prepare("INSERT INTO bot_table_events VALUES(?,?,?,?,?)").run(
    id,
    sequence,
    event.version,
    event.kind,
    JSON.stringify(event.payload),
  );
  return sequence;
}
export function ensureJournal(db: Database.Database, state: TableState) {
  if (
    !db
      .prepare("SELECT 1 FROM bot_table_events WHERE table_id=? LIMIT 1")
      .get(state.id)
  )
    append(db, state.id, {
      version: 1,
      kind: "checkpoint",
      payload: { state, reason: "legacy", partial: true },
    });
}
/** Call only inside the transaction that saves projection, stats and command receipt. */
export function recordTransition(
  db: Database.Database,
  state: TableState,
  before?: TableState,
  reason?: TableEventReason,
) {
  let offset = before?.actions?.length ?? 0;
  let decision = before?.decisions?.length ?? 0;
  let heroSequence: number | undefined;
  if (reason) {
    // Branch checkpoints retain the exact decision prefix. Other new attempts
    // begin before the first bot acts, preserving every opening bot action too.
    const checkpoint =
      reason === "branch" ? structuredClone(state) : initialHandState(state);
    append(db, state.id, {
      version: 1,
      kind: "checkpoint",
      payload: { state: checkpoint, reason },
    });
    offset = checkpoint.actions?.length ?? 0;
    decision = checkpoint.decisions?.length ?? 0;
  }
  for (const { seat, action, amount } of (state.actions ?? []).slice(offset)) {
    const sequence = append(db, state.id, {
      version: 1,
      kind: "action",
      payload: { seat, action, amount },
    });
    if (seat === 0) {
      heroSequence = sequence;
      const round = state.rounds?.find((round) => round.id === decision++);
      if (round?.analysisVersion === 7 && round.modelRating?.version === 1)
        db.prepare("INSERT INTO bot_decision_labels VALUES(?,?,?)").run(
          state.id,
          sequence,
          JSON.stringify({
            source: "conditional-bot-model",
            analysisVersion: 7,
            modelRating: round.modelRating,
          }),
        );
    }
  }
  append(db, state.id, {
    version: 1,
    kind: "revision",
    payload: { revision: state.revision },
  });
  return heroSequence;
}
/** Events own gameplay; cached reviews remain derived, disposable data. */
export function loadTable(
  db: Database.Database,
  id: string,
): TableState | undefined {
  const row = db.prepare("SELECT state FROM bot_tables WHERE id=?").get(id) as
    { state: string } | undefined;
  if (!row) return undefined;
  const events = readEvents(db, id, true);
  if (!events.length) {
    const legacy = JSON.parse(row.state) as TableState;
    // Older saves need their frames/actions recovered before choosing an
    // action suffix or establishing the partial legacy baseline.
    recoverFrames(legacy);
    return legacy;
  }
  // A checkpoint is self-contained. Rebase this private suffix for the reducer's
  // contiguous sequence check; externally visible journal IDs stay unchanged.
  const state = reconstructTable(
    events.map((event) => ({
      ...event,
      sequence: event.sequence - events[0].sequence + 1,
    })),
  );
  let cached: TableState | undefined;
  try {
    cached = JSON.parse(row.state) as TableState;
  } catch {
    /* The journal can rebuild a corrupt projection too. */
  }
  if (
    cached &&
    cached.handNumber === state.handNumber &&
    cached.revision === state.revision &&
    JSON.stringify(cached.decisions) === JSON.stringify(state.decisions)
  ) {
    state.rounds = cached.rounds;
  }
  return state;
}
export function currentRevision(
  db: Database.Database,
  id: string,
): number | undefined {
  const row = db
    .prepare(
      "SELECT json_extract(payload,'$.revision') AS revision FROM bot_table_events WHERE table_id=? AND kind='revision' ORDER BY sequence DESC LIMIT 1",
    )
    .get(id) as { revision: number } | undefined;
  return row?.revision ?? loadTable(db, id)?.revision;
}
