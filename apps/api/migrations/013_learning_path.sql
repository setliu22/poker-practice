CREATE TABLE IF NOT EXISTS learning_path_events (
  cursor INTEGER PRIMARY KEY AUTOINCREMENT,
  event_id TEXT NOT NULL UNIQUE,
  schema_version INTEGER NOT NULL CHECK(schema_version=1),
  installation_id TEXT NOT NULL,
  session_id TEXT NOT NULL,
  instance_id TEXT NOT NULL,
  content_id TEXT NOT NULL,
  content_version TEXT NOT NULL,
  kind TEXT NOT NULL CHECK(kind IN ('lesson-opened','lesson-resumed','question-presented','answer-submitted','feedback-generated','feedback-shown','lesson-completed')),
  created_at TEXT NOT NULL,
  payload TEXT NOT NULL CHECK(json_valid(payload))
);
CREATE INDEX IF NOT EXISTS learning_path_events_instance ON learning_path_events(instance_id,cursor);
CREATE TABLE IF NOT EXISTS learning_path_answer_receipts (
  request_id TEXT PRIMARY KEY,
  instance_id TEXT NOT NULL,
  question_id TEXT NOT NULL,
  payload_hash TEXT NOT NULL,
  event_cursor INTEGER NOT NULL REFERENCES learning_path_events(cursor),
  response_json TEXT NOT NULL CHECK(json_valid(response_json)),
  UNIQUE(instance_id,question_id)
);
CREATE TRIGGER IF NOT EXISTS learning_path_events_no_update
BEFORE UPDATE ON learning_path_events BEGIN
  SELECT RAISE(ABORT, 'Learning path events are immutable');
END;
CREATE TRIGGER IF NOT EXISTS learning_path_receipts_no_update
BEFORE UPDATE ON learning_path_answer_receipts BEGIN
  SELECT RAISE(ABORT, 'Learning path receipts are immutable');
END;
INSERT OR IGNORE INTO schema_migrations(version) VALUES(13);
