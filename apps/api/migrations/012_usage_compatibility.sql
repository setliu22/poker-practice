-- Upgrade early usage ledgers without losing events or their export cursor.
CREATE TEMP TABLE usage_cursor_checkpoint AS
SELECT COALESCE((SELECT seq FROM sqlite_sequence WHERE name='usage_events'),0) AS value;
CREATE TABLE usage_events_v12 (
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
INSERT INTO usage_events_v12(cursor,event_id,version,source,installation_id,session_id,table_id,revision,kind,created_at,payload)
SELECT cursor,event_id,version,CASE WHEN session_id IS NULL THEN 'api-unknown' ELSE source END,
       installation_id,session_id,table_id,revision,kind,created_at,payload
FROM usage_events ORDER BY cursor;
DROP TABLE usage_events;
ALTER TABLE usage_events_v12 RENAME TO usage_events;
UPDATE sqlite_sequence SET seq=MAX(seq,(SELECT value FROM usage_cursor_checkpoint)) WHERE name='usage_events';
INSERT INTO sqlite_sequence(name,seq)
SELECT 'usage_events',value FROM usage_cursor_checkpoint WHERE NOT EXISTS(SELECT 1 FROM sqlite_sequence WHERE name='usage_events');
DROP TABLE usage_cursor_checkpoint;
CREATE INDEX usage_events_decision ON usage_events(table_id,revision,kind);
CREATE TRIGGER usage_events_no_update
BEFORE UPDATE ON usage_events BEGIN
  SELECT RAISE(ABORT, 'Usage events are immutable');
END;
INSERT INTO schema_migrations(version) VALUES(12);
