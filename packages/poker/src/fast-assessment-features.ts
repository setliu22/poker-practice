import type { FastAssessmentCandidate } from "../../shared/src/fast-assessment";
import type { PublicAction, PublicRead } from "./bot-policy";
import { ranks, validateCards } from "./index";
import { legalActions, type TableState } from "./table";

/** Explicit allowlist: extracting a public snapshot never clones a private state. */
export type PublicAssessmentSnapshot = {
  hero: string[];
  board: string[];
  street: string;
  dealer: number;
  actor: number | null;
  complete: boolean;
  policyVersion: number;
  currentBet: number;
  minRaise: number;
  pending: number[];
  lastActBet: (number | null)[];
  players: {
    seat: number;
    botId?: string;
    style: string;
    stack: number;
    streetBet: number;
    contributed: number;
    folded: boolean;
    allIn: boolean;
  }[];
  actions: PublicAction[];
  reads: PublicRead[];
};
export const FEATURE_NAMES = [
  "highRank",
  "lowRank",
  "pair",
  "suited",
  "gap",
  "fold",
  "call",
  "raise",
  "raiseToBB",
] as const;
export function publicAssessmentSnapshot(
  s: TableState,
): PublicAssessmentSnapshot {
  return {
    hero: [...s.players[0].hole],
    board: [...s.board],
    street: s.street,
    dealer: s.dealer,
    actor: s.actor,
    complete: s.complete,
    policyVersion: s.policyVersion ?? 1,
    currentBet: s.currentBet,
    minRaise: s.minRaise,
    pending: [...s.pending],
    lastActBet: [...s.lastActBet],
    players: s.players.map((p) => ({
      seat: p.seat,
      botId: p.botId,
      style: p.style,
      stack: p.stack,
      streetBet: p.streetBet,
      contributed: p.contributed,
      folded: p.folded,
      allIn: p.allIn,
    })),
    actions: (s.actions ?? []).map((a) => ({
      seat: a.seat,
      street: a.street,
      action: a.action,
      ...(a.amount === undefined ? {} : { amount: a.amount }),
    })),
    reads: (s.reads ?? []).map((r) => ({
      seat: r.seat,
      decisions: r.decisions,
      facing: r.facing,
      folds: r.folds,
      calls: r.calls,
      raises: r.raises,
    })),
  };
}
export function validatePublicCandidate(
  s: PublicAssessmentSnapshot,
  c: FastAssessmentCandidate,
): string | null {
  if (!s.players.length || s.actor !== 0 || s.complete)
    return "Wait for your active decision.";
  // legalActions reads only fields present in this allowlisted structure.
  const legal = legalActions(s as unknown as TableState, 0);
  if (!legal) return "No legal action is available.";
  if (!["fold", "check", "call", "raise"].includes(c.action))
    return "Unknown action.";
  if (c.action !== "raise" && c.amount !== undefined)
    return "Only a raise accepts an amount.";
  if (c.action === "check" && !legal.canCheck)
    return "Checking is not legal while facing a bet.";
  if (c.action === "call" && !legal.toCall) return "There is no bet to call.";
  if (
    c.action === "raise" &&
    (!legal.canRaise ||
      !Number.isInteger(c.amount) ||
      c.amount! < legal.minRaiseTo ||
      c.amount! > legal.maxRaiseTo)
  )
    return "Choose a legal raise amount.";
  return null;
}
export function supportReason(
  s: PublicAssessmentSnapshot,
  c: FastAssessmentCandidate,
): string | null {
  const invalid = validatePublicCandidate(s, c);
  if (invalid) return invalid;
  try {
    validateCards([...s.hero, ...s.board]);
  } catch {
    return "Invalid visible cards.";
  }
  if (s.hero.length !== 2) return "Two hero cards are required.";
  if (
    s.policyVersion !== 2 ||
    s.players.length !== 2 ||
    s.players[1].botId !== "mara" ||
    s.players[1].style !== "Patient trapper"
  )
    return "This model supports heads-up openings against Mara under policy 2.";
  if (
    s.street !== "preflop" ||
    s.board.length ||
    s.dealer !== 0 ||
    s.actions.length ||
    s.reads.some(
      (r) => r.decisions || r.facing || r.folds || r.calls || r.raises,
    )
  )
    return "This model supports a fresh preflop button decision without prior actions or player reads.";
  if (
    s.currentBet !== 10 ||
    s.minRaise !== 10 ||
    s.players.some(
      (p, i) =>
        p.seat !== i ||
        p.folded ||
        p.allIn ||
        p.stack !== (i === 0 ? 995 : 990) ||
        p.streetBet !== (i === 0 ? 5 : 10) ||
        p.contributed !== p.streetBet,
    ) ||
    s.pending.join() !== "0,1" ||
    s.lastActBet.some((x) => x !== null)
  )
    return "This model supports the initial 100 big blind opening state.";
  if (
    c.action === "check" ||
    (c.action === "raise" && c.amount !== 20 && c.amount !== 25)
  )
    return "Supported choices are fold, call, raise to 20, or raise to 25 chips.";
  return null;
}
export function buildPublicFeatures(
  s: PublicAssessmentSnapshot,
  c: FastAssessmentCandidate,
): number[] {
  const rs = s.hero.map((x) => ranks.indexOf(x[0]) + 2).sort((a, b) => b - a);
  return [
    rs[0],
    rs[1],
    Number(rs[0] === rs[1]),
    Number(s.hero[0][1] === s.hero[1][1]),
    rs[0] - rs[1],
    Number(c.action === "fold"),
    Number(c.action === "call"),
    Number(c.action === "raise"),
    (c.amount ?? 0) / 10,
  ];
}
