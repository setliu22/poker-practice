import type { LiveOdds } from "../../shared/src/table";
import type { DecisionFrame, TableState } from "./table";
import { inferredRange } from "./table-review";
import { estimateShowdown } from "./showdown";

export function liveOddsFrame(state: TableState): DecisionFrame {
  if (state.complete || state.players[0].folded)
    throw new Error(
      "Odds are available while you are still in an active hand.",
    );
  const boardSizes: Record<string, number> = {
    preflop: 0,
    flop: 3,
    turn: 4,
    river: 5,
  };
  if (state.board.length !== boardSizes[state.street])
    throw new Error("The public board does not match the current street.");
  return {
    id: state.revision,
    street: state.street,
    board: [...state.board],
    // Explicitly copy public seat fields. Opponent hole cards are never read.
    players: state.players.map((p) => ({
      seat: p.seat,
      name: p.name,
      style: p.style,
      botId: p.botId,
      stack: p.stack,
      streetBet: p.streetBet,
      contributed: p.contributed,
      folded: p.folded,
      allIn: p.allIn,
      payout: 0,
      hole: p.seat === 0 ? [...p.hole] : [],
    })),
    dealer: state.dealer,
    currentBet: state.currentBet,
    minRaise: state.minRaise,
    pending: [...state.pending],
    lastActBet: [...state.lastActBet],
    action: "check",
    eventCount: state.policyEvents?.length ?? 0,
    policyVersion: state.policyVersion,
  };
}

export async function liveOdds(state: TableState): Promise<LiveOdds> {
  const frame = liveOddsFrame(state);
  const seats = frame.players
    .filter((p) => p.seat !== 0 && !p.folded)
    .map((p) => p.seat);
  if (!seats.length) throw new Error("There are no opponents still competing.");
  const ranges = new Map(
    seats.map((seat) => [seat, inferredRange(state, frame, seat)]),
  );
  const informed = (state.policyEvents ?? []).some((event) =>
    seats.includes(event.seat),
  );
  // The seed depends on public identifiers, never the actual deal's seed/runout.
  let seed = 2166136261;
  for (const c of `${state.analysisIdentity ?? state.id}/${state.handNumber}/${state.actions?.length ?? state.history.length}/live-odds-v1`)
    seed = Math.imul(seed ^ c.charCodeAt(0), 16777619);
  const result = await estimateShowdown(frame, ranges, seed >>> 0);
  return {
    ...result,
    revision: state.revision,
    handNumber: state.handNumber,
    street: state.street,
    opponents: seats.length,
    source: informed ? "inferred-ranges" : "random-hands",
    note: `${result.note} Everyone still competing is assumed to reach showdown. This does not predict folds or recommend an action. Sampling intervals do not measure how realistic the bot ranges are. Share splits ties equally before odd chips or side-pot eligibility. Folded cards are unknown and sampled uniformly.`,
  };
}
