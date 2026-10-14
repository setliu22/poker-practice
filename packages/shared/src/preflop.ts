/** Opening baselines are authored guidance, not solved strategy or skill grades. */
export type OpeningChart = {
  id: string;
  title: string;
  players: number;
  position: string;
  status: "illustrative";
  source: { name: string; url: string; license: string; revision: string };
  assumptions: string[];
  limitations: string[];
  raiseToBb: number;
  openPercent: number;
  cells: { hand: string; action: "raise" | "fold" }[];
};

export type PreflopGuide = {
  status: "available" | "unavailable";
  hand: string;
  position: string;
  note: string;
  reason?: string;
  chart?: OpeningChart;
  suggestedAction?: "raise" | "fold";
  raiseTo?: number;
  comparison?: {
    chosenAction: string;
    matches: boolean;
    explanation: string;
  };
};
