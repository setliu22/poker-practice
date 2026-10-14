import { z } from "zod";
export const readAnswerSchema = z.discriminatedUnion("step", [
  z
    .object({
      step: z.literal("range"),
      drawPercent: z.number().min(0).max(100),
    })
    .strict(),
  z
    .object({
      step: z.literal("cards"),
      outcomes: z
        .array(z.enum(["ahead", "behind", "tie", "blocked"]))
        .length(6),
    })
    .strict(),
  z
    .object({
      step: z.literal("decision"),
      equityPercent: z.number().min(0).max(100).optional(),
      pricePercent: z.number().min(0).max(100).optional(),
      counterAction: z.enum(["call", "fold"]).optional(),
      action: z.enum(["call", "fold"]),
      reason: z.enum(["price", "hit"]),
    })
    .strict(),
]);
export type ReadStep = "range" | "cards" | "decision";
export type ReadQuestion = {
  id: string;
  variant: number;
  title: string;
  hole: string[];
  board: string[];
  opponents: {
    cards: string[];
    label: string;
    prior: number;
    betLikelihood: number;
  }[];
  candidates: string[];
  potBefore: number;
  bet: number;
  assumptions: string[];
  generatorVersion?: number;
  seed?: number;
  skill?: string;
  selectionReason?: string;
  counterBet?: number;
  coaching?: string;
  guide?: { cards: string[]; equity: number; weight: number }[];
  completed: Partial<Record<ReadStep, ReadFeedback>>;
};
export type ReadFeedback = {
  step: ReadStep;
  explanation: string;
  correct?: boolean;
  errorPp?: number;
  drawPercent?: number;
  calculation?: string;
  outcomes?: {
    card: string;
    opponent: string;
    result: string;
    explanation: string;
  }[];
  equity?: number;
  winPercent?: number;
  tiePercent?: number;
  required?: number;
  callEv?: number;
  priceError?: number;
  counterCorrect?: boolean;
  counterRequired?: number;
  counterEv?: number;
  actionCorrect?: boolean;
  reasonCorrect?: boolean;
  rows?: {
    label: string;
    weight: number;
    wins: number;
    ties: number;
    total: number;
    equity: number;
  }[];
};
export type ReadProgress = {
  completed: number;
  rangeError: number | null;
  equityError: number | null;
  cardAccuracy: number | null;
  decisionsCorrect: number;
  reasonsCorrect: number;
};
