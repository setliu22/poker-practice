-- Private journal: never serialize payloads directly to API clients.
CREATE TABLE IF NOT EXISTS bot_table_events (
  table_id TEXT NOT NULL REFERENCES bot_tables(id) ON DELETE CASCADE,
  sequence INTEGER NOT NULL CHECK(sequence > 0),
  version INTEGER NOT NULL CHECK(version = 1),
  kind TEXT NOT NULL CHECK(kind IN ('checkpoint','action','revision')),
  payload TEXT NOT NULL,
  PRIMARY KEY(table_id, sequence)
);
CREATE TRIGGER IF NOT EXISTS bot_table_events_no_update
BEFORE UPDATE ON bot_table_events BEGIN
  SELECT RAISE(ABORT, 'Poker events are immutable');
END;
-- Game deletion is an intentional local-data deletion; cascades remove its journal.
CREATE TABLE IF NOT EXISTS bot_command_requests (
  table_id TEXT NOT NULL REFERENCES bot_tables(id) ON DELETE CASCADE,
  action_id TEXT NOT NULL,
  request TEXT NOT NULL,
  PRIMARY KEY(table_id, action_id)
);
INSERT OR IGNORE INTO schema_migrations(version) VALUES(10);
-- Derived labels are separate from features and never include revealed outcomes.
CREATE TABLE IF NOT EXISTS bot_decision_labels (
  table_id TEXT NOT NULL,
  sequence INTEGER NOT NULL,
  data TEXT NOT NULL,
  PRIMARY KEY(table_id, sequence),
  FOREIGN KEY(table_id, sequence) REFERENCES bot_table_events(table_id, sequence) ON DELETE CASCADE
);
CREATE TRIGGER IF NOT EXISTS bot_decision_labels_no_update
BEFORE UPDATE ON bot_decision_labels BEGIN
  SELECT RAISE(ABORT, 'Decision labels are versioned immutable records');
END;
CREATE TRIGGER IF NOT EXISTS bot_table_events_no_delete
BEFORE DELETE ON bot_table_events
WHEN EXISTS (SELECT 1 FROM bot_tables WHERE id=OLD.table_id)
BEGIN
  SELECT RAISE(ABORT, 'Poker events can only be removed by deleting their game');
END;
