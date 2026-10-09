import { z } from "zod";
export const tableCreateSchema = z
  .object({ players: z.number().int().min(2).max(9) })
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
export type RangeReview = {
  seat: number;
  name: string;
  style: string;
  combinations: number;
  examples: { cards: string[]; weight: number }[];
  groups: { name: string; percent: number }[];
};
export type ActionValue = {
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
};
