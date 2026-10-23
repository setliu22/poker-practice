import { useEffect, useRef, useState } from "react";
import type {
  LearningPathAnswer,
  LearningPathAnswerCommand,
  StartLearningInstance,
  LearningPathEvent,
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
export function LearningPathDataControls({
  onChange,
}: {
  onChange?: () => Promise<void>;
}) {
  const [busy, setBusy] = useState(false);
  const [confirm, setConfirm] = useState(false);
  const [dataError, setDataError] = useState("");
  const [clearError, setClearError] = useState("");
  const lock = useRef(false);
  const trigger = useRef<HTMLButtonElement>(null);
  const dialog = useRef<HTMLDialogElement>(null);
  const returnDialogFocus = useRef(false);
  const dataRetry = useRef<() => Promise<void>>(async () => {});
  const clearRetry = useRef<() => Promise<void>>(async () => {});
  async function run(operation: () => Promise<void>, clear = false) {
    if (lock.current) return;
    lock.current = true;
    setBusy(true);
    const setError = clear ? setClearError : setDataError;
    (clear ? clearRetry : dataRetry).current = operation;
    setError("");
    try {
      await operation();
    } catch (error) {
      setError((error as Error).message);
    } finally {
      lock.current = false;
      setBusy(false);
    }
  }
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
    });
  }
  return (
    <>
      {dataError && (
        <div role="alert">
          <p>{dataError}</p>
          <button
            className="secondary"
            disabled={busy}
            onClick={() => void run(dataRetry.current)}
          >
            Retry download
          </button>
        </div>
      )}
      <div className="path-data-controls">
        <button
          className="secondary"
          disabled={busy}
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
                onClick={() => void run(clearRetry.current, true)}
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
                const saved = checkpoint();
                localStorage.setItem(
                  key,
                  JSON.stringify({ sessionId: saved.sessionId, acks: {} }),
                );
                await onChange?.();
                closeDialog();
              }, true)
            }
          >
            Confirm clear path progress
          </button>
        </dialog>
      )}
    </>
  );
}
