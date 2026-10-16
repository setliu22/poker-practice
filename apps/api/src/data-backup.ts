import Database from "better-sqlite3";
import { createHash, randomUUID } from "node:crypto";
import { createReadStream } from "node:fs";
import {
  access,
  chmod,
  link,
  mkdir,
  open,
  readFile,
  rm,
  stat,
  writeFile,
} from "node:fs/promises";
import { constants } from "node:fs";
import { dirname, resolve } from "node:path";

export type BackupManifest = {
  version: 1;
  createdAt: string;
  sha256: string;
  bytes: number;
  schemaVersion: number;
  counts: Record<string, number>;
};
async function hashFile(path: string) {
  const hash = createHash("sha256");
  for await (const chunk of createReadStream(path)) hash.update(chunk);
  return hash.digest("hex");
}
function inspect(path: string) {
  const snapshot = new Database(path, { readonly: true, fileMustExist: true });
  try {
    const integrity = snapshot.pragma("integrity_check") as {
      integrity_check: string;
    }[];
    if (integrity.length !== 1 || integrity[0].integrity_check !== "ok")
      throw new Error("Backup failed SQLite integrity validation.");
    if ((snapshot.pragma("foreign_key_check") as unknown[]).length)
      throw new Error("Backup contains foreign key violations.");
    const migrations = snapshot
      .prepare("SELECT version FROM schema_migrations ORDER BY version")
      .all() as { version: number }[];
    if (!migrations.length || migrations[0].version !== 1)
      throw new Error("This is not a Poker Practice database.");
    const counts: Record<string, number> = {};
    for (const table of [
      "attempts",
      "bot_tables",
      "bot_table_events",
      "usage_events",
      "usage_sessions",
    ]) {
      if (
        snapshot
          .prepare("SELECT 1 FROM sqlite_master WHERE type='table' AND name=?")
          .get(table)
      )
        counts[table] = (
          snapshot.prepare(`SELECT COUNT(*) n FROM ${table}`).get() as {
            n: number;
          }
        ).n;
    }
    return { schemaVersion: migrations.at(-1)!.version, counts };
  } finally {
    snapshot.close();
  }
}
async function assertNew(path: string) {
  try {
    await access(path);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return;
    throw error;
  }
  throw new Error(`Destination already exists: ${path}. Choose a new path.`);
}
async function syncFile(path: string) {
  const file = await open(path, "r");
  try {
    await file.sync();
  } finally {
    await file.close();
  }
}
async function syncDirectory(path: string) {
  const directory = await open(path, "r");
  try {
    await directory.sync();
  } finally {
    await directory.close();
  }
}
/** Online SQLite backup includes committed WAL pages. Never copy a live database file. */
export async function createDataBackup(
  db: Database.Database,
  outputPath: string,
): Promise<BackupManifest> {
  const output = resolve(outputPath),
    manifestPath = `${output}.manifest.json`;
  await assertNew(output);
  await assertNew(manifestPath);
  await assertNew(`${output}-wal`);
  await assertNew(`${output}-shm`);
  await mkdir(dirname(output), { recursive: true });
  const temporary = `${output}.pending-${randomUUID()}`;
  const temporaryManifest = `${temporary}.manifest.json`;
  let outputCreated = false,
    manifestCreated = false;
  try {
    // SQLite can write into an existing empty file. Set private permissions
    // before any learner data reaches the temporary snapshot.
    const reserved = await open(temporary, "wx", 0o600);
    await reserved.close();
    await db.backup(temporary);
    await chmod(temporary, 0o600);
    const inspected = inspect(temporary);
    const manifest: BackupManifest = {
      version: 1,
      createdAt: new Date().toISOString(),
      sha256: await hashFile(temporary),
      bytes: (await stat(temporary)).size,
      ...inspected,
    };
    await writeFile(
      temporaryManifest,
      `${JSON.stringify(manifest, null, 2)}\n`,
      { flag: "wx", mode: 0o600 },
    );
    await syncFile(temporary);
    await syncFile(temporaryManifest);
    // Same-filesystem links publish complete files atomically and refuse overwrite even in races.
    await link(temporary, output);
    outputCreated = true;
    await link(temporaryManifest, manifestPath);
    manifestCreated = true;
    await syncDirectory(dirname(output));
    return manifest;
  } catch (error) {
    if (outputCreated) await rm(output, { force: true });
    if (manifestCreated) await rm(manifestPath, { force: true });
    throw error;
  } finally {
    await rm(temporary, { force: true });
    await rm(temporaryManifest, { force: true });
    await rm(`${temporary}-wal`, { force: true });
    await rm(`${temporary}-shm`, { force: true });
  }
}
/** Restore to a NEW destination only. Browser-downloaded SQLite files have no sidecar. */
export async function restoreDataBackup(
  backupPath: string,
  destinationPath: string,
): Promise<BackupManifest> {
  const source = resolve(backupPath),
    destination = resolve(destinationPath);
  await assertNew(destination);
  await assertNew(`${destination}-wal`);
  await assertNew(`${destination}-shm`);
  await access(source, constants.R_OK);
  await mkdir(dirname(destination), { recursive: true });
  const temporary = `${destination}.restoring-${randomUUID()}`;
  try {
    // Stream into the reserved private file: copyFile copies the source mode,
    // which can expose a downloaded 0644 snapshot during restoration.
    const reserved = await open(temporary, "wx", 0o600);
    try {
      for await (const chunk of createReadStream(source)) {
        const bytes = chunk as Buffer;
        let offset = 0;
        while (offset < bytes.length) {
          const { bytesWritten } = await reserved.write(
            bytes,
            offset,
            bytes.length - offset,
          );
          if (!bytesWritten)
            throw new Error("Unable to write the restored snapshot.");
          offset += bytesWritten;
        }
      }
    } finally {
      await reserved.close();
    }
    const sha256 = await hashFile(temporary),
      bytes = (await stat(temporary)).size;
    let manifest: BackupManifest | undefined;
    try {
      manifest = JSON.parse(
        await readFile(`${source}.manifest.json`, "utf8"),
      ) as BackupManifest;
      if (!manifest || typeof manifest !== "object")
        throw new Error("Invalid backup manifest.");
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
    }
    if (
      manifest &&
      (manifest.version !== 1 ||
        manifest.sha256 !== sha256 ||
        manifest.bytes !== bytes)
    )
      throw new Error("Backup checksum does not match its manifest.");
    const inspected = inspect(temporary);
    if (
      manifest &&
      (manifest.schemaVersion !== inspected.schemaVersion ||
        JSON.stringify(manifest.counts) !== JSON.stringify(inspected.counts))
    )
      throw new Error("Backup metadata does not match its manifest.");
    await syncFile(temporary);
    await link(temporary, destination);
    await syncDirectory(dirname(destination));
    return {
      version: 1,
      createdAt: manifest?.createdAt ?? new Date().toISOString(),
      sha256,
      bytes,
      ...inspected,
    };
  } finally {
    await rm(temporary, { force: true });
    await rm(`${temporary}-wal`, { force: true });
    await rm(`${temporary}-shm`, { force: true });
  }
}
