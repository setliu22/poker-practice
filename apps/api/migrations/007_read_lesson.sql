CREATE TABLE IF NOT EXISTS read_lessons(id TEXT PRIMARY KEY, variant INTEGER NOT NULL, created_at TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS read_lesson_answers(lesson_id TEXT NOT NULL REFERENCES read_lessons(id) ON DELETE CASCADE, step TEXT NOT NULL, answer TEXT NOT NULL, feedback TEXT NOT NULL, answered_at TEXT NOT NULL, PRIMARY KEY(lesson_id,step));
