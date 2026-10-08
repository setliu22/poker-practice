CREATE TABLE IF NOT EXISTS bot_tables(id TEXT PRIMARY KEY, state TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS bot_commands(table_id TEXT NOT NULL REFERENCES bot_tables(id), action_id TEXT NOT NULL, response TEXT NOT NULL, PRIMARY KEY(table_id, action_id));
INSERT OR IGNORE INTO schema_migrations(version) VALUES(2);
