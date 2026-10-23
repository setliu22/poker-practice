# Generated poker strategy practice

Learn is a short, local daily strategy path for players who already know the rules. Its five skills are preflop decisions, pot price/equity, postflop decisions, range reading/blockers, and betting EV. It generates new situations each time a skill is practiced; there is no fixed question bank or rules curriculum. Every answer is checked against a chart, poker evaluator, exact arithmetic, or visible payoff assumptions. Feedback appears only after submission. The bot table is under Play and Cash Decision Lab is under Practice.

## Content and grading

The API serves a versioned catalog and public question objects. Each skill has a stable `contentId` and `skillId`; each instance records its `contentVersion` and server-generated seed. Question responses include only the current prompt, choices or percentage input, assumptions and transfer flag. They omit correct answers, grading rules, explanations, generator seed and future questions until submission. The server grades only from visible scenario facts and the corresponding versioned oracle.

The current content version is `2`, with five strategy skills: position/preflop baselines, pot price/equity, postflop decisions, range reading/blockers, and betting expected value. Each start generates a fresh set of core situations and a transfer situation from constrained templates. Retrying or resuming the same instance reconstructs those exact situations; starting again generates a new scenario set. Content version `1` remains available to replay and finish existing static attempts, but it is no longer the current Learn catalog.

Preflop recommendations use the app's local authored chart baseline; agreement is not proof of optimal play. Equity is conditional on the displayed range and weights. Draw completion probabilities are separate from showdown equity. Bet EV uses only the response frequencies and payoffs shown in the question. The generator never uses hidden cards, future board cards, poker table deal seeds, later actions or completed-hand hindsight to grade a decision.

Changing a question template, answer key or grading rule requires preserving the older content and generator versions so saved instances remain interpretable. New starts carry the current content version and generator provenance.

## Local event ledger

Migration 013 creates `learning_path_events` and `learning_path_answer_receipts`; migration 014 permits event schema version 2 while copying prior rows and receipts byte-for-byte. Events have a monotonically increasing SQLite cursor, UUID event ID, event schema version, pseudonymous installation ID, session and instance IDs, content ID/version, timestamp, kind and a strict JSON payload. Update triggers make event and receipt rows immutable. Events describe the learning interaction:

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

The API reconstructs the current lesson state and progress from the event ledger rather than treating an editable progress row as the source of truth. Progress includes starts, completed instances (`completedLessons`), distinct completed lessons (`completedContentIds`), resumes, answer attempts and mistakes by skill. Only committed completion events advance skill-path completion. `nextLessonContentId` recommends the first unfinished skill in catalog order, or is null when all lessons have a completed instance. The Learn path shows completed markers and this recommendation while leaving every lesson available directly. Repeating a lesson adds another instance without removing its completed marker or advancing distinct completion. `reviewSuggestion` selects the most recent incorrect answer that has a matching submitted-answer event, ordered by event cursor, then maps its skill to the catalog. The catalog order resolves any skill-to-lesson tie.

### Daily practice and calendar days

The primary **Today's practice** card resumes an unfinished instance, otherwise recommends the next uncompleted strategy skill or latest missed skill. Starting or repeating a skill generates a fresh scenario set. A retry or resume uses the same seeded instance and exact-retry commands; there is no separate daily-session record.

`GET /progress?timeZone=America%2FNew_York` derives `completedToday` (boolean) and `currentStreakDays` (nonnegative integer) only from committed immutable `lesson-completed` timestamps. The browser supplies its IANA time zone on every progress read. Omission defaults to UTC; malformed, repeated or unsupported zone values return 400 instead of silently selecting another zone. The server's current clock determines today. Changing the supplied zone recomputes historical calendar days in that zone; no historical timezone or mutable streak is stored.

Multiple completions on one local calendar day count once. Consecutive completion days ending today form the current streak; if today is unfinished, a run ending yesterday stays active until today ends. A missed full day resets it. Calendar labels are converted to day ordinals before stepping backward, so month/year boundaries, leap days, and 23/25-hour daylight-saving days work without subtracting 24 hours from local instants. Reading progress appends no events and changes no receipts or statistics. Restart rebuilds the same projection; clearing path events clears daily completion and streak too.

The daily status describes practice consistency only: a day with a completed lesson. It does not measure poker skill, mastery or retention, and appears separately from fresh-transfer answer results.

### Idempotent answers and recovery

Each answer command has a UUID request ID. The server validates the current instance, question, content version and answer, then grades and writes the answer event, feedback event and exact response receipt in one SQLite transaction. It returns success only after commit. An exact retry returns the saved response without adding another answer. Reusing the request ID with changed content, answering a question twice with a new request ID, or submitting against a stale version returns a conflict.

The browser stores pending command IDs and answer drafts locally so it can resend the same command after a lost response or reload. A later lesson reload reconstructs progress from the ledger and preserves the learner's draft. If the client has already submitted an answer but did not receive the response, retrying recovers the receipt; it does not re-grade or replace the original answer.

## Export, backup and deletion

`GET /api/v1/learning-path/export` returns event pages with `afterCursor`, `limit` and a `throughCursor` high-water mark. Keep the first response's `throughCursor` on every following page: new events appended during the download stay outside that export. Under **Progress → Learning path data**, the browser's **Download path data** action follows those pages and writes a learner-requested JSON file. The export includes pseudonymous installation identity and course events; it is not uploaded automatically. The route currently validates the ledger before filtering each page, so its per-page read cost grows with the local ledger; cursor-bounded SQL can replace this if volume warrants it.

The app's full SQLite backup uses SQLite's online backup API, including committed WAL content. The CLI backup also writes a checksum/schema/count manifest; the browser downloads a standalone SQLite file without that manifest. Restore validates database integrity and foreign keys and writes only to a new destination. When a companion manifest is present, it also checks the checksum, byte size, schema version and table counts against that manifest. A full database backup contains all local practice data, not just learning-path events; store it accordingly. See [usage data recovery](usage-data-design.md) and [the verification playbook](../VERIFY.md).

**Clear strategy progress** requires confirmation and deletes only this path's events and answer receipts. It leaves legacy version-1 lesson history and saved games intact. The app-wide progress clear is a separate action. Exports and previously created backups are separate files and remain the learner's responsibility to remove.

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
