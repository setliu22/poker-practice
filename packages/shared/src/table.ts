import { z } from "zod";
import type { PreflopGuide } from "./preflop";
import type { ModelDecisionRating } from "./decision-rating";
import type { RangeDrawDensity } from "./range-draws";
export type DealMode = "random" | "easy";
export const tableCreateSchema = z
  .object({
    players: z.number().int().min(2).max(9),
    dealMode: z.enum(["random", "easy"]).default("random"),
  })
  .strict();
export const tableActionSchema = z
  .object({
    revision: z.number().int().nonnegative(),
    actionId: z.string().uuid(),
    action: z.enum(["fold", "check", "call", "raise"]),
    amount: z.number().int().positive().optional(),
  })
  .strict();
export const tableNextSchema = z
  .object({
    revision: z.number().int().nonnegative(),
    actionId: z.string().uuid(),
  })
  .strict();
export const tableOddsSchema = z
  .object({ revision: z.number().int().nonnegative() })
  .strict();
export type BotProfile = {
  id: string;
  name: string;
  style: string;
  summary: string;
  tendencies: string[];
  adjustment: string;
};
export type TableAction = "fold" | "check" | "call" | "raise";
export type TableView = {
  id: string;
  revision: number;
  handNumber: number;
  dealer: number;
  street: string;
  board: string[];
  pot: number;
  currentBet: number;
  actor: number | null;
  complete: boolean;
  dealMode?: DealMode;
  replayOf?: { tableId: string; handNumber: number };
  branchOf?: { tableId: string; sequence: number; handNumber: number };
  players: {
    seat: number;
    name: string;
    style: string;
    stack: number;
    streetBet: number;
    contributed: number;
    folded: boolean;
    allIn: boolean;
    hole?: string[];
    payout: number;
    handName?: string;
    bestFive?: string[];
    profile?: BotProfile;
  }[];
  legal: {
    toCall: number;
    canCheck: boolean;
    canRaise: boolean;
    minRaiseTo: number;
    maxRaiseTo: number;
  } | null;
  history: { street: string; seat: number | null; text: string }[];
  rounds?: DecisionReview[];
  review: { title: string; text: string; kind: "exact" | "illustrative" }[];
};

export type ProbabilityReview = {
  win: number;
  tie: number;
  lose: number;
  share: number;
  exact: boolean;
  samples: number;
  note: string;
};
export type LiveOdds = ProbabilityReview & {
  revision: number;
  handNumber: number;
  street: string;
  opponents: number;
  source: "inferred-ranges" | "random-hands";
  intervals: {
    win: [number, number];
    tie: [number, number];
    share: [number, number];
  };
};
export type RangeReview = {
  seat: number;
  name: string;
  style: string;
  combinations: number;
  examples: { cards: string[]; weight: number }[];
  groups: { name: string; percent: number }[];
  matrix?: RangeMatrixCell[];
  matchup?: { ahead: number; tied: number; behind: number };
  drawDensity?: RangeDrawDensity;
};
export type RangeMatrixCell = {
  hand: string;
  combinations: number;
  available: number;
  percent: number;
};
export type ResponsePreview = {
  key: string;
  label: string;
  fold: number;
  call: number;
  raise: number;
  foldExamples: { cards: string[]; percent: number }[];
  callExamples: { cards: string[]; percent: number }[];
  raiseExamples: { cards: string[]; percent: number }[];
};
export type DecisionContext = {
  position: string;
  opponents: number;
  playersStillToAct: number;
  stack: number;
  effectiveStack: number;
  raises: number;
  closingCall: boolean;
  callReason: string;
  observations: string[];
  takeaway: string;
  bestFive?: string[];
};
export type ActionValue = {
  sources?: {
    kind: "uncontested" | "showdown" | "folded";
    probability: number;
    contribution: number;
    averageNet: number;
  }[];
  key: string;
  label: string;
  chips: number;
  margin: number;
  exact: boolean;
  samples: number;
  allFold: number;
};
export type DecisionReview = {
  id: number;
  analysisVersion?: number;
  comparisons?: {
    key: string;
    difference: number;
    margin: number;
    samples: number;
    clear: boolean;
  }[];
  street: string;
  board: string[];
  hero: string[];
  hand: string;
  action: string;
  pot: number;
  call: number;
  callThreshold: number | null;
  risk: number;
  bluffThreshold: number | null;
  opponents: RangeReview[];
  rangeProbability: ProbabilityReview;
  actualProbability?: ProbabilityReview;
  actualCards?: {
    seat: number;
    name: string;
    cards: string[];
    folded: boolean;
    hand: string;
  }[];
  values: ActionValue[];
  chosenKey: string;
  verdict: string;
  explanation: string;
  model: string;
  rangeNote: string;
  responsePreviews?: ResponsePreview[];
  context?: DecisionContext;
  preflopGuide?: PreflopGuide;
  modelRating?: ModelDecisionRating;
};

export type DecisionStat = {
  street: string;
  score: number | null;
  loss: number | null;
  status?: "scored" | "inconclusive" | "legacy" | "model-only";
  reason?: string;
  modelRating?: ModelDecisionRating;
};
export type HandStat = {
  handNumber: number;
  profit: number;
  completedAt: string;
  scoringVersion?: number;
  modelRatingVersion?: 1;
  modelAnalysisVersion?: number;
  decisions: DecisionStat[];
};
export const gameDeleteSchema = z
  .object({ revision: z.number().int().nonnegative() })
  .strict();
export type GameStats = {
  id: string;
  gameNumber: number;
  revision: number;
  replayOf?: { tableId: string; handNumber: number };
  branchOf?: { tableId: string; sequence: number; handNumber: number };
  startedAt: string;
  players: number;
  hands: number;
  currentHand: number;
  inProgress: boolean;
  profit: number;
  score: number | null;
  decisions: number;
  scoredDecisions: number;
  unscoredDecisions: number;
  modelLoss: number;
  streets: { street: string; score: number; decisions: number }[];
  history: (HandStat & { score: number | null })[];
  modelRating?: {
    score: number | null;
    ratedDecisions: number;
    inconclusiveDecisions: number;
    unavailableDecisions: number;
  };
};
