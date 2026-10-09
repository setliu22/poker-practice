import { best, compare, deal, random, ranks } from "./index";
import {
  contextualDistribution,
  personalities,
  publicProfile,
  type BotObservation,
  type PublicAction,
  type PublicRead,
} from "./bot-policy";
export type { BotObservation } from "./bot-policy";
import type {
  TableAction,
  TableView,
  DecisionReview,
} from "../../shared/src/table";
export type Seat = {
  seat: number;
  name: string;
  style: string;
  botId?: string;
  stack: number;
  streetBet: number;
  contributed: number;
  folded: boolean;
  allIn: boolean;
  hole: string[];
  payout: number;
};
export type PolicyEvent = {
  seat: number;
  observation: Omit<BotObservation, "hole">;
  action: TableAction;
  amount?: number;
};
export type DecisionFrame = {
  id: number;
  street: string;
  board: string[];
  players: Seat[];
  dealer: number;
  currentBet: number;
  minRaise: number;
  pending: number[];
  lastActBet: (number | null)[];
  action: TableAction;
  amount?: number;
  eventCount: number;
  policyVersion?: number;
  actions?: PublicAction[];
  reads?: PublicRead[];
};
export type TableState = {
  id: string;
  revision: number;
  seed: number;
  handNumber: number;
  dealer: number;
  street: string;
  board: string[];
  runout: string[];
  players: Seat[];
  currentBet: number;
  minRaise: number;
  actor: number | null;
  pending: number[];
  lastActBet: (number | null)[];
  complete: boolean;
  history: TableView["history"];
  review: TableView["review"];
  analysisVersion?: number;
  decisions?: DecisionFrame[];
  policyEvents?: PolicyEvent[];
  rounds?: DecisionReview[];
  analysisDisabled?: boolean;
  policyVersion?: number;
  actions?: PublicAction[];
  reads?: PublicRead[];
  startingReads?: PublicRead[];
};
const streets = ["preflop", "flop", "turn", "river"];
const active = (s: TableState) => s.players.filter((p) => !p.folded);
const canAct = (p: Seat) => !p.folded && p.stack > 0;
const pot = (s: TableState) =>
  s.players.reduce((sum, p) => sum + p.contributed, 0);
function note(s: TableState, seat: number | null, text: string) {
  if (s.analysisDisabled) return;
  s.history.push({ street: s.street, seat, text });
}
function pay(p: Seat, amount: number) {
  const paid = Math.min(p.stack, amount);
  p.stack -= paid;
  p.streetBet += paid;
  p.contributed += paid;
  p.allIn = p.stack === 0;
  return paid;
}
function nextSeat(s: TableState, after: number, candidates: number[]) {
  for (let i = 1; i <= s.players.length; i++) {
    const n = (after + i) % s.players.length;
    if (candidates.includes(n)) return n;
  }
  throw new Error("No next player.");
}
export function createTable(
  id: string,
  count: number,
  seed: number,
  dealer = 0,
  handNumber = 1,
  revision = 0,
  policyVersion = 2,
  reads: PublicRead[] = [],
): TableState {
  if (!Number.isInteger(count) || count < 2 || count > 9)
    throw new Error("Choose 2 to 9 players, including you.");
  const cards = deal(seed, count * 2 + 5);
  const s: TableState = {
    id,
    revision,
    policyVersion,
    actions: [],
    reads: structuredClone(reads),
    startingReads: structuredClone(reads),
    seed,
    handNumber,
    dealer: dealer % count,
    street: "preflop",
    board: [],
    runout: cards.slice(count * 2),
    players: Array.from({ length: count }, (_, seat) => ({
      seat,
      name:
        seat === 0
          ? "You"
          : policyVersion === 2
            ? personalities[seat - 1].name
            : `Bot ${seat}`,
      botId:
        seat && policyVersion === 2 ? personalities[seat - 1].id : undefined,
      style:
        seat === 0
          ? "Human"
          : policyVersion === 2
            ? personalities[seat - 1].style
            : ["Tight", "Loose", "Aggressive"][(seat - 1) % 3],
      stack: 1000,
      streetBet: 0,
      contributed: 0,
      folded: false,
      allIn: false,
      hole: cards.slice(seat * 2, seat * 2 + 2),
      payout: 0,
    })),
    currentBet: 10,
    minRaise: 10,
    actor: null,
    pending: Array.from({ length: count }, (_, i) => i),
    lastActBet: Array(count).fill(null),
    complete: false,
    history: [],
    review: [],
    analysisVersion: 1,
    decisions: [],
    policyEvents: [],
    rounds: [],
  };
  const sb = count === 2 ? s.dealer : (s.dealer + 1) % count,
    bb = (sb + 1) % count;
  pay(s.players[sb], 5);
  pay(s.players[bb], 10);
  note(s, sb, "Posts small blind 5");
  note(s, bb, "Posts big blind 10");
  s.actor = nextSeat(s, bb, s.pending);
  return s;
}
export function legalActions(
  s: TableState,
  seat = s.actor!,
): TableView["legal"] {
  if (s.complete || s.actor !== seat || !canAct(s.players[seat])) return null;
  const p = s.players[seat],
    toCall = Math.min(p.stack, Math.max(0, s.currentBet - p.streetBet));
  const mayReopen =
    s.lastActBet[seat] === null ||
    s.currentBet - (s.lastActBet[seat] as number) >= s.minRaise;
  return {
    toCall,
    canCheck: toCall === 0,
    canRaise:
      mayReopen &&
      p.stack > toCall &&
      s.players.some((q) => q.seat !== seat && canAct(q)),
    minRaiseTo: Math.min(p.streetBet + p.stack, s.currentBet + s.minRaise),
    maxRaiseTo: p.streetBet + p.stack,
  };
}
export function settle(s: TableState) {
  const live = active(s);
  const total = pot(s);
  s.pending = [];
  s.actor = null;
  s.complete = true;
  if (live.length === 1) {
    live[0].payout = total;
    live[0].stack += total;
    note(s, live[0].seat, `Wins ${total}; everyone else folded`);
  } else {
    const levels = [
      ...new Set(s.players.map((p) => p.contributed).filter(Boolean)),
    ].sort((a, b) => a - b);
    let previous = 0;
    for (const level of levels) {
      const contributors = s.players.filter((p) => p.contributed >= level),
        amount = (level - previous) * contributors.length;
      previous = level;
      const eligible = contributors.filter((p) => !p.folded);
      if (!eligible.length) throw new Error("Pot has no eligible player.");
      const scored = eligible.map((p) => ({
        p,
        hand: best([...p.hole, ...s.board]),
      }));
      scored.sort((a, b) => compare(b.hand, a.hand));
      const winners = scored
        .filter((x) => compare(x.hand, scored[0].hand) === 0)
        .map((x) => x.p);
      const base = Math.floor(amount / winners.length);
      let remainder = amount % winners.length;
      // Odd chips go clockwise from the dealer, as in a live table.
      winners.sort(
        (a, b) =>
          ((a.seat - s.dealer - 1 + s.players.length) % s.players.length) -
          ((b.seat - s.dealer - 1 + s.players.length) % s.players.length),
      );
      for (const winner of winners) {
        const payout = base + (remainder-- > 0 ? 1 : 0);
        winner.payout += payout;
        winner.stack += payout;
      }
      note(
        s,
        null,
        `${contributors.length === 1 ? "Uncalled chips returned" : level === levels[0] ? "Main pot" : "Side pot"} ${amount}: ${winners.map((p) => p.name).join(", ")}`,
      );
    }
    if (!s.analysisDisabled)
      for (const p of live)
        note(
          s,
          p.seat,
          `${best([...p.hole, ...s.board]).name}; receives ${p.payout}`,
        );
  }
  if (!s.analysisDisabled) {
    const hero = s.players[0],
      net = hero.stack - 1000;
    s.review = [
      {
        kind: "exact",
        title: `Hand ${s.handNumber}: ${net >= 0 ? "+" : ""}${net} chips`,
        text: `You contributed ${hero.contributed} and received ${hero.payout}. Final stack: ${hero.stack}. ${live.length === 1 ? "The hand ended by folds." : "Pots were awarded by best five-card hand, with separate eligibility for each side pot."}`,
      },
    ];
  }
  if (
    s.players.reduce((sum, p) => sum + p.stack, 0) !==
    s.players.length * 1000
  )
    throw new Error("Chip conservation failed.");
}
function advance(s: TableState, after: number) {
  if (active(s).length === 1) {
    settle(s);
    return;
  }
  s.pending = s.pending.filter((i) => canAct(s.players[i]));
  const movable = active(s).filter(canAct);
  if (movable.length <= 1 && movable.every((p) => p.streetBet >= s.currentBet))
    s.pending = [];
  if (s.pending.length) {
    s.actor = nextSeat(s, after, s.pending);
    return;
  }
  if (s.street === "river") {
    settle(s);
    return;
  }
  s.street = streets[streets.indexOf(s.street) + 1];
  s.board = s.runout.slice(
    0,
    s.street === "flop" ? 3 : s.street === "turn" ? 4 : 5,
  );
  s.currentBet = 0;
  s.minRaise = 10;
  s.lastActBet = s.players.map(() => null);
  s.players.forEach((p) => (p.streetBet = 0));
  s.pending = s.players.filter(canAct).map((p) => p.seat);
  note(s, null, `${s.street[0].toUpperCase() + s.street.slice(1)} dealt`);
  if (movable.length <= 1) {
    s.pending = [];
    advance(s, s.dealer);
  } else s.actor = nextSeat(s, s.dealer, s.pending);
}
export function act(
  s: TableState,
  seat: number,
  action: TableAction,
  amount?: number,
) {
  const legal = legalActions(s, seat);
  if (!legal) throw new Error("It is not this player’s turn.");
  const p = s.players[seat];
  if (action === "check" && !legal.canCheck)
    throw new Error("You must call, raise, or fold.");
  if (action === "call" && !legal.toCall)
    throw new Error("No bet to call; check instead.");
  if (
    action === "raise" &&
    (!legal.canRaise ||
      !Number.isInteger(amount) ||
      amount! < legal.minRaiseTo ||
      amount! > legal.maxRaiseTo ||
      amount! <= s.currentBet)
  )
    throw new Error(
      `Raise to a total between ${legal.minRaiseTo} and ${legal.maxRaiseTo} this street.`,
    );
  if (!s.analysisDisabled) {
    if (seat === 0) {
      s.decisions ??= [];
      s.decisions.push({
        id: s.decisions.length,
        street: s.street,
        board: [...s.board],
        players: s.players.map((q) => ({ ...q, hole: [...q.hole] })),
        dealer: s.dealer,
        currentBet: s.currentBet,
        minRaise: s.minRaise,
        pending: [...s.pending],
        lastActBet: [...s.lastActBet],
        action,
        amount,
        eventCount: s.policyEvents?.length ?? 0,
        policyVersion: s.policyVersion,
        actions: structuredClone(s.actions ?? []),
        reads: structuredClone(s.reads ?? []),
      });
    } else {
      s.policyEvents ??= [];
      s.policyEvents.push({
        seat,
        action,
        amount,
        observation: (() => {
          const { hole, ...observation } = botObservation(s, seat);
          return observation;
        })(),
      });
    }
  }

  s.actions ??= [];
  s.actions.push({ seat, street: s.street, action, amount });
  s.reads ??= [];
  let read = s.reads.find((r) => r.seat === seat);
  if (!read) {
    read = { seat, decisions: 0, facing: 0, folds: 0, calls: 0, raises: 0 };
    s.reads.push(read);
  }
  read.decisions++;
  if (legal.toCall) {
    read.facing++;
    if (action === "fold") read.folds++;
    if (action === "call") read.calls++;
  }
  if (action === "raise") read.raises++;

  if (action === "fold") {
    p.folded = true;
    note(s, seat, "Folds");
  } else if (action === "check") {
    if (!legal.canCheck) throw new Error("You must call, raise, or fold.");
    note(s, seat, "Checks");
  } else if (action === "call") {
    if (!legal.toCall) throw new Error("No bet to call; check instead.");
    pay(p, legal.toCall);
    note(s, seat, `Calls ${legal.toCall}${p.allIn ? " (all-in)" : ""}`);
  } else if (action === "raise") {
    if (
      !legal.canRaise ||
      !Number.isInteger(amount) ||
      (amount as number) < legal.minRaiseTo ||
      (amount as number) > legal.maxRaiseTo ||
      (amount as number) <= s.currentBet
    )
      throw new Error(
        `Raise to a total between ${legal.minRaiseTo} and ${legal.maxRaiseTo} this street.`,
      );
    const increment = (amount as number) - s.currentBet;
    pay(p, (amount as number) - p.streetBet);
    if (increment >= s.minRaise) s.minRaise = increment;
    s.currentBet = amount as number;
    s.pending = s.players
      .filter(
        (q) =>
          q.seat !== seat &&
          canAct(q) &&
          (s.pending.includes(q.seat) || q.streetBet < s.currentBet),
      )
      .map((q) => q.seat);
    note(
      s,
      seat,
      `${(amount as number) === increment ? "Bets" : "Raises to"} ${amount}${p.allIn ? " (all-in)" : ""}`,
    );
  } else throw new Error("Unknown action.");
  s.lastActBet[seat] = s.currentBet;
  s.pending = s.pending.filter((i) => i !== seat);
  advance(s, seat);
}
// The policy accepts an observation, never the deck, future board, or another player's cards.
export function botDistribution(
  o: BotObservation,
): { action: TableAction; amount?: number; probability: number }[] {
  if (o.policyVersion === 2) return contextualDistribution(o);
  const values = o.hole.map((c) => ranks.indexOf(c[0]) + 2);
  let strength: number;
  if (!o.board.length) {
    strength = (Math.max(...values) + Math.min(...values)) / 32;
    if (values[0] === values[1]) strength += 0.22;
    if (o.hole[0][1] === o.hole[1][1]) strength += 0.06;
    if (Math.abs(values[0] - values[1]) === 1) strength += 0.03;
  } else {
    const h = best([...o.hole, ...o.board]);
    strength =
      [0.15, 0.43, 0.64, 0.77, 0.86, 0.91, 0.96, 0.99, 1][h.category] +
      (h.kickers[0] / 14) * 0.07;
  }
  strength -= Math.max(0, o.playersLeft - 2) * 0.025;
  const loose = o.style === "Loose",
    aggressive = o.style === "Aggressive";
  const threshold = loose ? 0.27 : aggressive ? 0.38 : 0.46;
  const price = o.legal.toCall / (o.pot + o.legal.toCall || 1);
  const raiseProbability = o.legal.canRaise
    ? 0.65 *
      (strength > (aggressive ? 0.67 : 0.76)
        ? 1
        : aggressive
          ? 0.14
          : loose
            ? 0.04
            : 0.02)
    : 0;
  const amount = Math.min(
    o.legal.maxRaiseTo,
    Math.max(
      o.legal.minRaiseTo,
      o.currentBet +
        Math.max(10, Math.round(o.pot * (aggressive ? 0.7 : 0.45))),
    ),
  );
  const rest = 1 - raiseProbability;
  const callProbability =
    strength >= threshold + price * 0.5 ? 1 : loose ? 0.2 : 0;
  return [
    { action: "raise" as const, amount, probability: raiseProbability },
    ...(!o.legal.toCall
      ? [{ action: "check" as const, probability: rest }]
      : [
          { action: "call" as const, probability: rest * callProbability },
          {
            action: "fold" as const,
            probability: rest * (1 - callProbability),
          },
        ]),
  ].filter((r) => r.probability > 0);
}
export function botAction(
  o: BotObservation,
  seed: number,
): { action: TableAction; amount?: number } {
  const roll = random(seed)();
  let cumulative = 0;
  const choices = botDistribution(o);
  for (const choice of choices) {
    cumulative += choice.probability;
    if (roll < cumulative)
      return { action: choice.action, amount: choice.amount };
  }
  const choice = choices[choices.length - 1];
  return { action: choice.action, amount: choice.amount };
}
// This is the only observation boundary: no other hole cards or future board leave it.
export function botObservation(s: TableState, seat = s.actor!): BotObservation {
  const p = s.players[seat];
  return {
    hole: [...p.hole],
    board: [...s.board],
    style: p.style,
    pot: pot(s),
    currentBet: s.currentBet,
    streetBet: p.streetBet,
    playersLeft: active(s).length,
    legal: { ...legalActions(s, seat)! },
    policyVersion: s.policyVersion ?? 1,
    botId: p.botId,
    seat,
    dealer: s.dealer,
    tableSize: s.players.length,
    activeSeats: active(s).map((p) => p.seat),
    stack: p.stack,
    effectiveStack: Math.min(
      p.stack,
      Math.max(
        0,
        ...active(s)
          .filter((q) => q.seat !== seat)
          .map((q) => q.stack),
      ),
    ),
    history: structuredClone(s.actions ?? []),
    reads: structuredClone(s.reads ?? []),
  };
}
export function runBots(s: TableState) {
  let safety = 0;
  while (!s.complete && s.actor !== 0) {
    if (++safety > 500) throw new Error("Hand exceeded action limit.");
    const p = s.players[s.actor!];
    const decision = botAction(
      botObservation(s),
      s.seed + s.history.length * 7919 + p.seat,
    );
    act(s, p.seat, decision.action, decision.amount);
  }
  return s;
}
export function tableView(s: TableState): TableView {
  return {
    id: s.id,
    revision: s.revision,
    handNumber: s.handNumber,
    dealer: s.dealer,
    street: s.street,
    board: s.board,
    pot: pot(s),
    currentBet: s.currentBet,
    actor: s.actor,
    complete: s.complete,
    players: s.players.map((p) => ({
      ...p,
      profile: publicProfile(p.botId),
      hole: p.seat === 0 || s.complete ? p.hole : undefined,
      bestFive:
        s.complete && !p.folded && s.board.length === 5
          ? best([...p.hole, ...s.board]).cards
          : undefined,
      handName:
        s.complete && !p.folded && s.board.length === 5
          ? best([...p.hole, ...s.board]).name
          : undefined,
    })),
    legal: legalActions(s),
    history: s.history,
    review: s.complete ? s.review : [],
    rounds: (s.rounds ?? []).map((r) =>
      s.complete
        ? r
        : { ...r, actualProbability: undefined, actualCards: undefined },
    ),
  };
}
