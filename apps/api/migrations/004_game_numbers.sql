CREATE TABLE IF NOT EXISTS bot_game_numbers (
  number INTEGER PRIMARY KEY AUTOINCREMENT,
  table_id TEXT NOT NULL UNIQUE REFERENCES bot_tables(id)
);
INSERT INTO bot_game_numbers(table_id)
SELECT g.table_id FROM bot_games g
WHERE NOT EXISTS (SELECT 1 FROM bot_game_numbers n WHERE n.table_id=g.table_id)
ORDER BY g.started_at, g.rowid;
INSERT OR IGNORE INTO schema_migrations(version) VALUES(4);
