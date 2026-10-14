CREATE TABLE IF NOT EXISTS learning_questions (
  id TEXT PRIMARY KEY,
  scenario INTEGER NOT NULL,
  created_at TEXT NOT NULL,
  answer TEXT,
  feedback TEXT,
  answered_at TEXT
);
