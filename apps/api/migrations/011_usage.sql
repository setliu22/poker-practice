-- This local identity is pseudonymous, not anonymous. The signing secret is private.
CREATE TABLE IF NOT EXISTS usage_installation (
  singleton INTEGER PRIMARY KEY CHECK(singleton=1),
  id TEXT NOT NULL UNIQUE,
  receipt_secret TEXT NOT NULL,
  created_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS usage_sessions (
  id TEXT PRIMARY KEY,
  created_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS usage_events (
  cursor INTEGER PRIMARY KEY AUTOINCREMENT,
  event_id TEXT NOT NULL,
  version INTEGER NOT NULL CHECK(version=1),
  source TEXT NOT NULL CHECK(source IN ('human-ui','api-unknown')),
  installation_id TEXT NOT NULL,
  session_id TEXT REFERENCES usage_sessions(id) ON DELETE SET NULL,
  table_id TEXT NOT NULL REFERENCES bot_tables(id) ON DELETE CASCADE,
  revision INTEGER NOT NULL CHECK(revision>=0),
  kind TEXT NOT NULL CHECK(kind IN ('decision-viewed','assessment-shown','decision-committed')),
  created_at TEXT NOT NULL,
  payload TEXT NOT NULL,
  UNIQUE(table_id,event_id)
);
CREATE INDEX IF NOT EXISTS usage_events_decision ON usage_events(table_id,revision,kind);
CREATE TRIGGER IF NOT EXISTS usage_events_no_update
BEFORE UPDATE ON usage_events BEGIN
  SELECT RAISE(ABORT, 'Usage events are immutable');
END;
INSERT OR IGNORE INTO schema_migrations(version) VALUES(11);
