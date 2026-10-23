-- Version 2 course events carry generator provenance. Rebuild the event and
-- receipt tables so version-1 rows stay byte-for-byte replayable.
CREATE TEMP TABLE learning_path_cursor_checkpoint AS
SELECT COALESCE((SELECT seq FROM sqlite_sequence WHERE name='learning_path_events'),0) AS value;

DROP TRIGGER IF EXISTS learning_path_events_no_update;
DROP TRIGGER IF EXISTS learning_path_receipts_no_update;

CREATE TABLE learning_path_events_v2 (
  cursor INTEGER PRIMARY KEY AUTOINCREMENT,
  event_id TEXT NOT NULL UNIQUE,
  schema_version INTEGER NOT NULL CHECK(schema_version IN (1,2)),
  installation_id TEXT NOT NULL,
  session_id TEXT NOT NULL,
  instance_id TEXT NOT NULL,
  content_id TEXT NOT NULL,
  content_version TEXT NOT NULL,
  kind TEXT NOT NULL CHECK(kind IN ('lesson-opened','lesson-resumed','question-presented','answer-submitted','feedback-generated','feedback-shown','lesson-completed')),
  created_at TEXT NOT NULL,
  payload TEXT NOT NULL CHECK(json_valid(payload))
);

INSERT INTO learning_path_events_v2(
  cursor,event_id,schema_version,installation_id,session_id,instance_id,
  content_id,content_version,kind,created_at,payload
)
SELECT cursor,event_id,schema_version,installation_id,session_id,instance_id,
       content_id,content_version,kind,created_at,payload
FROM learning_path_events ORDER BY cursor;

CREATE TABLE learning_path_answer_receipts_v2 (
  request_id TEXT PRIMARY KEY,
  instance_id TEXT NOT NULL,
  question_id TEXT NOT NULL,
  payload_hash TEXT NOT NULL,
  event_cursor INTEGER NOT NULL REFERENCES learning_path_events_v2(cursor),
  response_json TEXT NOT NULL CHECK(json_valid(response_json)),
  UNIQUE(instance_id,question_id)
);

INSERT INTO learning_path_answer_receipts_v2(
  request_id,instance_id,question_id,payload_hash,event_cursor,response_json
)
SELECT request_id,instance_id,question_id,payload_hash,event_cursor,response_json
FROM learning_path_answer_receipts;

DROP TABLE learning_path_answer_receipts;
DROP TABLE learning_path_events;
ALTER TABLE learning_path_events_v2 RENAME TO learning_path_events;
ALTER TABLE learning_path_answer_receipts_v2 RENAME TO learning_path_answer_receipts;

UPDATE sqlite_sequence
SET seq=MAX(seq,(SELECT value FROM learning_path_cursor_checkpoint))
WHERE name='learning_path_events';
INSERT INTO sqlite_sequence(name,seq)
SELECT 'learning_path_events',value FROM learning_path_cursor_checkpoint
WHERE NOT EXISTS(SELECT 1 FROM sqlite_sequence WHERE name='learning_path_events');
DROP TABLE learning_path_cursor_checkpoint;

CREATE INDEX learning_path_events_instance
  ON learning_path_events(instance_id,cursor);
CREATE TRIGGER learning_path_events_no_update
BEFORE UPDATE ON learning_path_events BEGIN
  SELECT RAISE(ABORT, 'Learning path events are immutable');
END;
CREATE TRIGGER learning_path_receipts_no_update
BEFORE UPDATE ON learning_path_answer_receipts BEGIN
  SELECT RAISE(ABORT, 'Learning path receipts are immutable');
END;

INSERT OR IGNORE INTO schema_migrations(version) VALUES(14);
