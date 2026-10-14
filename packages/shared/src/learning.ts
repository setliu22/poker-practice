import { z } from "zod";
export const learningAnswerSchema = z
  .object({
    action: z.enum(["bet", "check"]),
    reason: z.enum(["weaker-call", "stronger-only"]),
    timeMs: z.number().int().min(0).max(86400000),
  })
  .strict();
export type LearningQuestion = {
  id: string;
  index: number;
  total: number;
  stage: "Practice" | "Contrast" | "Transfer";
  title: string;
  hole: string[];
  board: string[];
  pot: number;
  bet: number;
  opponents: { cards: string[]; response: "call" | "fold" }[];
  context: string;
  change: string;
  assumptions: string[];
};
export type LearningFeedback = {
  actionCorrect: boolean;
  reasonCorrect: boolean;
  best: "bet" | "check";
  betEv: number;
  checkEv: number;
  explanation: string;
  takeaway: string;
  branches: {
    cards: string[];
    outcome: string;
    response: string;
    checkNet: number;
    betNet: number;
  }[];
};
export type LearningProgress = {
  attempts: number;
  decisionsCorrect: number;
  reasonsCorrect: number;
  transferAttempts: number;
  transferBothCorrect: number;
  recent: {
    date: string;
    title: string;
    stage: string;
    actionCorrect: boolean;
    reasonCorrect: boolean;
  }[];
};
