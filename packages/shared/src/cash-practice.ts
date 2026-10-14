import { z } from "zod";

export const cashSkills = [
  "bluff-catch",
  "value-bet",
  "bluff",
  "multiway-call",
] as const;
export type CashSkill = (typeof cashSkills)[number];
export const cashPhases = ["initial", "transfer"] as const;
export type CashPhase = (typeof cashPhases)[number];
export type CashAction = "fold" | "call" | "check" | "bet";
export type CashConfidence = "unsure" | "somewhat-sure" | "very-sure";

export const cashCreateSchema = z
  .object({
    players: z.number().int().min(2).max(9),
    skill: z.enum(cashSkills).optional(),
  })
  .strict();
export const cashAnswerSchema = z
  .object({
    phase: z.enum(cashPhases),
    action: z.enum(["fold", "call", "check", "bet"]),
    reasonId: z.string().min(1).max(80),
    estimatePercent: z.number().min(0).max(100),
    confidence: z.enum(["unsure", "somewhat-sure", "very-sure"]),
  })
  .strict();
export const cashHintSchema = z.object({ phase: z.enum(cashPhases) }).strict();
export type CashAnswer = z.infer<typeof cashAnswerSchema>;

export type CashSeat = {
  seat: number;
  position: string;
  label: string;
  status: "active" | "folded";
  /** Chips remaining at this decision, measured in big blinds. */
  stackBb: number;
};
export type CashHistoryAction = {
  street: "preflop" | "flop" | "turn" | "river";
  seat: number;
  action:
    "small-blind" | "big-blind" | "fold" | "check" | "call" | "bet" | "raise";
  /** Total committed on this street after the action; blinds count preflop. */
  streetTotalBb: number;
  label: string;
};
export type CashRange = {
  seat: number;
  label: string;
  /** Supplied study probabilities, normalized per range before joint conditioning. */
  combinations: {
    cards: string[];
    weight: number;
    /** Stipulated response to the offered bet, used only in bet/check drills. */
    response?: "call" | "fold";
  }[];
};
export type CashQuestion = {
  phase: CashPhase;
  skill: CashSkill;
  title: string;
  tablePlayers: number;
  activePlayers: number;
  heroSeat: number;
  dealerSeat: number;
  startingStackBb: number;
  /** Effective stack at the start of the river, before visible river wagers. */
  effectiveStackBb: number;
  seats: CashSeat[];
  hole: string[];
  board: string[];
  /** Current gross pot, including visible opponent river bets/calls. */
  potBb: number;
  callBb: number;
  /** Offered hero bet, zero in call/fold exercises. */
  betBb: number;
  /** Fixed study deduction from the settled pot; not a site's actual fee schedule. */
  rakeBb: number;
  history: CashHistoryAction[];
  ranges: CashRange[];
  options: { action: CashAction; label: string }[];
  reasons: { id: string; label: string }[];
  estimatePrompt: string;
  assumptions: string[];
  change?: string;
};
export type CashFeedback = {
  phase: CashPhase;
  actionCorrect: boolean;
  reasonCorrect: boolean;
  estimateCorrect: boolean;
  estimateErrorPp: number;
  correct: boolean;
  assisted: boolean;
  acceptedActions: CashAction[];
  expectedEstimate: number;
  selectedActionEvBb: number;
  actionValues: { action: CashAction; label: string; evBb: number }[];
  sharePercent?: number;
  foldPercent?: number;
  weakerCallerPercent?: number;
  legalWorlds: number;
  explanation: string;
  calculation: string;
  takeaway: string;
};
/** Private saved specification. Never spread this into an unanswered response. */
export type CashDrillSpecification = {
  version: 1;
  seed: number;
  skill: CashSkill;
  initial: CashQuestion;
  transfer: CashQuestion;
  fingerprint: string;
};
export type CashDrillView = {
  id: string;
  createdAt: string;
  selectionReason: string;
  initial: CashQuestion;
  /** Null until the initial first answer has been submitted. */
  transfer: CashQuestion | null;
  answers: Partial<Record<CashPhase, CashAnswer>>;
  feedback: Partial<Record<CashPhase, CashFeedback>>;
  assisted: CashPhase[];
};
export type CashSkillProgress = {
  skill: CashSkill;
  label: string;
  attempts: number;
  independentAttempts: number;
  independentCorrect: number;
  assistedAttempts: number;
  actionMistakes: number;
  reasonMistakes: number;
  estimateMeanErrorPp: number | null;
  transferAttempts: number;
  transferCorrect: number;
  reviewPriority: number;
  nextCue: string;
};
export type CashProgress = {
  attempts: number;
  independentAttempts: number;
  independentCorrect: number;
  assistedAttempts: number;
  transferAttempts: number;
  transferCorrect: number;
  highConfidenceMistakes: number;
  recommendedSkill: CashSkill | null;
  nextSessionCue: string;
  skills: CashSkillProgress[];
  recent: {
    id: string;
    date: string;
    skill: CashSkill;
    label: string;
    assisted: boolean;
    confidence: CashConfidence;
    correct: boolean;
    actionCorrect: boolean;
    reasonCorrect: boolean;
    estimateErrorPp: number;
  }[];
};
