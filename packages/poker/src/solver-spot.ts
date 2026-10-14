import { positionName } from "../../shared/src/positions";
import { assistantSnapshot } from "./decision-assistant";
import { legalActions, type TableState } from "./table";
import type { SolverChart } from "../../shared/src/solver-chart";
import { z } from "zod";
export const GTOPEN_REVISION = "b69ea07c79884fc598757dc45c712e73976db810";
export function solverSpot(state: TableState) {
  if (state.street !== "preflop" || state.complete)
    throw new Error("GTOpen charts are available on your active preflop turn.");
  const s = assistantSnapshot(state);
  const n = s.players.length,
    first = n === 2 ? s.dealer : (s.dealer + 3) % n;
  const seats = Array.from({ length: n }, (_, i) => (first + i) % n);
  const starting = s.players.map((p) => p.stack + p.contributed);
  if (starting.some((v) => v !== starting[0]))
    throw new Error(
      "This GTOpen engine requires equal starting stacks; this hand has unequal stacks.",
    );
  const posts = seats.map((seat) =>
    seat === (n === 2 ? s.dealer : (s.dealer + 1) % n)
      ? 0.5
      : seat === (n === 2 ? (s.dealer + 1) % n : (s.dealer + 2) % n)
        ? 1
        : 0,
  );
  const opens = seats.map(() => [] as number[]),
    mults = seats.map(() => [] as number[]),
    four = seats.map(() => [] as number[]);
  let bet = 10,
    raises = 0;
  const history = (s.actions ?? []).filter((a) => a.street === "preflop");
  for (const a of history)
    if (a.action === "raise") {
      if (!a.amount || a.amount <= bet)
        throw new Error("Invalid public raise history.");
      const seat = seats.indexOf(a.seat);
      (raises === 0
        ? opens[seat]
        : raises === 1
          ? mults[seat]
          : four[seat]
      ).push(raises === 0 ? a.amount / 10 : a.amount / bet);
      bet = a.amount;
      raises++;
    }
  if (raises >= 4)
    throw new Error(
      "This bounded chart does not cover a fifth raise level. The live bot-model comparison remains available.",
    );
  return {
    config: {
      positions: seats.map((seat) => positionName(seat, s.dealer, n)),
      stack: starting[0] / 10,
      posts,
      ante: 0,
      limp: true,
      open_raises: [2.5],
      raise_mults: [3],
      fourbet_mults: [2.3],
      max_raises: Math.max(3, raises + 1),
      add_allin: false,
      allin_threshold: 1,
      rake_pct: 0,
      rake_cap: 0,
      no_flop_no_drop: true,
      realization: "balanced",
      open_raises_by_seat: opens.map((a) =>
        a.length ? [...new Set([2.5, ...a])] : [],
      ),
      raise_mults_by_seat: mults.map((a) =>
        a.length ? [...new Set([3, ...a])] : [],
      ),
      fourbet_mults_by_seat: four.map((a) =>
        a.length ? [...new Set([2.3, ...a])] : [],
      ),
    },
    seats,
    history,
    hero: seats.indexOf(0),
    publicState: s,
  };
}
export const nodeSchema = z.object({
  kind: z.string(),
  actor: z.number().int().nullable(),
  pot: z.number().finite(),
  invested: z.array(z.number().finite()),
  live: z.array(z.boolean()),
  actions: z.array(
    z.object({
      kind: z.string(),
      to: z.number().finite(),
      label: z.string(),
      freq: z.number().finite(),
    }),
  ),
  strategy: z.array(z.number().finite()).optional(),
  reach: z.array(z.number().finite()).optional(),
  strategy_note: z.string().nullable(),
  low_reach: z.boolean(),
  publication: z.object({
    published_iteration: z.number().int(),
    accuracy_iteration: z.number().int().nullable(),
    gap_total: z.number().finite(),
    target_gap: z.number().nullable(),
    converged: z.boolean(),
    multiway_model: z.string(),
  }),
});
export type SolverNode = z.infer<typeof nodeSchema>;
export function actionIndex(
  node: SolverNode,
  action: { action: string; amount?: number },
  currentBet: number,
) {
  const i = node.actions.findIndex((a) =>
    action.action === "raise"
      ? (a.kind === "raise" || a.kind === "jam") &&
        Math.abs(a.to * 10 - action.amount!) < 1e-6
      : a.kind === action.action &&
        (action.action !== "call" || Math.abs(a.to * 10 - currentBet) < 1e-6),
  );
  if (i < 0)
    throw new Error(
      "The exact public action is missing from this solver's size menu. No substitute chart was used.",
    );
  return i;
}
export function chartFromNode(
  spot: ReturnType<typeof solverSpot>,
  raw: unknown,
  path: number[],
  revision: number,
): SolverChart {
  const node = nodeSchema.parse(raw),
    s = spot.publicState,
    legal = legalActions(s)!;
  if (node.kind !== "action" || node.actor !== spot.hero)
    throw new Error("Solver actor does not match your current turn.");
  if (
    Math.abs(node.pot * 10 - s.players.reduce((n, p) => n + p.contributed, 0)) >
      1e-5 ||
    spot.seats.some(
      (seat, i) =>
        Math.abs(node.invested[i] * 10 - s.players[seat].contributed) > 1e-5 ||
        node.live[i] === s.players[seat].folded,
    )
  )
    throw new Error(
      "Solver pot, contributions or active seats do not match the live hand.",
    );
  if (node.strategy_note || node.low_reach || !node.strategy || !node.reach)
    throw new Error(
      node.strategy_note ??
        "This betting sequence has too little modeled reach for a reliable chart.",
    );
  if (
    node.publication.published_iteration < 2 ||
    node.strategy.length !== node.actions.length * 169 ||
    node.reach.length !== 169
  )
    throw new Error("The solver has not published a valid learned chart.");
  const actions = node.actions.map((a) => {
    if (
      (a.kind === "raise" || a.kind === "jam") &&
      (!legal.canRaise ||
        a.to * 10 < legal.minRaiseTo - 1e-6 ||
        a.to * 10 > legal.maxRaiseTo + 1e-6)
    )
      throw new Error("Solver offered an illegal live raise.");
    if (a.kind === "check" && !legal.canCheck)
      throw new Error("Solver offered an illegal check.");
    return {
      kind: a.kind === "jam" ? "raise" : a.kind,
      label:
        a.kind === "raise" || a.kind === "jam"
          ? `Raise to ${Math.round(a.to * 10)}`
          : a.kind === "call"
            ? `Call ${legal.toCall}`
            : a.label,
      ...(a.kind === "raise" || a.kind === "jam"
        ? { amount: Math.round(a.to * 10) }
        : {}),
    };
  });
  const ranks = "23456789TJQKA",
    cells = [];
  for (let r = 12; r >= 0; r--)
    for (let c = 12; c >= 0; c--) {
      const hi = Math.max(r, c),
        lo = Math.min(r, c),
        suited = r > c,
        index = r === c ? r * 14 : suited ? hi * 13 + lo : lo * 13 + hi;
      const frequencies = actions.map(
          (_, i) => node.strategy![i * 169 + index] * 100,
        ),
        sum = frequencies.reduce((a, b) => a + b, 0);
      if (
        frequencies.some((v) => v < -1e-5 || v > 100.001) ||
        Math.abs(sum - 100) > 0.1
      )
        throw new Error("Solver frequencies are invalid.");
      cells.push({
        hand:
          r === c
            ? ranks[r] + ranks[c]
            : ranks[hi] + ranks[lo] + (suited ? "s" : "o"),
        frequencies,
        reach: node.reach[index],
      });
    }
  return {
    status: "ready",
    message: node.publication.converged
      ? "Solved within this bounded preflop model."
      : "Preliminary chart: the solve did not reach its convergence target.",
    revision,
    source: "GTOpen",
    engineRevision: GTOPEN_REVISION,
    iteration: node.publication.published_iteration,
    gap: node.publication.gap_total,
    targetGap: node.publication.target_gap ?? undefined,
    converged: node.publication.converged,
    positions: spot.config.positions,
    path,
    actions,
    cells,
    limitations: [
      "Adaptive solver opponents, not the named practice bots. Frequencies can mix actions; the most-used action is not a guaranteed best move.",
      `No rake, equal ${spot.config.stack} BB starting stacks; ${spot.config.max_raises} raise levels maximum. Discrete raises only; jams are offered only when a configured size reaches the stack.`,
      "Balanced heads-up and coupled-deck multiway continuation approximations; future postflop betting is not solved. Opponent card removal is approximate.",
      "Whole starting-hand classes are solved. Exact public actions, active seats, pot and contributions are checked; no hidden cards or future board are used.",
    ],
  };
}
