import Database from "better-sqlite3";
import { mkdirSync, readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
export function openDatabase(
  path = process.env.POKER_DB ?? resolve("data/poker.sqlite"),
) {
  if (path !== ":memory:") mkdirSync(dirname(path), { recursive: true });
  const db = new Database(path);
  db.pragma("journal_mode = WAL");
  db.pragma("foreign_keys = ON");
  db.exec(readFileSync(resolve("apps/api/migrations/001_initial.sql"), "utf8"));
  db.exec(
    readFileSync(resolve("apps/api/migrations/002_bot_tables.sql"), "utf8"),
  );
  db.exec(
    readFileSync(resolve("apps/api/migrations/003_bot_games.sql"), "utf8"),
  );
  db.exec(
    readFileSync(resolve("apps/api/migrations/004_game_numbers.sql"), "utf8"),
  );
  db.exec(
    readFileSync(resolve("apps/api/migrations/005_solver_charts.sql"), "utf8"),
  );
  db.exec(
    readFileSync(resolve("apps/api/migrations/006_learning.sql"), "utf8"),
  );
  db.exec(
    readFileSync(resolve("apps/api/migrations/007_read_lesson.sql"), "utf8"),
  );

  db.exec(
    readFileSync(
      resolve("apps/api/migrations/008_generated_decisions.sql"),
      "utf8",
    ),
  );
  db.exec(
    readFileSync(resolve("apps/api/migrations/009_cash_practice.sql"), "utf8"),
  );
  return db;
}
