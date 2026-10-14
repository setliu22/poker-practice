import { z } from "zod";
export const modes = [
  "who-wins",
  "what-beats-me",
  "pot-odds",
  "equity",
  "decision",
] as const;
export const modeLabels: Record<Mode, string> = {
  "who-wins": "Who wins?",
  "what-beats-me": "What beats me?",
  "pot-odds": "Pot odds",
  equity: "Equity vs. range",
  decision: "Make a decision",
};
export const createSchema = z
  .object({
    mode: z.enum(modes),
    seed: z.number().int().min(0).max(4294967295).optional(),
    targetWeak: z.boolean().default(false),
    street: z.enum(["river", "turn"]).default("river"),
    showdownStyle: z.enum(["random", "balanced"]).default("random"),
  })
  .strict();
export const answerSchema = z
  .object({
    answer: z.union([
      z.string().max(80),
      z.number().min(0).max(100),
      z
        .array(z.enum(["beats", "ties", "loses"]))
        .min(1)
        .max(8),
    ]),
    explanation: z.string().max(1000).optional(),
    timeMs: z.number().int().min(0).max(86400000),
  })
  .strict();
export type Mode = (typeof modes)[number];
export type Exercise = {
  id: string;
  mode: Mode;
  sourceId: string;
  question: string;
  hero?: string[];
  villain?: string[];
  board?: string[];
  range?: string[][];
  options?: string[];
  pot?: number;
  bet?: number;
  call?: number;
  tags: string[];
  context?: string[];
  objective?: string;
  provenance?: string;
  limitations?: string;
  assumptions?: string[];
  selection?: string;
  dealStyle?: "random" | "balanced";
};
export type Feedback = {
  kind: "exact" | "estimate" | "illustrative";
  correct?: boolean;
  result: string;
  explanation: string;
  takeaway: string;
  hands?: {
    label: string;
    name: string;
    cards: string[];
    summary?: string;
    outcome?: "winner" | "loser" | "tie";
    decisiveCards?: string[];
  }[];
  calculation?: string;
  equity?: number;
  estimate?: number;
  error?: number;
  rangeResults?: {
    combo: string[];
    equity: number;
    wins: number;
    ties: number;
    total: number;
  }[];
  stronger?: string[];
};
export type Attempt = {
  id: number;
  exerciseId: string;
  sourceId: string;
  mode: Mode;
  answer: unknown;
  explanation?: string;
  feedback: Feedback;
  timeMs: number;
  date: string;
  tags: string[];
};
export type Progress = {
  total: number;
  categorical: { mode: Mode; attempts: number; accuracy: number }[];
  numeric: { mode: Mode; attempts: number; averageError: number }[];
  skills: { tag: string; mistakes: number; attempts: number }[];
  recent: Attempt[];
  sessions: { date: string; attempts: number }[];
};
export const cardSchema = z.string().regex(/^[2-9TJQKA][cdhs]$/);
export const exerciseSchema = z
  .object({
    id: z.string(),
    mode: z.enum(modes),
    sourceId: z.string(),
    question: z.string(),
    hero: z.array(cardSchema).length(2).optional(),
    villain: z.array(cardSchema).length(2).optional(),
    board: z.array(cardSchema).min(4).max(5).optional(),
    range: z.array(z.array(cardSchema).length(2)).min(1).optional(),
    options: z.array(z.string()).optional(),
    pot: z.number().nonnegative().optional(),
    bet: z.number().positive().optional(),
    call: z.number().positive().optional(),
    tags: z.array(z.string()).min(1),
    context: z.array(z.string()).optional(),
    objective: z.string().optional(),
    provenance: z.string().optional(),
    limitations: z.string().optional(),
    assumptions: z.array(z.string()).optional(),
    selection: z.string().optional(),
    dealStyle: z.enum(["random", "balanced"]).optional(),
  })
  .strict();
