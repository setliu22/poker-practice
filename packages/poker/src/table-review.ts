import { best, compare, deck, random } from "./index";
import {
  act,
  botAction,
  botObservation,
  botDistribution,
  createTable,
  legalActions,
  type DecisionFrame,
  type TableState,
} from "./table";
import type { DecisionReview, ProbabilityReview } from "../../shared/src/table";
type Combo = { cards: string[]; weight: number };
const totalPot = (f: DecisionFrame) =>
  f.players.reduce((n, p) => n + p.contributed, 0);
function hash(s: string) {
  let n = 2166136261;
  for (const c of s) n = Math.imul(n ^ c.charCodeAt(0), 16777619);
  return n >>> 0;
}
export function inferredRange(
  state: TableState,
  f: DecisionFrame,
  seat: number,
): Combo[] {
  const available = deck.filter(
    (c) => !f.board.includes(c) && !f.players[0].hole.includes(c),
  );
  const events = (state.policyEvents ?? [])
    .slice(0, f.eventCount)
    .filter((e) => e.seat === seat);
  const result: Combo[] = [];
  for (let a = 0; a < available.length; a++)
    for (let b = a + 1; b < available.length; b++) {
      const cards = [available[a], available[b]];
      let weight = 1;
      for (const e of events) {
        weight *=
          botDistribution({ ...e.observation, hole: cards }).find(
            (v) =>
              v.action === e.action &&
              (e.action !== "raise" || v.amount === e.amount),
          )?.probability ?? 0;
        if (!weight) break;
      }
      if (weight) result.push({ cards, weight });
    }
  const sum = result.reduce((n, c) => n + c.weight, 0);
  if (!sum)
    throw new Error("No legal combinations match the observed bot actions.");
  return result.map((c) => ({ ...c, weight: c.weight / sum }));
}
function shuffle<T>(items: T[], rng: () => number) {
  const a = [...items];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}
function sampleHoles(
  f: DecisionFrame,
  ranges: Map<number, Combo[]>,
  rng: () => number,
) {
  const holes = new Map<number, string[]>([[0, f.players[0].hole]]);
  const used = new Set([...f.board, ...f.players[0].hole]);
  for (const seat of shuffle([...ranges.keys()], rng)) {
    const legal = ranges
      .get(seat)!
      .filter((c) => c.cards.every((x) => !used.has(x)));
    const sum = legal.reduce((n, c) => n + c.weight, 0);
    if (!sum) return null;
    let roll = rng() * sum;
    let selected = legal[legal.length - 1];
    for (const c of legal) {
      roll -= c.weight;
      if (roll <= 0) {
        selected = c;
        break;
      }
    }
    holes.set(seat, selected.cards);
    selected.cards.forEach((c) => used.add(c));
  }
  // Folded cards are unknown in range analysis. Draw them without consulting the real deal.
  for (const p of f.players)
    if (!holes.has(p.seat)) {
      const cards = shuffle(
        deck.filter((c) => !used.has(c)),
        rng,
      ).slice(0, 2);
      holes.set(p.seat, cards);
      cards.forEach((c) => used.add(c));
    }
  return holes;
}
function outcome(hero: string[], opponents: string[][], board: string[]) {
  const h = best([...hero, ...board]);
  let ties = 1;
  for (const cards of opponents) {
    const d = compare(h, best([...cards, ...board]));
    if (d < 0) return { win: 0, tie: 0, lose: 1, share: 0 };
    if (!d) ties++;
  }
  return {
    win: ties === 1 ? 1 : 0,
    tie: ties > 1 ? 1 : 0,
    lose: 0,
    share: 1 / ties,
  };
}
export function probability(
  f: DecisionFrame,
  ranges: Map<number, Combo[]>,
  seed: number,
  actual = false,
): ProbabilityReview {
  const rng = random(seed),
    sums = { win: 0, tie: 0, lose: 0, share: 0 };
  let count = 0;
  const seats = f.players
    .filter((p) => p.seat !== 0 && !p.folded)
    .map((p) => p.seat);
  const add = (holes: Map<number, string[]>, board: string[], weight = 1) => {
    const o = outcome(
      f.players[0].hole,
      seats.map((s) => holes.get(s)!),
      board,
    );
    for (const k of ["win", "tie", "lose", "share"] as const)
      sums[k] += o[k] * weight;
    count += weight;
  };
  let exact = false;
  if (actual && f.board.length >= 4) {
    const holes = new Map(f.players.map((p) => [p.seat, p.hole]));
    const remaining = deck.filter(
      (c) => !f.board.includes(c) && !f.players.some((p) => p.hole.includes(c)),
    );
    if (f.board.length === 5) add(holes, f.board);
    else for (const card of remaining) add(holes, [...f.board, card]);
    exact = true;
  } else if (!actual && f.board.length === 5 && seats.length === 1) {
    for (const c of ranges.get(seats[0])!)
      add(
        new Map([
          [0, f.players[0].hole],
          [seats[0], c.cards],
        ]),
        f.board,
        c.weight,
      );
    exact = true;
  } else {
    for (let i = 0; i < 400; i++) {
      const holes = actual
        ? new Map(f.players.map((p) => [p.seat, p.hole]))
        : sampleHoles(f, ranges, rng);
      if (!holes) continue;
      const used = [...f.board, ...[...holes.values()].flat()];
      const board = [
        ...f.board,
        ...shuffle(
          deck.filter((c) => !used.includes(c)),
          rng,
        ).slice(0, 5 - f.board.length),
      ];
      add(holes, board);
    }
  }
  if (!count) throw new Error("Unable to sample legal opponent hands.");
  return {
    ...(Object.fromEntries(
      Object.entries(sums).map(([k, v]) => [k, (100 * v) / count]),
    ) as typeof sums),
    exact,
    samples: exact ? 0 : count,
    note: exact
      ? "Enumerated every legal outcome."
      : `Estimate from ${count} simulated deals; small differences can be sampling noise.`,
  };
}
function valueModel(
  f: DecisionFrame,
  ranges: Map<number, Combo[]>,
  seed: number,
) {
  const call = Math.min(
    f.players[0].stack,
    Math.max(0, f.currentBet - f.players[0].streetBet),
  );
  const probe: TableState = {
    id: "model",
    revision: 0,
    seed,
    policyVersion: f.policyVersion ?? 1,
    actions: structuredClone(f.actions ?? []),
    reads: structuredClone(f.reads ?? []),
    handNumber: 1,
    dealer: f.dealer,
    street: f.street,
    board: f.board,
    runout: [],
    players: structuredClone(f.players),
    currentBet: f.currentBet,
    minRaise: f.minRaise,
    actor: 0,
    pending: f.pending,
    lastActBet: f.lastActBet,
    complete: false,
    history: [],
    review: [],
    analysisDisabled: true,
  };
  const legal = legalActions(probe)!;
  const choices: {
    key: string;
    label: string;
    action: "check" | "call" | "fold" | "raise";
    amount?: number;
  }[] = [
    { key: "fold", label: "Fold", action: "fold" },
    {
      key: call ? "call" : "check",
      label: call ? `Call ${call}` : "Check",
      action: call ? "call" : "check",
    },
  ];
  if (legal.canRaise) {
    const amount =
      f.action === "raise"
        ? f.amount!
        : Math.min(
            legal.maxRaiseTo,
            Math.max(
              legal.minRaiseTo,
              f.currentBet + Math.round(totalPot(f) / 2),
            ),
          );
    choices.push({
      key: "raise",
      label: `${f.currentBet ? "Raise to" : "Bet"} ${amount}`,
      action: "raise",
      amount,
    });
  }
  return choices.map((choice) => {
    if (choice.action === "fold")
      return {
        key: choice.key,
        label: choice.label,
        chips: 0,
        margin: 0,
        exact: true,
        samples: 0,
        allFold: 0,
      };
    const rng = random(seed);
    let sum = 0,
      squares = 0,
      allFold = 0,
      n = 0;
    for (let i = 0; i < 240; i++) {
      const holes = sampleHoles(f, ranges, rng);
      if (!holes) continue;
      const used = [...f.board, ...[...holes.values()].flat()];
      const runout = [
        ...f.board,
        ...shuffle(
          deck.filter((c) => !used.includes(c)),
          rng,
        ).slice(0, 5 - f.board.length),
      ];
      const s: TableState = {
        ...probe,
        actions: structuredClone(f.actions ?? []),
        reads: structuredClone(f.reads ?? []),
        board: [...f.board],
        runout,
        players: f.players.map((p) => ({
          ...p,
          hole: holes.get(p.seat)!,
          payout: 0,
        })),
        pending: [...f.pending],
        lastActBet: [...f.lastActBet],
      };
      act(s, 0, choice.action, choice.amount);
      let safety = 0;
      while (!s.complete && safety++ < 200) {
        const seat = s.actor!,
          l = legalActions(s)!;
        let a: { action: "call" | "check" | "raise" | "fold"; amount?: number };
        if (s.street !== f.street || seat === 0)
          a = { action: l.toCall ? "call" : "check" };
        else {
          a = botAction(botObservation(s), Math.floor(rng() * 4294967295));
        }
        act(s, seat, a.action, a.amount);
      }
      if (!s.complete) throw new Error("Decision model did not finish.");
      const net = s.players[0].stack - f.players[0].stack;
      sum += net;
      squares += net * net;
      n++;
      if (s.players.every((p) => p.seat === 0 || p.folded)) allFold++;
    }
    const mean = sum / n;
    return {
      key: choice.key,
      label: choice.label,
      chips: mean,
      margin: 1.96 * Math.sqrt(Math.max(0, squares / n - mean * mean) / n),
      exact: false,
      samples: n,
      allFold: (100 * allFold) / n,
    };
  });
}
function review(state: TableState, f: DecisionFrame): DecisionReview {
  const ranges = new Map(
    f.players
      .filter((p) => p.seat !== 0 && !p.folded)
      .map((p) => [p.seat, inferredRange(state, f, p.seat)]),
  );
  const seed = hash(`${state.id}/${state.handNumber}/${f.id}`),
    pot = totalPot(f),
    hero = f.players[0];
  const call = Math.min(hero.stack, Math.max(0, f.currentBet - hero.streetBet)),
    risk = f.action === "raise" ? f.amount! - hero.streetBet : 0;
  const values = valueModel(f, ranges, seed),
    chosen = values.find((v) => v.key === f.action)!;
  const rangeProbability = probability(f, ranges, seed + 1);
  // A closing heads-up river call/check needs no response model or simulation.
  if (
    f.board.length === 5 &&
    ranges.size === 1 &&
    f.pending.length === 1 &&
    f.players.every((p) => p.contributed <= hero.contributed + call)
  ) {
    const closing = values.find((v) => v.key === (call ? "call" : "check"))!;
    closing.chips = (rangeProbability.share / 100) * (pot + call) - call;
    closing.margin = 0;
    closing.exact = true;
    closing.samples = 0;
  }

  const top = values.reduce((a, b) => (a.chips > b.chips ? a : b));
  const clear = top.chips - chosen.chips > top.margin + chosen.margin;
  const groups = (cards: string[]) =>
    f.board.length >= 3
      ? best([...cards, ...f.board]).name
      : cards[0][0] === cards[1][0]
        ? "Pocket pair"
        : cards[0][1] === cards[1][1]
          ? "Suited"
          : "Offsuit";
  return {
    id: f.id,
    street: f.street,
    board: f.board,
    hero: hero.hole,
    hand:
      f.board.length >= 3
        ? best([...hero.hole, ...f.board]).name
        : "Two hole cards",
    action:
      f.action === "raise"
        ? `${f.currentBet ? "Raised to" : "Bet"} ${f.amount}`
        : f.action === "call"
          ? `Called ${call}`
          : f.action === "check"
            ? "Checked"
            : "Folded",
    pot,
    call,
    callThreshold: call ? (100 * call) / (pot + call) : null,
    risk,
    bluffThreshold: risk ? (100 * risk) / (pot + risk) : null,
    opponents: [...ranges].map(([seat, combos]) => {
      const weights = new Map<string, number>();
      for (const c of combos) {
        const name = groups(c.cards);
        weights.set(name, (weights.get(name) ?? 0) + c.weight * 100);
      }
      return {
        seat,
        name: f.players[seat].name,
        style: f.players[seat].style,
        combinations: combos.length,
        examples: [...combos]
          .sort((a, b) => b.weight - a.weight)
          .slice(0, 4)
          .map((c) => ({ cards: c.cards, weight: c.weight * 100 })),
        groups: [...weights]
          .map(([name, percent]) => ({ name, percent }))
          .sort((a, b) => b.percent - a.percent),
      };
    }),
    rangeProbability,
    values,
    chosenKey: f.action,
    verdict: clear
      ? `${top.label} earned more in this model`
      : "No clear evidence your action was worse in this model",
    explanation: clear
      ? `Your action averaged ${chosen.chips.toFixed(1)} chips from this decision; ${top.label.toLowerCase()} averaged ${top.chips.toFixed(1)}. This comparison depends on the assumptions below.`
      : `Your action averaged ${chosen.chips.toFixed(1)} chips from this decision. The simulation does not establish that another option is better after allowing for sampling uncertainty.`,
    model:
      "One-round model: bots respond using their rules for the rest of this betting round; you call any further raises. Later streets are checked through. Net chips exclude money already in the pot. This is a teaching model, not an optimal-play recommendation.",
    rangeNote:
      "Ranges start with equally likely legal hands, then weight each hand by how often this bot would have taken its earlier actions. Only information available at your decision is used. Multiway sampling draws ranges in random order and removes collisions; it approximates the joint range. Folded cards are unknown.",
  };
}
// Older saved hands can be reconstructed from their own recorded actions, without guessing.
export function recoverFrames(s: TableState) {
  if (s.analysisVersion === 1) return;
  const replay = createTable(
    s.id,
    s.players.length,
    s.seed,
    s.dealer,
    s.handNumber,
    s.revision,
    s.policyVersion ?? 1,
    s.startingReads ?? [],
  );
  try {
    for (const e of s.history) {
      if (e.seat === null) continue;
      const raise = e.text.match(/^(?:Bets|Raises to) (\d+)/);
      const action = raise
        ? "raise"
        : e.text === "Folds"
          ? "fold"
          : e.text === "Checks"
            ? "check"
            : e.text.startsWith("Calls ")
              ? "call"
              : null;
      if (action)
        act(replay, e.seat, action, raise ? Number(raise[1]) : undefined);
    }
    if (
      JSON.stringify(
        replay.players.map((p) => [p.stack, p.folded, p.contributed]),
      ) ===
        JSON.stringify(
          s.players.map((p) => [p.stack, p.folded, p.contributed]),
        ) &&
      replay.board.join() === s.board.join()
    ) {
      s.decisions = replay.decisions;
      s.policyEvents = replay.policyEvents;
      s.actions = replay.actions;
      s.reads = replay.reads;
    }
  } catch {
    /* Old hands that cannot be replayed retain their recorded results. */
  }
  s.analysisVersion = 1;
}
export function analyzeTable(s: TableState) {
  recoverFrames(s);
  if (s.complete) s.review = s.review.slice(0, 1);
  s.rounds ??= [];
  for (const f of s.decisions ?? []) {
    let r = s.rounds.find((r) => r.id === f.id);
    if (!r) {
      r = review(s, f);
      s.rounds.push(r);
    }
    if (s.complete && !r.actualProbability) {
      r.actualProbability = probability(
        f,
        new Map(),
        hash(`${s.id}/${s.handNumber}/${f.id}/actual`),
        true,
      );
      r.actualCards = f.players
        .filter((p) => p.seat !== 0)
        .map((p) => ({
          seat: p.seat,
          name: p.name,
          cards: p.hole,
          folded: p.folded,
          hand:
            f.board.length >= 3
              ? best([...p.hole, ...f.board]).name
              : "Preflop",
        }));
    }
  }
  return s;
}
