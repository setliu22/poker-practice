import { z } from "zod";

export const usageSessionSchema = z.object({ id: z.uuid() }).strict();
export const usageViewedSchema = z
  .object({
    eventId: z.uuid(),
    sessionId: z.uuid().optional(),
    tableId: z.string().min(1).max(200),
    revision: z.number().int().nonnegative(),
  })
  .strict();
export const assessmentExposureSchema = z
  .object({
    kind: z.enum(["fast", "move-hint", "odds", "guide"]),
    modelId: z
      .string()
      .regex(/^[a-zA-Z0-9_.-]{1,100}$/)
      .optional(),
    action: z.enum(["fold", "check", "call", "raise"]).optional(),
    amount: z.number().int().positive().optional(),
    result: z
      .enum([
        "modeled-gap",
        "no-clear-gap",
        "uncertain",
        "unsupported",
        "shown",
      ])
      .optional(),
    probability: z.number().min(0).max(1).optional(),
  })
  .strict();
export const usageExposureSchema = z
  .object({
    receipt: z.string().min(10).max(4096),
    sessionId: z.uuid().optional(),
  })
  .strict();
export type AssessmentExposure = z.infer<typeof assessmentExposureSchema>;
export type UsageEvent = {
  cursor: number;
  eventId: string;
  version: 1;
  source: "human-ui" | "api-unknown";
  installationId: string;
  sessionId: string | null;
  tableId: string;
  revision: number;
  kind: "decision-viewed" | "assessment-shown" | "decision-committed";
  createdAt: string;
  payload: Record<string, unknown>;
};
export type UsageExport = {
  version: 1;
  installationId: string;
  through: number;
  next: number;
  hasMore: boolean;
  events: UsageEvent[];
};
export type UsageSummary = {
  version: 1;
  installationId: string;
  bySource: { humanUi: number; apiUnknown: number };
  sessions: number;
  events: number;
  decisions: number;
  viewed: number;
  exposures: number;
  decisionsWithKnownExposure: number;
  decisionsWithUnknownAssistance: number;
  note: string;
};
