import { useEffect, useRef, useState } from "react";
import type {
  LearningPathAnswer,
  LearningPathAnswerCommand,
  LearningPathCatalog,
  LearningPathFeedback,
  LearningPathInstanceState,
  LearningPathProgress,
  StartLearningInstance,
} from "../../../packages/shared/src/learning-path";

const key = "poker-learning-path-v1";
type Checkpoint = {
  sessionId: string;
  instanceId?: string;
  start?: StartLearningInstance;
  pending?: LearningPathAnswerCommand & { questionId: string };
  draft?: { questionId: string; answer: LearningPathAnswer };
  acks: Record<string, string>;
};
function checkpoint(): Checkpoint {
  try {
    const saved = JSON.parse(
      localStorage.getItem(key) ?? "null",
    ) as Checkpoint | null;
    if (saved?.sessionId && saved.acks) return saved;
  } catch {
    /* A missing checkpoint is recovered from API progress. */
  }
  return { sessionId: crypto.randomUUID(), acks: {} };
}
class PathError extends Error {
  constructor(
    message: string,
    public status: number,
  ) {
    super(message);
  }
}
async function api<T>(
  path: string,
  body?: unknown,
  method = "POST",
): Promise<T> {
  const response = await fetch(
    `/api/v1/learning-path${path}`,
    body === undefined && method !== "DELETE"
      ? undefined
      : {
          method,
          headers: { "Content-Type": "application/json" },
          ...(body === undefined ? {} : { body: JSON.stringify(body) }),
        },
  );
  const data = await response.json();
  if (!response.ok)
    throw new PathError(
      data.error ?? "Unable to save learning progress.",
      response.status,
    );
  return data as T;
}
function progressPath() {
  const timeZone = Intl.DateTimeFormat().resolvedOptions().timeZone;
  return `/progress?timeZone=${encodeURIComponent(timeZone)}`;
}
export function LearningPathProgressSummary({ refresh }: { refresh: unknown }) {
  const [progress, setProgress] = useState<LearningPathProgress | null>(null);
  const [error, setError] = useState("");
  const [retry, setRetry] = useState(0);
  useEffect(() => {
    let active = true;
    void api<LearningPathProgress>(progressPath())
      .then((summary) => {
        if (active) {
          setProgress(summary);
          setError("");
        }
      })
      .catch((e: Error) => {
        if (active) setError(e.message);
      });
    return () => {
      active = false;
    };
  }, [refresh, retry]);
  return (
    <section
      className="panel path-progress"
      aria-label="Learning path progress"
    >
      <span className="eyebrow">Strategy practice</span>
      <h2>Learning path progress</h2>
      {error ? (
        <div role="alert">
          {error}{" "}
          <button
            className="secondary"
            onClick={() => setRetry((value) => value + 1)}
          >
            Retry path progress
          </button>
        </div>
      ) : !progress ? (
        <p role="status">Loading path progress…</p>
      ) : (
        <>
          <p>
            {progress.completedLessons} lessons completed ·{" "}
            {progress.answerAttempts} answers attempted ·{" "}
            {Object.values(progress.bySkill).reduce(
              (sum, skill) => sum + skill.incorrect,
              0,
            )}{" "}
            mistakes to learn from
          </p>
          <div role="region" aria-label="Fresh transfer results">
            <h3>Fresh transfer results</h3>
            <p>
              {progress.transferCorrect}/{progress.transferAttempts} correct on
              first presentations.
            </p>
            <p className="quiet">Reused variants count as practice only.</p>
          </div>
          <details>
            <summary>Lesson and answer details</summary>
            <p className="quiet">
              These counts are practice history, not a mastery or speed score.
            </p>
            <p>
              {progress.completedContentIds.length} distinct lessons completed ·{" "}
              {progress.startedLessons} lessons started ·{" "}
              {progress.resumedLessons} lessons resumed
            </p>
            <ul>
              {Object.entries(progress.bySkill).map(([skill, result]) => (
                <li key={skill}>
                  {skill.replaceAll("-", " ")}: {result.incorrect} incorrect /{" "}
                  {result.attempts} answers
                </li>
              ))}
            </ul>
          </details>
        </>
      )}
    </section>
  );
}

export function LearningPath() {
  const saved = useRef<Checkpoint>(checkpoint());
  const [catalog, setCatalog] = useState<LearningPathCatalog | null>(null);
  const [progress, setProgress] = useState<LearningPathProgress | null>(null);
  const [instance, setInstance] = useState<LearningPathInstanceState | null>(
    null,
  );
  const [feedback, setFeedback] = useState<LearningPathFeedback | null>(null);
  const [answer, setAnswer] = useState<LearningPathAnswer | null>(null);
  const [ready, setReady] = useState(false),
    [feedbackReady, setFeedbackReady] = useState(false);
  const [busy, setBusy] = useState(false),
    [error, setError] = useState(""),
    [stale, setStale] = useState(false);
  const [dailyError, setDailyError] = useState("");
  const progressRead = useRef(0);
  const progressSuccess = useRef(0);
  const dailyRetry = useRef<() => Promise<void>>(async () => {});
  const courseHeading = useRef<HTMLHeadingElement>(null);
  const feedbackHeading = useRef<HTMLHeadingElement>(null);
  const heading = useRef<HTMLHeadingElement>(null);
  const [paused, setPaused] = useState(false);
  const retry = useRef<() => Promise<void>>(async () => {}),
    lock = useRef(false);
  function persist() {
    localStorage.setItem(key, JSON.stringify(saved.current));
  }
  function eventId(name: string) {
    if (!saved.current.acks[name]) {
      saved.current.acks[name] = crypto.randomUUID();
      persist();
    }
    return saved.current.acks[name];
  }
  async function run(operation: () => Promise<void>) {
    if (lock.current) return;
    lock.current = true;
    setBusy(true);
    setError("");
    setStale(false);
    retry.current = operation;
    try {
      await operation();
    } catch (e) {
      setError((e as Error).message);
      setStale(e instanceof PathError && e.status === 409);
    } finally {
      lock.current = false;
      setBusy(false);
    }
  }
  async function readProgress() {
    const request = ++progressRead.current;
    const summary = await api<LearningPathProgress>(progressPath());
    // A failed newer read must not suppress the only usable snapshot.
    // Once a newer read succeeds, an older response cannot replace it.
    if (request > progressSuccess.current) {
      progressSuccess.current = request;
      setProgress(summary);
      if (request === progressRead.current) setDailyError("");
    }
    return summary;
  }
  async function refresh() {
    await readProgress();
  }
  function display(state: LearningPathInstanceState) {
    setPaused(false);
    setInstance(state);
    setReady(false);
    setFeedbackReady(false);
    setFeedback(saved.current.pending ? null : state.feedback);
    setAnswer(
      saved.current.pending?.answer ??
        (saved.current.draft &&
        saved.current.draft.questionId === state.question?.id
          ? saved.current.draft.answer
          : null),
    );
  }
  async function load() {
    const [course, summary] = await Promise.all([
      api<LearningPathCatalog>(""),
      readProgress(),
    ]);
    setCatalog(course);
    let id = saved.current.instanceId ?? summary.activeInstanceId;
    if (saved.current.start) {
      const state = await api<LearningPathInstanceState>(
        "/instances",
        saved.current.start,
      );
      id = state.instanceId;
      saved.current.instanceId = id;
      delete saved.current.start;
      persist();
    }
    if (id) {
      let state: LearningPathInstanceState;
      try {
        state = await api<LearningPathInstanceState>(`/instances/${id}`);
      } catch (e) {
        if (!(e instanceof PathError) || e.status !== 404) throw e;
        delete saved.current.instanceId;
        delete saved.current.pending;
        delete saved.current.draft;
        persist();
        setInstance(null);
        return;
      }
      saved.current.instanceId = id;
      persist();
      if (!state.complete) {
        const name = `resume:${id}`;
        state = await api<LearningPathInstanceState>(
          `/instances/${id}/resumed`,
          { eventId: eventId(name) },
        );
        delete saved.current.acks[name];
        persist();
      }
      display(state);
    } else setInstance(null);
  }
  useEffect(() => {
    void run(load);
  }, []);
  useEffect(() => {
    let mounted = true;
    let timer: number;
    async function updateDaily() {
      const request = progressRead.current + 1;
      try {
        await refresh();
      } catch {
        if (mounted && request === progressRead.current)
          setDailyError(
            "Daily practice status could not refresh and may be out of date.",
          );
      }
    }
    function scheduleMidnight() {
      window.clearTimeout(timer);
      const now = new Date();
      const midnight = new Date(now);
      // Advance the local calendar, since the next day can be 23 or 25 hours away.
      midnight.setHours(24, 0, 0, 0);
      timer = window.setTimeout(() => {
        void updateDaily();
        scheduleMidnight();
      }, midnight.getTime() - now.getTime());
    }
    function returnToPage() {
      if (document.visibilityState !== "visible") return;
      scheduleMidnight();
      void updateDaily();
    }
    dailyRetry.current = updateDaily;
    scheduleMidnight();
    window.addEventListener("focus", returnToPage);
    document.addEventListener("visibilitychange", returnToPage);
    return () => {
      mounted = false;
      progressSuccess.current = ++progressRead.current;
      window.clearTimeout(timer);
      window.removeEventListener("focus", returnToPage);
      document.removeEventListener("visibilitychange", returnToPage);
    };
  }, []);
  useEffect(() => {
    (!paused && instance
      ? feedback
        ? feedbackHeading
        : heading
      : courseHeading
    ).current?.focus();
  }, [
    instance?.instanceId,
    instance?.question?.id,
    instance?.complete,
    feedback,
    paused,
  ]);
  const question = instance?.question;
  // These effects run after the corresponding question/feedback has rendered.
  useEffect(() => {
    if (!instance || instance.complete || !question || feedback) return;
    void run(async () => {
      await api(
        `/instances/${instance.instanceId}/questions/${question.id}/presented`,
        { eventId: eventId(`presented:${instance.instanceId}:${question.id}`) },
      );
      setReady(true);
    });
  }, [instance, feedback]);
  useEffect(() => {
    if (!instance || !question || !feedback) return;
    void run(async () => {
      await api(
        `/instances/${instance.instanceId}/questions/${question.id}/feedback-shown`,
        { eventId: eventId(`feedback:${instance.instanceId}:${question.id}`) },
      );
      setFeedbackReady(true);
      await refresh();
    });
  }, [feedback]);
  async function start(
    contentId: string,
    entryPoint: NonNullable<StartLearningInstance["entryPoint"]>,
  ) {
    if (!catalog) return;
    saved.current.start = {
      eventId: crypto.randomUUID(),
      instanceId: crypto.randomUUID(),
      sessionId: saved.current.sessionId,
      contentId,
      contentVersion: catalog.contentVersion,
      entryPoint,
    };
    delete saved.current.pending;
    delete saved.current.draft;
    persist();
    const command = saved.current.start;
    await run(async () => {
      const state = await api<LearningPathInstanceState>("/instances", command);
      saved.current.instanceId = state.instanceId;
      delete saved.current.start;
      persist();
      await refresh();
      display(state);
    });
  }
  function choose(value: LearningPathAnswer) {
    if (!question || saved.current.pending) return;
    saved.current.draft = { questionId: question.id, answer: value };
    persist();
    setAnswer(value);
  }
  async function submit() {
    if (!instance || !question || !answer) return;
    if (!saved.current.pending) {
      saved.current.pending = {
        requestId: crypto.randomUUID(),
        questionId: question.id,
        contentVersion: instance.contentVersion,
        answer,
      };
      persist();
    }
    await run(async () => {
      const pending = saved.current.pending!;
      const result = await api<LearningPathFeedback>(
        `/instances/${instance.instanceId}/questions/${pending.questionId}/answers`,
        {
          requestId: pending.requestId,
          contentVersion: pending.contentVersion,
          answer: pending.answer,
        },
      );
      delete saved.current.pending;
      delete saved.current.draft;
      persist();
      setFeedback(result);
    });
  }
  async function advance() {
    if (!instance) return;
    await run(async () => {
      let state = await api<LearningPathInstanceState>(
        `/instances/${instance.instanceId}`,
      );
      if (!state.question && !state.complete)
        state = await api<LearningPathInstanceState>(
          `/instances/${instance.instanceId}/complete`,
          { eventId: eventId(`complete:${instance.instanceId}`) },
        );
      await refresh();
      display(state);
    });
  }
  const lessons = catalog?.units.flatMap((unit) => unit.lessons) ?? [];
  const nextLesson = lessons.find(
    (lesson) => lesson.contentId === progress?.nextLessonContentId,
  );
  const reviewLesson = lessons.find(
    (lesson) => lesson.contentId === progress?.reviewSuggestion?.contentId,
  );
  const dailyLesson = nextLesson ?? reviewLesson ?? lessons[0];
  const dailyEntryPoint: NonNullable<StartLearningInstance["entryPoint"]> =
    nextLesson
      ? "daily-recommendation"
      : reviewLesson
        ? "review"
        : "repeat";
  const activePractice = !!progress?.activeInstanceId;
  async function resumeDaily() {
    if (paused && instance && !instance.complete) {
      setPaused(false);
      return;
    }
    if (!progress?.activeInstanceId) return;
    saved.current.instanceId = progress.activeInstanceId;
    persist();
    await load();
    (feedback ? feedbackHeading : heading).current?.focus();
  }
  return (
    <section
      className={`panel learning-path${instance && !paused ? " is-lesson" : ""}`}
      aria-busy={busy}
      aria-label="Poker strategy practice"
    >
      {(!instance || paused) && (
        <>
          <div className="course-heading">
            <h1 ref={courseHeading} tabIndex={-1}>
              {catalog?.title ?? "Loading strategy practice…"}
            </h1>
            {catalog && progress && (
              <div className="course-progress">
                <span>
                  {progress.completedContentIds.length} of {lessons.length}{" "}
                  skills practiced
                </span>
                <progress
                  aria-label="Course completion"
                  value={progress.completedContentIds.length}
                  max={lessons.length}
                />
              </div>
            )}
          </div>
        </>
      )}
      {progress && catalog && (!instance || paused) && (
        <div
          className="daily-practice"
          role="region"
          aria-labelledby="daily-practice-title"
        >
          <h2 id="daily-practice-title">Today's practice</h2>
          <p className="quiet">Fresh situations each session.</p>
          <p role="status">
            {progress.completedToday
              ? "Completed today"
              : "Not completed today"}
            {" · "}
            {progress.currentStreakDays}-day practice streak
          </p>
          {dailyError && (
            <div role="alert">
              <p>{dailyError}</p>
              <button
                className="secondary"
                onClick={() => void dailyRetry.current()}
              >
                Refresh daily status
              </button>
            </div>
          )}
          {activePractice ? (
            <>
              <button
                className="primary"
                disabled={busy}
                onClick={() =>
                  paused ? setPaused(false) : void run(resumeDaily)
                }
              >
                Resume today's practice
              </button>
            </>
          ) : dailyLesson ? (
            <>
              <p>
                {nextLesson
                  ? "Up next"
                  : reviewLesson
                    ? "Review a missed skill"
                    : "Repeat a lesson"}
                : {dailyLesson.title}
              </p>
              <button
                className="primary"
                disabled={busy}
                onClick={() => void start(dailyLesson.contentId, dailyEntryPoint)}
              >
                {progress.completedToday
                  ? "Practice another lesson"
                  : nextLesson
                    ? "Start today's practice"
                    : reviewLesson
                      ? "Practice missed ideas"
                      : "Repeat today's practice"}
              </button>
            </>
          ) : (
            <p>Choose a skill for a fresh set of scenarios.</p>
          )}
        </div>
      )}
      {error && (
        <div role="alert">
          <p>
            {stale
              ? "This lesson has changed or is out of date. Your saved answer is preserved. "
              : ""}
            {error}
          </p>
          <button
            className="secondary"
            disabled={busy}
            onClick={() => void run(retry.current)}
          >
            Try again
          </button>
          {stale && (
            <button className="secondary" onClick={() => void run(load)}>
              Reload current lesson
            </button>
          )}
        </div>
      )}
      {!catalog && !error && <p role="status">Loading your course…</p>}
      {(!instance || paused) && catalog && (
        <ol className="course-path" aria-label="Strategy skills">
          {catalog.units.map((unit, unitIndex) => (
            <li className="course-unit" key={unit.id}>
              <div className="unit-heading">
                <span className="unit-number" aria-hidden="true">
                  {unitIndex + 1}
                </span>
                <h2>{unit.title}</h2>
              </div>
              <ol className="unit-lessons">
                {unit.lessons.map((lesson) => {
                  const complete = progress?.completedContentIds.includes(
                    lesson.contentId,
                  );
                  const next =
                    lesson.contentId === progress?.nextLessonContentId;
                  const resumable = Boolean(
                    paused &&
                    instance &&
                    !instance.complete &&
                    instance.contentId === lesson.contentId,
                  );
                  const current =
                    paused && instance && !instance.complete ? resumable : next;
                  return (
                    <li key={lesson.contentId}>
                      <button
                        disabled={busy}
                        className={`course-lesson ${current ? "next-lesson" : ""}`}
                        aria-label={
                          resumable
                            ? `Resume ${lesson.title}`
                            : complete
                              ? `Repeat ${lesson.title} (completed)`
                              : `Start ${lesson.title}`
                        }
                        aria-current={current ? "step" : undefined}
                        onClick={() =>
                          resumable
                            ? setPaused(false)
                            : void start(
                                lesson.contentId,
                                complete ? "repeat" : "path-selection",
                              )
                        }
                      >
                        <span className="lesson-marker" aria-hidden="true">
                          {resumable ? "→" : complete ? "✓" : next ? "→" : "○"}
                        </span>
                        <span className="lesson-label">
                          <strong>{lesson.title}</strong>
                          {resumable ? (
                            <span>In progress</span>
                          ) : complete ? (
                            <span
                              role="note"
                              aria-label={`Completed ${lesson.title}`}
                            >
                              Completed
                            </span>
                          ) : (
                            <span>{next ? "Up next" : ""}</span>
                          )}
                        </span>
                        <span className="lesson-action" aria-hidden="true">
                          {resumable ? "Resume" : complete ? "Repeat" : "Start"}{" "}
                          →
                        </span>
                      </button>
                    </li>
                  );
                })}
              </ol>
            </li>
          ))}
        </ol>
      )}
      {instance && !paused && !instance.complete && (
        <>
          <div className="lesson-toolbar">
            <button
              className="secondary lesson-back"
              disabled={busy}
              onClick={() => setPaused(true)}
            >
              ← Back to course
            </button>
            <div className="lesson-progress">
              <h1>{instance.title}</h1>
              <span>
                Question{" "}
                {Math.min(instance.questionIndex + 1, instance.totalQuestions)}{" "}
                of {instance.totalQuestions}
              </span>
              <progress
                aria-label="Lesson progress"
                value={instance.questionIndex}
                max={instance.totalQuestions}
              />
            </div>
          </div>
          <details className="lesson-concept">
            <summary>Lesson concept</summary>
            <p>{instance.concept}</p>
            <p>{instance.intro}</p>
          </details>
          {question && (
            <section
              className="lesson-card"
              aria-label="Current lesson question"
            >
              <h2 className="lesson-question" ref={heading} tabIndex={-1}>
                {question.title}
              </h2>
              <p className="lesson-prompt">{question.prompt}</p>
              {question.isTransfer && (
                <p role="note" aria-label="Transfer question">
                  {instance.isFreshTransfer
                    ? "Fresh transfer: first presentation."
                    : "Reused transfer: previously seen. Reused variants do not change your fresh-transfer result."}
                </p>
              )}
              <details>
                <summary>Assumptions</summary>
                <ul>
                  {question.assumptions.map((item) => (
                    <li key={item}>{item}</li>
                  ))}
                </ul>
              </details>
              {!feedback ? (
                <form
                  onSubmit={(event) => {
                    event.preventDefault();
                    void submit();
                  }}
                >
                  <fieldset
                    className="lesson-answers"
                    disabled={busy || !ready || !!saved.current.pending}
                  >
                    <legend>Your answer</legend>
                    {question.answerKind === "choice" ? (
                      question.choices?.map((choice) => (
                        <label
                          className={`answer-option${answer?.kind === "choice" && answer.choiceId === choice.id ? " is-selected" : ""}`}
                          key={choice.id}
                        >
                          <input
                            type="radio"
                            name="path-answer"
                            checked={
                              answer?.kind === "choice" &&
                              answer.choiceId === choice.id
                            }
                            onChange={() =>
                              choose({ kind: "choice", choiceId: choice.id })
                            }
                          />
                          {choice.label}
                        </label>
                      ))
                    ) : (
                      <label>
                        {question.unitLabel ?? "Percent"}
                        <input
                          type="number"
                          min="0"
                          max="100"
                          step="any"
                          value={answer?.kind === "percent" ? answer.value : ""}
                          onChange={(event) => {
                            if (event.target.value !== "")
                              choose({
                                kind: "percent",
                                value: Number(event.target.value),
                              });
                            else {
                              delete saved.current.draft;
                              persist();
                              setAnswer(null);
                            }
                          }}
                        />
                      </label>
                    )}
                  </fieldset>
                  {saved.current.pending && (
                    <p>
                      Your answer is saved. Retry sends the identical answer to
                      recover its receipt.
                    </p>
                  )}
                  <button
                    className="primary"
                    disabled={busy || !ready || !answer}
                  >
                    {saved.current.pending
                      ? "Retry saved answer"
                      : "Submit answer"}
                  </button>
                </form>
              ) : (
                <div
                  className={`lesson-feedback ${feedback.correct ? "is-correct" : "is-incorrect"}`}
                  role="region"
                  aria-label="Path feedback"
                >
                  <h2 ref={feedbackHeading} tabIndex={-1}>
                    {feedback.correct ? "Correct" : "Try this idea again"}
                  </h2>
                  <p>{feedback.explanation}</p>
                  <p>{feedback.takeaway}</p>
                  <button
                    className="primary"
                    disabled={busy || !feedbackReady}
                    onClick={() => void advance()}
                  >
                    Continue lesson
                  </button>
                </div>
              )}
            </section>
          )}
          {!question && (
            <button
              className="secondary"
              disabled={busy}
              onClick={() => void advance()}
            >
              Finish lesson
            </button>
          )}
        </>
      )}
      {instance?.complete && !paused && (
        <div className="lesson-complete">
          <h1 tabIndex={-1} ref={heading}>
            Lesson complete
          </h1>
          <p>
            You practiced {instance.totalQuestions} decisions. Review missed
            ideas or try another lesson.
          </p>
          {progress?.reviewSuggestion && (
            <>
              <p>{progress.reviewSuggestion.reason}</p>
              <button
                className="secondary"
                disabled={busy}
                onClick={() =>
                  void start(progress.reviewSuggestion!.contentId, "review")
                }
              >
                Review missed ideas
              </button>
            </>
          )}
          <button
            className="secondary"
            onClick={() => {
              setInstance(null);
              delete saved.current.instanceId;
              persist();
            }}
          >
            Back to path
          </button>
        </div>
      )}
    </section>
  );
}
