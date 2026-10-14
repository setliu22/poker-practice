CREATE TABLE IF NOT EXISTS cash_drills (
  id TEXT PRIMARY KEY,
  created_at TEXT NOT NULL,
  players INTEGER NOT NULL CHECK(players BETWEEN 2 AND 9),
  skill TEXT NOT NULL,
  specification TEXT NOT NULL,
  selection_reason TEXT NOT NULL,
  fingerprint TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS cash_answers (
  drill_id TEXT NOT NULL REFERENCES cash_drills(id) ON DELETE CASCADE,
  phase TEXT NOT NULL CHECK(phase IN ('initial', 'transfer')),
  answer TEXT NOT NULL,
  feedback TEXT NOT NULL,
  answered_at TEXT NOT NULL,
  PRIMARY KEY(drill_id, phase)
);
CREATE TABLE IF NOT EXISTS cash_hints (
  drill_id TEXT NOT NULL REFERENCES cash_drills(id) ON DELETE CASCADE,
  phase TEXT NOT NULL CHECK(phase IN ('initial', 'transfer')),
  seen_at TEXT NOT NULL,
  PRIMARY KEY(drill_id, phase)
);
CREATE INDEX IF NOT EXISTS cash_drills_created ON cash_drills(created_at DESC);
CREATE INDEX IF NOT EXISTS cash_answers_created ON cash_answers(answered_at DESC);
