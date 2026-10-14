import { parentPort, workerData } from "node:worker_threads";
import { assistantAnalysis } from "../../../packages/poker/src/decision-assistant";
try {
  parentPort!.postMessage({
    result: await assistantAnalysis(workerData.state, workerData.input),
  });
} catch (error) {
  parentPort!.postMessage({
    error:
      error instanceof Error
        ? error.message
        : "Unable to calculate this decision.",
  });
}
