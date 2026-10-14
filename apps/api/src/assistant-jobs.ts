import { Worker } from "node:worker_threads";
import type {
  AssistantAnalysis,
  AssistantInput,
} from "../../../packages/shared/src/assistant";
import type { TableState } from "../../../packages/poker/src/table";
let running = 0;
export function calculateAssistant(
  state: TableState,
  input: AssistantInput,
  signal?: AbortSignal,
): Promise<AssistantAnalysis> {
  if (signal?.aborted)
    return Promise.reject(new Error("Calculation cancelled."));
  if (running >= 2)
    return Promise.reject(
      new Error(
        "Two calculations are already running. Please try again shortly.",
      ),
    );
  running++;
  return new Promise((resolve, reject) => {
    let finished = false;
    const source = import.meta.url.endsWith(".ts");
    let worker: Worker;
    try {
      worker = new Worker(
        new URL(
          source ? "./assistant-worker.ts" : "./assistant-worker.js",
          import.meta.url,
        ),
        {
          workerData: { state, input },
          execArgv: source ? ["--import", "tsx"] : [],
        },
      );
    } catch (error) {
      running--;
      reject(error);
      return;
    }
    const finish = (error?: Error, result?: AssistantAnalysis) => {
      if (finished) return;
      finished = true;
      running--;
      clearTimeout(timer);
      signal?.removeEventListener("abort", onAbort);
      void worker.terminate();
      if (error) reject(error);
      else resolve(result!);
    };
    const timer = setTimeout(
      () =>
        finish(
          new Error("This calculation took too long. Try a simpler decision."),
        ),
      60000,
    );
    const onAbort = () => finish(new Error("Calculation cancelled."));
    signal?.addEventListener("abort", onAbort, { once: true });
    if (signal?.aborted) onAbort();
    worker.on("message", (message) =>
      message.error
        ? finish(new Error(message.error))
        : finish(undefined, message.result),
    );
    worker.on("error", (error) =>
      finish(error instanceof Error ? error : new Error(String(error))),
    );
    worker.on("exit", () => {
      if (!finished)
        finish(new Error("The calculation stopped before returning a result."));
    });
  });
}
