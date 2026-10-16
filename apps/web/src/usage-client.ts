// Usage stays on the local API. Failed acknowledgements are retryable and never
// prevent a learner from playing; unknown assistance remains unknown on export.
let memorySession: string | undefined;
export function practiceSessionId(): string {
  if (memorySession) return memorySession;
  try {
    const saved = sessionStorage.getItem("poker-practice-session");
    memorySession =
      saved && /^[0-9a-f-]{36}$/i.test(saved) ? saved : crypto.randomUUID();
    sessionStorage.setItem("poker-practice-session", memorySession);
  } catch {
    memorySession = crypto.randomUUID();
  }
  return memorySession;
}
export function practiceSessionHeaders(): Record<string, string> {
  return { "x-practice-session": practiceSessionId() };
}
let registration: Promise<void> | undefined;
let recordingError = "";
const listeners = new Set<() => void>();
const pending = new Map<string, () => Promise<void>>();
const running = new Set<string>();
const completed = new Set<string>();
const activePosts = new Set<Promise<void>>();
let clearing = false;
function notify() {
  for (const listener of listeners) listener();
}
export function subscribeUsage(listener: () => void) {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}
export function usageRecordingError() {
  return recordingError;
}
function post(path: string, body: unknown) {
  const operation = (async () => {
    const response = await fetch(`/api/v1/usage/${path}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(5000),
    });
    if (!response.ok)
      throw new Error("Some local practice records could not be saved.");
  })();
  activePosts.add(operation);
  void operation.then(
    () => activePosts.delete(operation),
    () => activePosts.delete(operation),
  );
  return operation;
}
function registerSession() {
  registration ??= post("sessions", { id: practiceSessionId() }).catch(
    (error) => {
      registration = undefined;
      throw error;
    },
  );
  return registration;
}
async function run(key: string) {
  if (clearing || running.has(key) || completed.has(key)) return;
  const operation = pending.get(key);
  if (!operation) return;
  running.add(key);
  try {
    await registerSession();
    if (clearing) return;
    await operation();
    completed.add(key);
    pending.delete(key);
    if (!pending.size) recordingError = "";
  } catch {
    recordingError =
      "Some local practice records could not be saved. Play can continue; assistance may be recorded as unknown.";
  } finally {
    running.delete(key);
    notify();
  }
}
function enqueue(key: string, operation: () => Promise<void>) {
  if (clearing || completed.has(key) || pending.has(key)) return;
  pending.set(key, operation);
  void run(key);
}
export function recordDecisionViewed(tableId: string, revision: number) {
  const sessionId = practiceSessionId();
  const eventId = crypto.randomUUID();
  enqueue(`view/${sessionId}/${tableId}/${revision}`, () =>
    post("viewed", {
      eventId,
      sessionId,
      tableId,
      revision,
    }),
  );
}
export function recordAssessmentShown(receipt: string | undefined) {
  if (!receipt) return;
  const sessionId = practiceSessionId();
  enqueue(`exposure/${receipt}`, () =>
    post("exposures", { receipt, sessionId }),
  );
}
export async function retryUsageRecording() {
  await Promise.all([...pending.keys()].map(run));
}
export async function clearUsageRecords() {
  clearing = true;
  try {
    // Drain requests before deletion so a delayed acknowledgement cannot restore
    // a record the learner just erased.
    await Promise.allSettled([...activePosts]);
    const response = await fetch("/api/v1/usage", {
      method: "DELETE",
      signal: AbortSignal.timeout(10000),
    });
    if (!response.ok) throw new Error("Could not clear local usage records.");
    pending.clear();
    completed.clear();
    registration = undefined;
    memorySession = undefined;
    try {
      sessionStorage.removeItem("poker-practice-session");
    } catch {
      /* Memory fallback remains available. */
    }
    recordingError = "";
    notify();
  } finally {
    clearing = false;
  }
}
