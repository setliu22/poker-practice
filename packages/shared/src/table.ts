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
  }[];
  legal: {
    toCall: number;
    canCheck: boolean;
    canRaise: boolean;
    minRaiseTo: number;
    maxRaiseTo: number;
  } | null;
  history: { street: string; seat: number | null; text: string }[];
  review: { title: string; text: string; kind: "exact" | "illustrative" }[];
};
