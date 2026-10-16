import type { ModelDecisionRating } from "./decision-rating";
import type { TableAction, TableView } from "./table";

export type DecisionExample = {
  sequence: number;
  handNumber: number;
  groupId: string;
  practice: boolean;
  eligibleForTraining: boolean;
  features: {
    street: string;
    hero: string[];
    board: string[];
    pot: number;
    toCall: number;
    stack: number;
    opponents: number;
    dealer: number;
    history: TableView["history"];
  };
  chosen: { action: TableAction; amount?: number };
  label: {
    source: "conditional-bot-model";
    analysisVersion: 7;
    modelRating: ModelDecisionRating;
    modeledGap: boolean | null;
  } | null;
};
export type DecisionDataset = {
  version: 1;
  tableId: string;
  revision: number;
  note: string;
  examples: DecisionExample[];
  practiceCandidates: number[];
};
