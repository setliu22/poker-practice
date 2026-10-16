import type Database from "better-sqlite3";
import { Router } from "express";
import {
  createHmac,
  randomBytes,
  randomUUID,
  timingSafeEqual,
} from "node:crypto";
import { z } from "zod";
import { currentRevision } from "./table-journal";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createDataBackup } from "./data-backup";
import {
  assessmentExposureSchema,
  usageExposureSchema,
  usageSessionSchema,
  usageViewedSchema,
  type AssessmentExposure,
  type UsageEvent,
  type UsageExport,
  type UsageSummary,
} from "../../../packages/shared/src/usage";

const uuid = z.uuid();
const revisionSchema = z.number().int().nonnegative();
type Identity = { id: string; receipt_secret: string };
export function initializeUsage(db: Database.Database): Identity {
  db.prepare("INSERT OR IGNORE INTO usage_installation VALUES(1,?,?,?)").run(
    randomUUID(),
    randomBytes(32).toString("hex"),
    new Date().toISOString(),
  );
  return db
    .prepare(
      "SELECT id,receipt_secret FROM usage_installation WHERE singleton=1",
    )
    .get() as Identity;
}
function identity(db: Database.Database): Identity {
  const saved = db
    .prepare(
      "SELECT id,receipt_secret FROM usage_installation WHERE singleton=1",
    )
    .get() as Identity | undefined;
  if (!saved)
    throw new Error(
      "Usage identity must be initialized when opening the database.",
    );
  return saved;
}
export function usageSessionId(value: unknown): string | undefined {
  return value === undefined ? undefined : uuid.parse(value);
}
function ensureSession(db: Database.Database, sessionId?: string) {
  if (sessionId)
    db.prepare("INSERT OR IGNORE INTO usage_sessions VALUES(?,?)").run(
      uuid.parse(sessionId),
      new Date().toISOString(),
    );
}
class UsageConflict extends Error {
  status = 409;
}
type Recorded = {
  eventId: string;
  sessionId?: string;
  tableId: string;
  revision: number;
  kind: UsageEvent["kind"];
  payload: Record<string, unknown>;
};
function append(db: Database.Database, input: Recorded) {
  uuid.parse(input.eventId);
  z.string().min(1).max(200).parse(input.tableId);
  revisionSchema.parse(input.revision);
  if (input.sessionId) uuid.parse(input.sessionId);
  const payload = JSON.stringify(input.payload);
  const existing = db
    .prepare("SELECT * FROM usage_events WHERE table_id=? AND event_id=?")
    .get(input.tableId, input.eventId) as Record<string, unknown> | undefined;
  if (existing) {
    if (
      existing.table_id !== input.tableId ||
      existing.revision !== input.revision ||
      existing.kind !== input.kind ||
      existing.payload !== payload ||
      existing.session_id !== (input.sessionId ?? null)
    )
      throw new UsageConflict(
        "This usage event ID belongs to a different event.",
      );
    return false;
  }
  ensureSession(db, input.sessionId);
  db.prepare(
    "INSERT INTO usage_events(event_id,version,source,installation_id,session_id,table_id,revision,kind,created_at,payload) VALUES(?,1,?,?,?,?,?,?,?,?)",
  ).run(
    input.eventId,
    input.sessionId ? "human-ui" : "api-unknown",
    identity(db).id,
    input.sessionId ?? null,
    input.tableId,
    input.revision,
    input.kind,
    new Date().toISOString(),
    payload,
  );
  return true;
}
const publicFeaturesSchema = z
  .object({
    street: z.enum(["preflop", "flop", "turn", "river", "showdown"]),
    hero: z.array(z.string().regex(/^[2-9TJQKA][cdhs]$/)).length(2),
    board: z.array(z.string().regex(/^[2-9TJQKA][cdhs]$/)).max(5),
    pot: z.number().nonnegative(),
    toCall: z.number().nonnegative(),
    stack: z.number().nonnegative(),
    opponents: z.number().int().min(0).max(8),
    dealer: z.number().int().min(0).max(8).optional(),
    history: z
      .array(
        z
          .object({
            street: z.string().max(20),
            seat: z.number().int().min(0).max(8).nullable(),
            text: z.string().max(500),
          })
          .strict(),
      )
      .max(1000)
      .optional(),
  })
  .strict();
/** Must run inside the gameplay command transaction, using its source revision. */
export function recordDecisionUsage(
  db: Database.Database,
  input: {
    tableId: string;
    revision: number;
    actionId: string;
    sequence: number;
    handNumber: number;
    action: "fold" | "check" | "call" | "raise";
    amount?: number;
    practice: boolean;
    partial: boolean;
    sessionId?: string;
    publicFeatures?: z.infer<typeof publicFeaturesSchema>;
  },
) {
  const payload = z
    .object({
      sequence: z.number().int().positive(),
      handNumber: z.number().int().positive(),
      action: z.enum(["fold", "check", "call", "raise"]),
      amount: z.number().nonnegative().optional(),
      practice: z.boolean(),
      partial: z.boolean(),
      publicFeatures: publicFeaturesSchema.optional(),
    })
    .strict()
    .parse({
      sequence: input.sequence,
      handNumber: input.handNumber,
      action: input.action,
      ...(input.amount === undefined ? {} : { amount: input.amount }),
      practice: input.practice,
      partial: input.partial,
      ...(input.publicFeatures === undefined
        ? {}
        : { publicFeatures: input.publicFeatures }),
    });
  return append(db, {
    eventId: input.actionId,
    tableId: input.tableId,
    revision: input.revision,
    sessionId: input.sessionId,
    kind: "decision-committed",
    payload,
  });
}
const signedSchema = z
  .object({
    version: z.literal(1),
    eventId: z.uuid(),
    tableId: z.string().min(1).max(200),
    revision: revisionSchema,
    issuedAt: z.string().datetime(),
    assessment: assessmentExposureSchema,
  })
  .strict();
/** Pure read of the persisted identity: issuing a prediction receipt writes no data. */
export function createExposureReceipt(
  db: Database.Database,
  input: {
    tableId: string;
    revision: number;
    assessment: AssessmentExposure;
  },
): string {
  const value = signedSchema.parse({
    version: 1,
    eventId: randomUUID(),
    ...input,
    issuedAt: new Date().toISOString(),
  });
  const encoded = Buffer.from(JSON.stringify(value)).toString("base64url");
  return `${encoded}.${createHmac("sha256", identity(db).receipt_secret).update(encoded).digest("base64url")}`;
}
function readReceipt(db: Database.Database, receipt: string) {
  const parts = receipt.split(".");
  if (parts.length !== 2) throw new Error("Invalid assessment receipt.");
  const expected = createHmac("sha256", identity(db).receipt_secret)
    .update(parts[0])
    .digest();
  const signature = Buffer.from(parts[1], "base64url");
  if (
    signature.length !== expected.length ||
    !timingSafeEqual(signature, expected)
  )
    throw new Error("Invalid assessment receipt.");
  return signedSchema.parse(
    JSON.parse(Buffer.from(parts[0], "base64url").toString("utf8")),
  );
}
export function usageRoutes(db: Database.Database) {
  const router = Router();
  router.post("/sessions", (req, res) => {
    const { id } = usageSessionSchema.parse(req.body);
    ensureSession(db, id);
    res.json({ id });
  });
  router.post("/viewed", (req, res) => {
    const input = usageViewedSchema.parse(req.body);
    const result = db.transaction(() => {
      // Permit exact retries after gameplay advances; new stale events are rejected.
      const existing = db
        .prepare("SELECT 1 FROM usage_events WHERE table_id=? AND event_id=?")
        .get(input.tableId, input.eventId);
      const current = currentRevision(db, input.tableId);
      if (current === undefined)
        return { status: 404, body: { error: "Table not found." } };
      if (!existing && current !== input.revision)
        return {
          status: 409,
          body: { error: "This decision is no longer current." },
        };
      try {
        append(db, { ...input, kind: "decision-viewed", payload: {} });
      } catch (error) {
        if (error instanceof UsageConflict)
          return { status: 409, body: { error: error.message } };
        throw error;
      }
      return { status: 200, body: { recorded: true } };
    })();
    res.status(result.status).json(result.body);
  });
  router.post("/exposures", (req, res) => {
    const input = usageExposureSchema.parse(req.body);
    let value: z.infer<typeof signedSchema>;
    try {
      value = readReceipt(db, input.receipt);
    } catch {
      return void res
        .status(400)
        .json({ error: "Invalid assessment receipt." });
    }
    const result = db.transaction(() => {
      if (currentRevision(db, value.tableId) === undefined)
        return { status: 404, body: { error: "Table not found." } };
      try {
        append(db, {
          eventId: value.eventId,
          tableId: value.tableId,
          revision: value.revision,
          sessionId: input.sessionId,
          kind: "assessment-shown",
          payload: { ...value.assessment, issuedAt: value.issuedAt },
        });
      } catch (error) {
        if (error instanceof UsageConflict)
          return { status: 409, body: { error: error.message } };
        throw error;
      }
      return { status: 200, body: { recorded: true } };
    })();
    res.status(result.status).json(result.body);
  });
  router.get("/backup", async (_req, res) => {
    const directory = await mkdtemp(join(tmpdir(), "poker-backup-"));
    const output = join(directory, "poker-practice.sqlite");
    try {
      const manifest = await createDataBackup(db, output);
      res.setHeader("X-Backup-SHA256", manifest.sha256);
      res.download(output, "poker-practice.sqlite", () => {
        void rm(directory, { recursive: true, force: true });
      });
    } catch (error) {
      await rm(directory, { recursive: true, force: true });
      throw error;
    }
  });
  router.get("/summary", (_req, res) => {
    const count = (sql: string) => (db.prepare(sql).get() as { n: number }).n;
    const decisions = count(
      "SELECT COUNT(*) n FROM usage_events WHERE kind='decision-committed'",
    );
    // Known assistance requires the same session and server acknowledgement before committing.
    const known = count(
      `SELECT COUNT(*) n FROM usage_events d WHERE d.kind='decision-committed' AND d.session_id IS NOT NULL AND EXISTS(SELECT 1 FROM usage_events e WHERE e.kind='assessment-shown' AND e.table_id=d.table_id AND e.revision=d.revision AND e.session_id=d.session_id AND e.cursor<d.cursor)`,
    );
    const body: UsageSummary = {
      version: 1,
      installationId: identity(db).id,
      bySource: {
        humanUi: count(
          "SELECT COUNT(*) n FROM usage_events WHERE source='human-ui'",
        ),
        apiUnknown: count(
          "SELECT COUNT(*) n FROM usage_events WHERE source='api-unknown'",
        ),
      },
      sessions: count("SELECT COUNT(*) n FROM usage_sessions"),
      events: count("SELECT COUNT(*) n FROM usage_events"),
      decisions,
      viewed: count(
        "SELECT COUNT(*) n FROM usage_events WHERE kind='decision-viewed'",
      ),
      exposures: count(
        "SELECT COUNT(*) n FROM usage_events WHERE kind='assessment-shown'",
      ),
      decisionsWithKnownExposure: known,
      decisionsWithUnknownAssistance: decisions - known,
      note: "Local events: human-ui means a client-reported session; api-unknown means no session. These are not verified identities. No synthetic training records. Missing exposure telemetry means unknown assistance, not independent play. Known exposures require acknowledgement in the same session before committing. Backups may retain deleted data until you delete those files.",
    };
    res.json(body);
  });
  router.get("/export", (req, res) => {
    const query = z
      .object({
        after: z.coerce.number().int().nonnegative().default(0),
        through: z.coerce.number().int().nonnegative().optional(),
        limit: z.coerce.number().int().min(1).max(1000).default(200),
      })
      .strict()
      .parse(req.query);
    const result = db.transaction(() => {
      const highwater = (
        db
          .prepare("SELECT COALESCE(MAX(cursor),0) n FROM usage_events")
          .get() as { n: number }
      ).n;
      const through = query.through ?? highwater;
      const rows = db
        .prepare(
          "SELECT * FROM usage_events WHERE cursor>? AND cursor<=? ORDER BY cursor LIMIT ?",
        )
        .all(query.after, through, query.limit + 1) as Record<
        string,
        unknown
      >[];
      const events: UsageEvent[] = rows.slice(0, query.limit).map((row) => ({
        cursor: row.cursor as number,
        eventId: row.event_id as string,
        version: 1,
        source: row.source as UsageEvent["source"],
        installationId: row.installation_id as string,
        sessionId: row.session_id as string | null,
        tableId: row.table_id as string,
        revision: row.revision as number,
        kind: row.kind as UsageEvent["kind"],
        createdAt: row.created_at as string,
        payload: JSON.parse(row.payload as string),
      }));
      const body: UsageExport = {
        version: 1,
        installationId: identity(db).id,
        through,
        next: events.at(-1)?.cursor ?? query.after,
        hasMore: rows.length > query.limit,
        events,
      };
      return body;
    })();
    res.json(result);
  });
  router.delete("/", (_req, res) => {
    db.transaction(() => {
      db.prepare("DELETE FROM usage_events").run();
      db.prepare("DELETE FROM usage_sessions").run();
      db.prepare(
        "UPDATE usage_installation SET id=?,receipt_secret=?,created_at=? WHERE singleton=1",
      ).run(
        randomUUID(),
        randomBytes(32).toString("hex"),
        new Date().toISOString(),
      );
    })();
    res.json({
      deleted: true,
      note: "Gameplay preserved. Delete your backup files separately to erase their copies.",
    });
  });
  return router;
}
