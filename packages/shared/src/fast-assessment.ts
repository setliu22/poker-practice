import { z } from "zod";

export const fastAssessmentRequestSchema = z
  .object({
    revision: z.number().int().nonnegative(),
    action: z.enum(["fold", "check", "call", "raise"]),
    amount: z.number().int().positive().optional(),
  })
  .strict();
export type FastAssessmentCandidate = {
  action: "fold" | "check" | "call" | "raise";
  amount?: number;
};
export type FastAssessmentResult = {
  modelId: string;
  featureVersion: 1;
  status: "ready" | "uncertain" | "unsupported";
  probability: number | null;
  label: "model-gap" | "no-clear-gap" | null;
  threshold: number | null;
  support: string;
  limitations: string[];
  reason?: string;
};
