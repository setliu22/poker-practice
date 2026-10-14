/**
 * Agreement with the tested actions in the application's opponent model.
 * This is not a grade of poker skill or a claim about optimal poker strategy.
 */
export type ModelDecisionRating = {
  version: 1;
  status: "estimated" | "exact-under-model" | "inconclusive" | "unavailable";
  score: number | null;
  scoreInterval: [number, number] | null;
  regretBb: number | null;
  regretIntervalBb: [number, number] | null;
  explanation: string;
};
