CREATE TABLE IF NOT EXISTS bot_games (
  table_id TEXT PRIMARY KEY REFERENCES bot_tables(id),
  started_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS bot_hand_stats (
  table_id TEXT NOT NULL REFERENCES bot_tables(id),
  hand_number INTEGER NOT NULL,
  data TEXT NOT NULL,
  PRIMARY KEY(table_id, hand_number)
);
INSERT OR IGNORE INTO bot_games(table_id, started_at)
SELECT id, strftime('%Y-%m-%dT%H:%M:%fZ','now') FROM bot_tables;
INSERT OR IGNORE INTO schema_migrations(version) VALUES(3);
