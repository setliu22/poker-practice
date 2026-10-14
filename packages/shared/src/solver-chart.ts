export type SolverChart = {
  status: "queued" | "building" | "solving" | "ready" | "unavailable";
  message: string;
  revision: number;
  source: "GTOpen";
  engineRevision: string;
  iteration?: number;
  gap?: number;
  targetGap?: number;
  converged?: boolean;
  positions?: string[];
  path?: number[];
  actions?: { kind: string; label: string; amount?: number }[];
  cells?: { hand: string; frequencies: number[]; reach: number }[];
  limitations?: string[];
};
