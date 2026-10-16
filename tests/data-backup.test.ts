import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { mkdtemp, readFile, rm, writeFile, readdir } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import Database from "better-sqlite3";
import { openDatabase } from "../apps/api/src/database";
import {
  createDataBackup,
  restoreDataBackup,
} from "../apps/api/src/data-backup";
import { initializeUsage, recordDecisionUsage } from "../apps/api/src/usage";
import { createTable } from "../packages/poker/src/table";
import { recordTransition, readEvents } from "../apps/api/src/table-journal";
import { randomUUID } from "node:crypto";
let directory: string, db: ReturnType<typeof openDatabase>;
beforeEach(async () => {
  directory = await mkdtemp(join(tmpdir(), "poker-backup-test-"));
  db = openDatabase(join(directory, "live.sqlite"));
  db.exec(await readFile("apps/api/migrations/011_usage.sql", "utf8"));
  initializeUsage(db);
});
afterEach(async () => {
  db.close();
  await rm(directory, { recursive: true, force: true });
});
describe("local recoverable snapshots", () => {
  it("backs up committed WAL pages online and restores journal/usage/identity to a new file", async () => {
    expect(db.pragma("synchronous", { simple: true })).toBe(2);
    db.pragma("wal_autocheckpoint=0");
    const state = createTable("saved", 2, 8);
    db.transaction(() => {
      db.prepare("INSERT INTO bot_tables VALUES(?,?)").run(
        state.id,
        JSON.stringify(state),
      );
      recordTransition(db, state, undefined, "created");
      recordDecisionUsage(db, {
        tableId: state.id,
        revision: 0,
        actionId: randomUUID(),
        sequence: 1,
        handNumber: 1,
        action: "call",
        practice: false,
        partial: false,
      });
    })();
    const destination = join(directory, "backup.sqlite"),
      restored = join(directory, "restored.sqlite");
    const manifest = await createDataBackup(db, destination);
    expect(manifest.counts).toMatchObject({ bot_tables: 1, usage_events: 1 });
    expect(JSON.stringify(manifest)).not.toMatch(/receipt_secret|saved|seed/);
    expect(await restoreDataBackup(destination, restored)).toEqual(manifest);
    const recovered = new Database(restored);
    try {
      expect(
        recovered.prepare("SELECT * FROM usage_installation").get(),
      ).toEqual(db.prepare("SELECT * FROM usage_installation").get());
      expect(recovered.prepare("SELECT * FROM usage_events").all()).toEqual(
        db.prepare("SELECT * FROM usage_events").all(),
      );
      expect(readEvents(recovered, "saved")).toEqual(readEvents(db, "saved"));
      expect(recovered.pragma("integrity_check")).toEqual([
        { integrity_check: "ok" },
      ]);
    } finally {
      recovered.close();
    }
  });
  it("refuses overwrite of backups and restores including existing live WAL files", async () => {
    const backup = join(directory, "backup.sqlite");
    await createDataBackup(db, backup);
    await expect(createDataBackup(db, backup)).rejects.toThrow(
      /already exists/,
    );
    await expect(
      restoreDataBackup(backup, join(directory, "live.sqlite")),
    ).rejects.toThrow(/already exists/);
    const target = join(directory, "new.sqlite");
    await writeFile(`${target}-wal`, "");
    await expect(createDataBackup(db, target)).rejects.toThrow(
      /already exists/,
    );
    await expect(restoreDataBackup(backup, target)).rejects.toThrow(
      /already exists/,
    );
  });
  it("rejects corrupted bytes/checksums, foreign key violations and missing inputs with no partial output", async () => {
    const backup = join(directory, "backup.sqlite"),
      target = join(directory, "restored.sqlite");
    await createDataBackup(db, backup);
    const bytes = await readFile(backup);
    bytes[100] ^= 1;
    await writeFile(backup, bytes);
    await expect(restoreDataBackup(backup, target)).rejects.toThrow(/checksum/);
    await expect(
      restoreDataBackup(join(directory, "missing.sqlite"), target),
    ).rejects.toThrow();
    expect(await readdir(directory)).not.toContain("restored.sqlite");
    expect(
      (await readdir(directory)).filter((x) => /pending|restoring/.test(x)),
    ).toEqual([]);
    db.pragma("foreign_keys=OFF");
    db.prepare("INSERT INTO bot_games VALUES('missing','now')").run();
    await expect(
      createDataBackup(db, join(directory, "bad.sqlite")),
    ).rejects.toThrow(/foreign key/);
    expect(await readdir(directory)).not.toContain("bad.sqlite");
  });
  it("accepts a browser-downloaded standalone snapshot after validating SQLite and app identity", async () => {
    const backup = join(directory, "download.sqlite");
    await createDataBackup(db, backup);
    await rm(`${backup}.manifest.json`);
    await expect(
      restoreDataBackup(backup, join(directory, "new.sqlite")),
    ).resolves.toMatchObject({ version: 1, schemaVersion: 13 });
    const invalid = join(directory, "other.sqlite"),
      other = new Database(invalid);
    other.exec("CREATE TABLE unrelated(x)");
    other.close();
    await expect(
      restoreDataBackup(invalid, join(directory, "invalid.sqlite")),
    ).rejects.toThrow();
  });
});
it("upgrades early usage schemas without losing records, identity or deleted export cursor positions", () => {
  const file = join(directory, "early.sqlite");
  const early = openDatabase(file),
    tableId = randomUUID(),
    eventId = randomUUID(),
    installation = early.prepare("SELECT id FROM usage_installation").get() as {
      id: string;
    };
  const state = createTable(tableId, 2, 1);
  early
    .prepare("INSERT INTO bot_tables VALUES(?,?)")
    .run(tableId, JSON.stringify(state));
  early.exec(`DELETE FROM schema_migrations WHERE version=12;
    DROP TABLE usage_events;
    CREATE TABLE usage_events(
      cursor INTEGER PRIMARY KEY AUTOINCREMENT,event_id TEXT NOT NULL UNIQUE,version INTEGER NOT NULL,
      source TEXT NOT NULL CHECK(source='human-ui'),installation_id TEXT NOT NULL,
      session_id TEXT REFERENCES usage_sessions(id),table_id TEXT NOT NULL REFERENCES bot_tables(id),
      revision INTEGER NOT NULL,kind TEXT NOT NULL,created_at TEXT NOT NULL,payload TEXT NOT NULL
    )`);
  early
    .prepare(
      "INSERT INTO usage_events VALUES(41,?,1,'human-ui',?,NULL,?,0,'decision-committed','2026-01-01T00:00:00.000Z','{}')",
    )
    .run(eventId, installation.id, tableId);
  early
    .prepare("UPDATE sqlite_sequence SET seq=80 WHERE name='usage_events'")
    .run();
  early.close();
  const migrated = openDatabase(file);
  try {
    expect(migrated.prepare("SELECT id FROM usage_installation").get()).toEqual(
      installation,
    );
    expect(
      migrated
        .prepare(
          "SELECT cursor,event_id,source,created_at,payload FROM usage_events",
        )
        .get(),
    ).toEqual({
      cursor: 41,
      event_id: eventId,
      source: "api-unknown",
      created_at: "2026-01-01T00:00:00.000Z",
      payload: "{}",
    });
    const otherId = randomUUID(),
      other = createTable(otherId, 2, 2);
    migrated
      .prepare("INSERT INTO bot_tables VALUES(?,?)")
      .run(other.id, JSON.stringify(other));
    recordDecisionUsage(migrated, {
      tableId: other.id,
      revision: 0,
      actionId: eventId,
      sequence: 1,
      handNumber: 1,
      action: "call",
      practice: false,
      partial: false,
    });
    expect(
      migrated
        .prepare("SELECT cursor FROM usage_events WHERE table_id=?")
        .get(other.id),
    ).toEqual({ cursor: 81 });
    expect(() =>
      migrated.prepare("UPDATE usage_events SET payload='{}'").run(),
    ).toThrow(/immutable/);
    expect(
      migrated
        .prepare("SELECT COUNT(*) n FROM schema_migrations WHERE version=12")
        .get(),
    ).toEqual({ n: 1 });
  } finally {
    migrated.close();
  }
  const reopened = openDatabase(file);
  try {
    expect(
      reopened.prepare("SELECT COUNT(*) n FROM usage_events").get(),
    ).toEqual({ n: 2 });
  } finally {
    reopened.close();
  }
});

it("restores learning answers and exact receipts together with installation identity", async () => {
  const { default: request } = await import("supertest");
  const { createApp } = await import("../apps/api/src/app");
  const app = createApp(db),
    base = "/api/v1/learning-path";
  const instanceId = randomUUID();
  await request(app)
    .post(`${base}/instances`)
    .send({
      eventId: randomUUID(),
      instanceId,
      sessionId: randomUUID(),
      contentId: "table-flow",
      contentVersion: "1",
    })
    .expect(200);
  const root = `${base}/instances/${instanceId}/questions/free-check`;
  await request(app)
    .post(`${root}/presented`)
    .send({ eventId: randomUUID() })
    .expect(200);
  const command = {
    requestId: randomUUID(),
    contentVersion: "1",
    answer: { kind: "choice", choiceId: "check" },
  };
  const first = await request(app)
    .post(`${root}/answers`)
    .send(command)
    .expect(200);
  const backup = join(directory, "learning.sqlite"),
    restored = join(directory, "learning-restored.sqlite");
  const manifest = await createDataBackup(db, backup);
  expect(manifest.counts).toMatchObject({
    learning_path_events: 4,
    learning_path_answer_receipts: 1,
  });
  await restoreDataBackup(backup, restored);
  const recovered = openDatabase(restored);
  try {
    const replay = await request(createApp(recovered))
      .post(`${root}/answers`)
      .send(command)
      .expect(200);
    expect(replay.text).toBe(first.text);
    expect(
      recovered.prepare("SELECT * FROM learning_path_events").all(),
    ).toEqual(db.prepare("SELECT * FROM learning_path_events").all());
    expect(
      recovered.prepare("SELECT * FROM learning_path_answer_receipts").all(),
    ).toEqual(db.prepare("SELECT * FROM learning_path_answer_receipts").all());
  } finally {
    recovered.close();
  }
});
