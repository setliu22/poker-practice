# Poker foundations learning path

The learning path is a short, local course that starts with table rules and hand rankings, then introduces position/opening baselines, pot odds with a visible opponent range, and introductory postflop reasoning. It gives feedback only after an answer is submitted. The course is beginner-first, while Bot table and Cash Decision Lab remain available directly from the main navigation.

## Content and grading

The API serves a versioned catalog and public question objects. Each lesson has a stable `contentId` and `skillId`; each instance records the `contentVersion` it started with. Question responses include the prompt, choices or percentage input, assumptions and transfer flag. They omit correct answers, grading rules, explanations and takeaways until the answer is submitted. The server grades only the authored question and the facts stated in that question.

The four units currently contain five lessons: table flow and legal actions; building the best five-card hand; position and opening baselines; pot odds and equity against a visible range; and first postflop decisions. Each lesson has three or four core questions and two transfer variants. Transfer selection uses unseen variants first. After the pool is exhausted, it repeats the least-presented variant, breaking ties in authored order. A repeated lesson creates a new instance and leaves earlier events unchanged.

Hand ranks, pot odds, range equity and draw counts use existing deterministic poker calculations. Position/opening examples read the app's local authored chart baseline. A chart match is not proof of optimal play. Equity is conditional on the visible range and weights in the exercise; next-card draw probabilities are not showdown equity or a guarantee of winning. The course does not use hidden cards, future board cards, deal seeds or later hand outcomes to grade a decision.

Changing an existing question, answer key or grading rule requires preserving the older content version so saved instances remain interpretable. Additive lessons retain their own `contentId`; event records continue to carry the path version. The current course version is `1`.

## Local event ledger

Migration 013 adds `learning_path_events` and `learning_path_answer_receipts`. Events have a monotonically increasing SQLite cursor, UUID event ID, event schema version, pseudonymous installation ID, session and instance IDs, content ID/version, timestamp, kind and a strict JSON payload. Update triggers make event and receipt rows immutable. Events describe the learning interaction:

| Event                | Meaning                                                                                              |
| -------------------- | ---------------------------------------------------------------------------------------------------- |
| `lesson-opened`      | A new instance and its ordered core/transfer questions were selected.                                |
| `lesson-resumed`     | The learner returned to an existing instance after reload.                                           |
| `question-presented` | The local client reported rendering a question and whether this was its first transfer presentation. |
| `answer-submitted`   | The learner's answer and request ID were accepted for grading.                                       |
| `feedback-generated` | The server's authored result was recorded after the answer.                                          |
| `feedback-shown`     | The client reported displaying that saved feedback.                                                  |
| `lesson-completed`   | The instance reached its final acknowledged question.                                                |

Presentation and feedback acknowledgements record that the client reached a display step; they do not prove the learner read, understood or retained the material. Answers, authored feedback, display acknowledgements and future model outputs remain separate facts.

The API reconstructs the current lesson state and progress from the event ledger rather than treating an editable progress row as the source of truth. Progress includes starts, completed instances (`completedLessons`), distinct completed lessons (`completedContentIds`), resumes, answer attempts and mistakes by skill. Only committed completion events advance course completion. `nextLessonContentId` recommends the first unfinished lesson in catalog order, or is null when all lessons have a completed instance. The course home shows completed markers and this recommendation while leaving every lesson available directly. Repeating a lesson adds another instance without removing its completed marker or advancing distinct completion. `reviewSuggestion` selects the most recent incorrect answer that has a matching submitted-answer event, ordered by event cursor, then maps its skill to the catalog. The catalog order resolves any skill-to-lesson tie.

### Daily practice and calendar days

The primary **Today's practice** card resumes an unfinished instance, otherwise starts the first unfinished catalog lesson, otherwise offers the latest missed-skill lesson. When every lesson is complete and there is no missed-skill suggestion, it invites a free lesson choice. It reuses the same versioned instance and exact-retry commands; there is no separate daily-session record.

`GET /progress?timeZone=America%2FNew_York` derives `completedToday` (boolean) and `currentStreakDays` (nonnegative integer) only from committed immutable `lesson-completed` timestamps. The browser supplies its IANA time zone on every progress read. Omission defaults to UTC; malformed, repeated or unsupported zone values return 400 instead of silently selecting another zone. The server's current clock determines today. Changing the supplied zone recomputes historical calendar days in that zone; no historical timezone or mutable streak is stored.

Multiple completions on one local calendar day count once. Consecutive completion days ending today form the current streak; if today is unfinished, a run ending yesterday stays active until today ends. A missed full day resets it. Calendar labels are converted to day ordinals before stepping backward, so month/year boundaries, leap days, and 23/25-hour daylight-saving days work without subtracting 24 hours from local instants. Reading progress appends no events and changes no receipts or statistics. Restart rebuilds the same projection; clearing path events clears daily completion and streak too.

The daily status describes practice consistency only: a day with a completed lesson. It does not measure poker skill, mastery or retention, and appears separately from fresh-transfer answer results.

### Idempotent answers and recovery

Each answer command has a UUID request ID. The server validates the current instance, question, content version and answer, then grades and writes the answer event, feedback event and exact response receipt in one SQLite transaction. It returns success only after commit. An exact retry returns the saved response without adding another answer. Reusing the request ID with changed content, answering a question twice with a new request ID, or submitting against a stale version returns a conflict.

The browser stores pending command IDs and answer drafts locally so it can resend the same command after a lost response or reload. A later lesson reload reconstructs progress from the ledger and preserves the learner's draft. If the client has already submitted an answer but did not receive the response, retrying recovers the receipt; it does not re-grade or replace the original answer.

## Export, backup and deletion

`GET /api/v1/learning-path/export` returns event pages with `afterCursor`, `limit` and a `throughCursor` high-water mark. Keep the first response's `throughCursor` on every following page: new events appended during the download stay outside that export. The browser's **Download path data** action follows those pages and writes a learner-requested JSON file. The export includes pseudonymous installation identity and course events; it is not uploaded automatically. The route currently validates the ledger before filtering each page, so its per-page read cost grows with the local ledger; cursor-bounded SQL can replace this if volume warrants it.

The app's full SQLite backup uses SQLite's online backup API, including committed WAL content. The CLI backup also writes a checksum/schema/count manifest; the browser downloads a standalone SQLite file without that manifest. Restore validates database integrity and foreign keys and writes only to a new destination. When a companion manifest is present, it also checks the checksum, byte size, schema version and table counts against that manifest. A full database backup contains all local practice data, not just learning-path events; store it accordingly. See [usage data recovery](usage-data-design.md) and [the verification playbook](../VERIFY.md).

**Clear path progress** requires confirmation and deletes only this path's events and answer receipts. It leaves the static course, legacy lesson rows and saved games intact. The app-wide progress clear is a separate action. Exports and previously created backups are separate files and remain the learner's responsibility to remove.

Legacy lesson summaries do not have the complete presentation/answer/feedback sequence required by this ledger. The app keeps them separate and labels them as legacy instead of fabricating history or merging them into path metrics.

## What the measures mean

The UI separates practice engagement from transfer performance:

- **Engagement:** lessons completed, answers attempted and recorded mistakes.
- **Fresh-transfer result:** correct answers divided by submitted answers to transfer variants shown for the first time. Reused variants remain practice but do not add to this count.

These are counts on the app's stated questions and assumptions. They are not a mastery threshold, a measure of general poker skill, or validated evidence that a learner will play better. The current path does not implement spaced scheduling or train/evaluate an ML model. Future offline model work would require opt-in data, learner/scenario holdouts and comparison with a transparent baseline before any model output is used for teaching.

## Local API surface

The versioned API is mounted at `/api/v1/learning-path`:

| Route                                                              | Use                                                                      |
| ------------------------------------------------------------------ | ------------------------------------------------------------------------ |
| `GET /`                                                            | Read the public catalog.                                                 |
| `GET /progress?timeZone=<IANA zone>`                               | Rebuild progress, review, and calendar-day consistency (UTC by default). |
| `POST /instances` / `GET /instances/:instanceId`                   | Start a new version-pinned instance or read its reconstructed state.     |
| `POST /instances/:instanceId/resumed`                              | Record a resume acknowledgement.                                         |
| `POST /instances/:instanceId/questions/:questionId/presented`      | Record a question-display acknowledgement.                               |
| `POST /instances/:instanceId/questions/:questionId/answers`        | Submit an answer with an idempotent request ID.                          |
| `POST /instances/:instanceId/questions/:questionId/feedback-shown` | Acknowledge display of committed feedback.                               |
| `POST /instances/:instanceId/complete`                             | Complete an instance after all feedback acknowledgements.                |
| `GET /export`                                                      | Download a cursor-pinned event page.                                     |
| `DELETE /progress`                                                 | Clear only learning-path events and receipts.                            |

For executable checks, see [VERIFY.md](../VERIFY.md) and run the focused learning-path API/content and desktop browser suites.
