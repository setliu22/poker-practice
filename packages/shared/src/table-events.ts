import { z } from "zod";
import type { TableAction, TableView } from "./table";

export type TableEventReason =
  "created" | "next" | "reset" | "replay" | "branch" | "legacy";

/** Public journal metadata. Private checkpoint payloads never cross the API. */
export type TableEventView = {
  sequence: number;
  version: 1;
  kind: "checkpoint" | "action" | "revision";
  handNumber: number;
  reason?: TableEventReason;
  partial?: boolean;
  street: string;
  board: string[];
  pot: number;
  seat?: number;
  name?: string;
  action?: TableAction;
  amount?: number;
  heroDecision: boolean;
  hero?: string[];
  legal?: TableView["legal"];
};

export type TableEventHistory = {
  tableId: string;
  revision: number;
  events: TableEventView[];
};

export const tableBranchSchema = z
  .object({
    revision: z.number().int().nonnegative(),
    actionId: z.string().uuid(),
    sequence: z.number().int().positive(),
  })
  .strict();
