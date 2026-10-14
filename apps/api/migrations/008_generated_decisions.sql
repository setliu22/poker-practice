CREATE TABLE IF NOT EXISTS generated_decisions(
  lesson_id TEXT PRIMARY KEY REFERENCES read_lessons(id) ON DELETE CASCADE,
  specification TEXT NOT NULL
);
