import { z } from "zod";
import type { PreflopGuide } from "./preflop";
import type {
  LiveOdds,
  ActionValue,
  BotProfile,
  RangeMatrixCell,
} from "./table";
export const assistantSchema = z
  .object({
    revision: z.number().int().nonnegative(),
    layer: z
      .enum(["context", "behavior", "advanced", "advice"])
      .default("context"),
    action: z.enum(["fold", "check", "call", "raise"]).optional(),
    amount: z.number().int().positive().optional(),
    continuation: z.enum(["theo", "check-fold"]).default("theo"),
  })
  .strict()
  .refine(
    (v) => v.amount === undefined || v.action === "raise",
    "Only a raise has a raise-to amount.",
  );
export type AssistantInput = z.infer<typeof assistantSchema>;
export type AssistantContext = {
  revision: number;
  hand: string;
  category: string;
  hole: string[];
  position: string;
  tableSize: number;
  competing: number;
  stillToAct: number;
  guide: PreflopGuide;
  effective: { seat: number; name: string; bb: number }[];
  history: { name: string; text: string }[];
  intuition: string[];
};
export type AssistantResponse = {
  seat: number;
  name: string;
  style: string;
  profile?: BotProfile;
  reached: number;
  range: { combinations: number; matrix: RangeMatrixCell[] };
  fold: number;
  call: number;
  raise: number;
  check: number;
  intervals: {
    fold: [number, number];
    call: [number, number];
    raise: [number, number];
  };
  observed: {
    decisions: number;
    facing: number;
    folds: number;
    calls: number;
    raises: number;
    foldInterval: [number, number];
    callInterval: [number, number];
    raiseInterval: [number, number];
  };
};
export type AssistantAnalysis = {
  revision: number;
  recommendation?: MoveAdvice;
  action: string;
  amount?: number;
  samples: number;
  opponents: AssistantResponse[];
  immediateAllFold: number;
  allFoldInterval: [number, number];
  branches: { label: string; percent: number; interval: [number, number] }[];
  continuation: "theo" | "check-fold";
  assumptions: string[];
  equity?: LiveOdds;
  values?: ActionValue[];
  comparisons?: {
    key: string;
    difference: number;
    margin: number;
    samples: number;
    clear: boolean;
  }[];
};

export type MoveAdvice = {
  key: string;
  action: "fold" | "check" | "call" | "raise";
  amount?: number;
  label: string;
  chips: number;
  status: "distinct" | "close";
  alternatives: string[];
  explanation: string;
};
