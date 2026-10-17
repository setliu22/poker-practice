import { useEffect, useRef, useState } from "react";
import type {
  LearningPathAnswer,
  LearningPathAnswerCommand,
  LearningPathCatalog,
  LearningPathFeedback,
  LearningPathInstanceState,
  LearningPathProgress,
  LearningPathEvent,
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
  const [confirm, setConfirm] = useState(false);
  const [dataError, setDataError] = useState("");
  const [clearError, setClearError] = useState("");
  const courseHeading = useRef<HTMLHeadingElement>(null);
  const dataRetry = useRef<() => Promise<void>>(async () => {});
  const clearRetry = useRef<() => Promise<void>>(async () => {});
  const feedbackHeading = useRef<HTMLHeadingElement>(null);
  const returnDialogFocus = useRef(false);
  const heading = useRef<HTMLHeadingElement>(null),
    trigger = useRef<HTMLButtonElement>(null),
    dialog = useRef<HTMLDialogElement>(null);
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
  async function run(
    operation: () => Promise<void>,
    channel: "lesson" | "data" | "clear" = "lesson",
  ) {
    if (lock.current) return;
    lock.current = true;
    setBusy(true);
    const setOperationError =
      channel === "data"
        ? setDataError
        : channel === "clear"
          ? setClearError
          : setError;
    const operationRetry =
      channel === "data" ? dataRetry : channel === "clear" ? clearRetry : retry;
    setOperationError("");
    if (channel === "lesson") setStale(false);
    operationRetry.current = operation;
    try {
      await operation();
    } catch (e) {
      setOperationError((e as Error).message);
      if (channel === "lesson")
        setStale(e instanceof PathError && e.status === 409);
    } finally {
      lock.current = false;
      setBusy(false);
    }
  }
  async function refresh() {
    setProgress(await api<LearningPathProgress>("/progress"));
  }
  function display(state: LearningPathInstanceState) {
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
      api<LearningPathProgress>("/progress"),
    ]);
    setCatalog(course);
    setProgress(summary);
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
    (instance
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
  ]);
  useEffect(() => {
    if (confirm) {
      dialog.current?.showModal();
      dialog.current?.querySelector("button")?.focus();
    }
  }, [confirm]);
  useEffect(() => {
    if (returnDialogFocus.current && !confirm && !busy) {
      trigger.current?.focus();
      returnDialogFocus.current = false;
    }
  }, [confirm, busy]);
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
  async function start(contentId: string) {
    if (!catalog) return;
    saved.current.start = {
      eventId: crypto.randomUUID(),
      instanceId: crypto.randomUUID(),
      sessionId: saved.current.sessionId,
      contentId,
      contentVersion: catalog.contentVersion,
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
  function closeDialog() {
    returnDialogFocus.current = true;
    setConfirm(false);
    dialog.current?.close();
    trigger.current?.focus();
  }
  async function exportData() {
    await run(async () => {
      type Page = {
        version: number;
        installationId: string;
        throughCursor: number;
        events: LearningPathEvent[];
        nextCursor: number;
        done: boolean;
      };
      let page = await api<Page>("/export?limit=100");
      const first = page;
      const events = [...page.events];
      while (!page.done) {
        const previous = page.nextCursor;
        page = await api<Page>(
          `/export?limit=100&afterCursor=${previous}&throughCursor=${first.throughCursor}`,
        );
        if (
          page.throughCursor !== first.throughCursor ||
          page.nextCursor <= previous
        )
          throw new Error(
            "Export cursor did not advance. Please retry the download.",
          );
        events.push(...page.events);
      }
      const url = URL.createObjectURL(
        new Blob(
          [
            JSON.stringify(
              {
                version: first.version,
                installationId: first.installationId,
                throughCursor: first.throughCursor,
                events,
              },
              null,
              2,
            ),
          ],
          { type: "application/json" },
        ),
      );
      const anchor = document.createElement("a");
      anchor.href = url;
      anchor.download = "poker-learning-path.json";
      anchor.click();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
    }, "data");
  }
  const lessons = catalog?.units.flatMap((unit) => unit.lessons) ?? [];
  const nextLesson = lessons.find(
    (lesson) => lesson.contentId === progress?.nextLessonContentId,
  );
  return (
    <section
      className="panel learning-path"
      aria-busy={busy}
      aria-label="Beginner learning path"
    >
      <span className="eyebrow">Beginner path · Local progress</span>
      <h1 ref={courseHeading} tabIndex={-1}>
        {catalog?.title ?? "Loading beginner path…"}
      </h1>
      {progress && (
        <p>
          {progress.completedLessons} lessons completed ·{" "}
          {progress.answerAttempts} answers attempted ·{" "}
          {Object.values(progress.bySkill).reduce(
            (sum, skill) => sum + skill.incorrect,
            0,
          )}{" "}
          mistakes to learn from
        </p>
      )}
      {progress && (
        <div role="region" aria-label="Fresh transfer results">
          <p>
            Fresh transfer results: {progress.transferCorrect}/
            {progress.transferAttempts} correct on first presentations.
          </p>
          <p className="quiet">Reused variants count as practice only.</p>
        </div>
      )}
      <p className="quiet">
        Practice consistency and understanding are separate. These counts are
        practice history, not a mastery or speed score.
      </p>
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
      {!instance && catalog && progress && (
        <div role="region" aria-label="Recommended next lesson">
          <p>
            {
              lessons.filter((lesson) =>
                progress.completedContentIds.includes(lesson.contentId),
              ).length
            }{" "}
            of {lessons.length} lessons completed
          </p>
          {nextLesson ? (
            <>
              <p>Recommended next lesson: {nextLesson.title}</p>
              <button
                disabled={busy}
                className="primary"
                onClick={() => void start(nextLesson.contentId)}
              >
                Continue with {nextLesson.title}
              </button>
            </>
          ) : (
            <p>Course complete. Repeat any lesson for more practice.</p>
          )}
          {progress.reviewSuggestion && (
            <>
              <p>{progress.reviewSuggestion.reason}</p>
              <button
                disabled={busy}
                className="secondary"
                onClick={() => void start(progress.reviewSuggestion!.contentId)}
              >
                Review missed ideas
              </button>
            </>
          )}
        </div>
      )}
      {!instance &&
        catalog &&
        catalog.units.map((unit) => (
          <div key={unit.id}>
            <h2>{unit.title}</h2>
            {unit.lessons.map((lesson) => (
              <div key={lesson.contentId}>
                <p>{lesson.title}</p>
                {progress?.completedContentIds.includes(lesson.contentId) && (
                  <p role="note" aria-label={`Completed ${lesson.title}`}>
                    Completed · Repeat any time
                  </p>
                )}
                <button
                  disabled={busy}
                  className="primary"
                  onClick={() => void start(lesson.contentId)}
                >
                  Start {lesson.title}
                </button>
              </div>
            ))}
          </div>
        ))}
      {instance && !instance.complete && (
        <>
          <p className="quiet">
            {instance.title} · Question{" "}
            {Math.min(instance.questionIndex + 1, instance.totalQuestions)} of{" "}
            {instance.totalQuestions}
          </p>
          <details open={instance.questionIndex === 0 || undefined}>
            <summary>Lesson concept</summary>
            <p>{instance.concept}</p>
            <p>{instance.intro}</p>
          </details>
          {question && (
            <>
              <h2 ref={heading} tabIndex={-1}>
                {question.title}
              </h2>
              <p>{question.prompt}</p>
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
                    disabled={busy || !ready || !!saved.current.pending}
                  >
                    <legend>Your answer</legend>
                    {question.answerKind === "choice" ? (
                      question.choices?.map((choice) => (
                        <label key={choice.id}>
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
                <div role="region" aria-label="Path feedback">
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
            </>
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
      {instance?.complete && (
        <>
          <h2 tabIndex={-1} ref={heading}>
            Lesson complete
          </h2>
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
                onClick={() => void start(progress.reviewSuggestion!.contentId)}
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
        </>
      )}
      {dataError && (
        <div role="alert">
          <p>{dataError}</p>
          <button
            className="secondary"
            disabled={busy}
            onClick={() => void run(dataRetry.current, "data")}
          >
            Retry download
          </button>
        </div>
      )}
      <div className="path-data-controls">
        <button
          className="secondary"
          disabled={busy || !catalog}
          onClick={() => void exportData()}
        >
          Download path data
        </button>
        <button
          className="secondary"
          ref={trigger}
          disabled={busy}
          onClick={() => setConfirm(true)}
        >
          Clear path progress
        </button>
      </div>
      {confirm && (
        <dialog
          ref={dialog}
          aria-labelledby="clear-path-title"
          onCancel={(event) => {
            event.preventDefault();
            closeDialog();
          }}
        >
          <h2 id="clear-path-title">Clear this learning path?</h2>
          <p>
            This deletes this course's local answers, events and progress.
            Earlier exercises, table history and downloaded copies remain
            separate.
          </p>
          {clearError && (
            <div role="alert">
              <p>{clearError}</p>
              <button
                className="secondary"
                disabled={busy}
                onClick={() => void run(clearRetry.current, "clear")}
              >
                Retry clear progress
              </button>
            </div>
          )}
          <button className="secondary" onClick={closeDialog}>
            Keep progress
          </button>
          <button
            className="secondary"
            disabled={busy}
            onClick={() =>
              void run(async () => {
                await api("/progress", undefined, "DELETE");
                setError("");
                setStale(false);
                setDataError("");
                saved.current = {
                  sessionId: saved.current.sessionId,
                  acks: {},
                };
                persist();
                setInstance(null);
                setFeedback(null);
                await refresh();
                closeDialog();
              }, "clear")
            }
          >
            Confirm clear path progress
          </button>
        </dialog>
      )}
    </section>
  );
}
