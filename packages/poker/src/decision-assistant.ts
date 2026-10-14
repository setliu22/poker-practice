import { deck, random, ranks } from "./index";
import { liveOddsFrame, liveOdds } from "./live-odds";
import { livePreflopGuide } from "./preflop-charts";
import { startingHandClass, rangeMatrix } from "./range-summary";
import { positionName } from "../../shared/src/positions";
import { publicProfile } from "./bot-policy";
import {
  inferredRange,
  valueModel,
  pairedActionComparisons,
} from "./table-review";
import { sampleHoles, shuffle } from "./showdown";
import {
  act,
  botAction,
  botObservation,
  legalActions,
  type TableState,
} from "./table";
import type {
  AssistantInput,
  AssistantContext,
  AssistantAnalysis,
  MoveAdvice,
} from "../../shared/src/assistant";

/** Never copy private seats, real runout, deal seed, decision reviews or outcomes. */
export function assistantSnapshot(state: TableState): TableState {
  const frame = liveOddsFrame(state);
  if (state.actor !== 0)
    throw new Error("The assistant is available on your turn.");
  return {
    id: state.analysisIdentity ?? state.id,
    revision: state.revision,
    seed: 0,
    handNumber: state.handNumber,
    dealer: frame.dealer,
    street: frame.street,
    board: frame.board,
    runout: [],
    players: frame.players,
    currentBet: frame.currentBet,
    minRaise: frame.minRaise,
    actor: 0,
    pending: frame.pending,
    lastActBet: frame.lastActBet,
    complete: false,
    history: state.history.map((h) => ({
      street: h.street,
      seat: h.seat,
      text: h.text,
    })),
    review: [],
    policyVersion: frame.policyVersion,
    actions: structuredClone(state.actions ?? []),
    reads: structuredClone(state.reads ?? []),
    policyEvents: (state.policyEvents ?? []).map((e) => ({
      seat: e.seat,
      action: e.action,
      amount: e.amount,
      observation: structuredClone(e.observation),
    })),
  };
}
export function assistantContext(state: TableState): AssistantContext {
  const s = assistantSnapshot(state),
    hero = s.players[0];
  const f = liveOddsFrame(s);
  const hand = startingHandClass(hero.hole);
  const opponents = s.players.filter((p) => p.seat !== 0 && !p.folded);
  const raises = s.actions!.filter(
    (a) => a.street === "preflop" && a.action === "raise",
  ).length;
  const limps =
    s.actions!.some((a) => a.street === "preflop" && a.action === "call") &&
    raises === 0;
  const high = ranks.indexOf(hand[0]) + 2,
    low = ranks.indexOf(hand[1]) + 2;
  const category =
    hand.length === 2
      ? high >= 10
        ? "High pocket pair"
        : high >= 7
          ? "Medium pocket pair"
          : "Small pocket pair"
      : high === 14 && low < 10
        ? `${hand.endsWith("s") ? "Suited" : "Offsuit"} ace with low kicker`
        : low >= 10
          ? `${hand.endsWith("s") ? "Suited" : "Offsuit"} broadway cards`
          : high - low === 1
            ? `${hand.endsWith("s") ? "Suited" : "Offsuit"} connectors`
            : hand.endsWith("s")
              ? "Suited cards"
              : "Offsuit cards";
  let priorRaises = 0;
  const history = s.history
    .filter((h) => h.street === "preflop" && h.seat !== null)
    .map((h) => {
      let text = h.text;
      if (text.startsWith("Raises to")) {
        priorRaises++;
        text = `${priorRaises > 1 ? text.replace("Raises to", "Re-raises to") : text} (${priorRaises + 1}-bet)`;
      } else if (text.startsWith("Calls") && !priorRaises)
        text = `Limps · ${text}`;
      return { name: s.players[h.seat!].name, text };
    });
  return {
    revision: s.revision,
    hole: hero.hole,
    hand,
    category,
    position: positionName(0, s.dealer, s.players.length),
    tableSize: s.players.length,
    competing: opponents.length + 1,
    stillToAct: f.pending.filter(
      (seat) =>
        seat !== 0 && !s.players[seat].folded && s.players[seat].stack > 0,
    ).length,
    guide: livePreflopGuide(s),
    effective: opponents.map((p) => ({
      seat: p.seat,
      name: p.name,
      bb: Math.min(hero.stack + hero.streetBet, p.stack + p.streetBet) / 10,
    })),
    history,
    intuition: [
      raises >= 2
        ? "A re-raise changes the question: which hands can continue against this stronger action sequence? An opening chart cannot answer that."
        : raises === 1
          ? "Facing a raise, consider the price and the raiser's possible hands. A hand you would open is not automatically a hand you should call."
          : limps
            ? "Callers are already in the pot. An isolation raise needs weaker hands that call or enough folds; an unopened-pot chart does not apply."
            : "Before opening, consider your position and the players behind you. Being on the button helps future decisions; it does not add a bonus to showdown equity.",
      opponents.length > 1
        ? "A bluff must get through every opponent. More players also make strong competing hands more likely."
        : "Separate three questions: what can they hold, how might they respond, and what will you do if they raise?",
      high === 14 && low < 10
        ? "Your ace can make top pair, but a higher ace can leave your kicker losing. Against raises, ask which worse hands would continue."
        : hand.length === 2
          ? "You already have a pair, but larger pairs and future overcards matter. Making a set is useful, not a guarantee of winning."
          : high - low === 1
            ? "Connected cards have straight potential. Position and the call price still matter; potential is not the same as profit."
            : "Consider the pairs your cards can make and whether worse hands will pay you. Suitedness adds flush potential, not a reason to ignore the betting.",
    ],
  };
}
export function interval(successes: number, n: number): [number, number] {
  if (!n) return [0, 100];
  const p = successes / n,
    z = 1.96,
    d = 1 + (z * z) / n,
    center = (p + (z * z) / (2 * n)) / d;
  const m = (z * Math.sqrt((p * (1 - p)) / n + (z * z) / (4 * n * n))) / d;
  return [Math.max(0, (center - m) * 100), Math.min(100, (center + m) * 100)];
}
export async function assistantAnalysis(
  publicState: TableState,
  input: AssistantInput,
): Promise<AssistantAnalysis> {
  const s = assistantSnapshot(publicState),
    f = liveOddsFrame(s);
  f.actions = s.actions;
  f.reads = s.reads;
  const legal = legalActions(s)!;
  const action = input.action ?? (legal.canCheck ? "check" : "call");
  if (
    action === "raise" &&
    (!legal.canRaise ||
      input.amount === undefined ||
      input.amount < legal.minRaiseTo ||
      input.amount > legal.maxRaiseTo)
  )
    throw new Error("Choose a legal raise-to amount.");
  if (
    (action === "check" && !legal.canCheck) ||
    (action === "call" && legal.canCheck)
  )
    throw new Error("Choose an available action.");
  const ranges = new Map(
    s.players
      .filter((p) => p.seat !== 0 && !p.folded)
      .map((p) => [p.seat, inferredRange(s, f, p.seat)]),
  );
  const samples =
    input.layer === "advanced" || input.layer === "advice" ? 1600 : 800;
  let seed = 2166136261;
  for (const c of `${s.id}/${s.handNumber}/${s.revision}/assistant-v1`)
    seed = Math.imul(seed ^ c.charCodeAt(0), 16777619);
  const rng = random(seed >>> 0);
  const counts = new Map(
    [...ranges.keys()].map((seat) => [
      seat,
      { reached: 0, fold: 0, call: 0, raise: 0, check: 0 },
    ]),
  );
  const branches = new Map<string, number>();
  let allFold = 0;
  for (let i = 0; i < samples; i++) {
    const holes = sampleHoles(f, ranges, rng);
    if (!holes) throw new Error("Unable to sample legal opponent ranges.");
    const used = [...f.board, ...[...holes.values()].flat()];
    const probe: TableState = {
      ...s,
      players: s.players.map((p) => ({
        ...p,
        hole: holes.get(p.seat)!,
        payout: 0,
      })),
      board: [...s.board],
      runout: [
        ...s.board,
        ...shuffle(
          deck.filter((c) => !used.includes(c)),
          rng,
        ).slice(0, 5 - s.board.length),
      ],
      actions: structuredClone(s.actions),
      reads: structuredClone(s.reads),
      pending: [...s.pending],
      lastActBet: [...s.lastActBet],
      history: [],
      review: [],
      analysisDisabled: true,
    };
    act(probe, 0, action, input.amount);
    const sequence: string[] = [];
    const seen = new Set<number>();
    let steps = 0;
    while (
      !probe.complete &&
      probe.street === s.street &&
      probe.actor !== 0 &&
      steps++ < 100
    ) {
      const seat = probe.actor!;
      const response = botAction(
        botObservation(probe),
        Math.floor(rng() * 4294967295),
      );
      if (!seen.has(seat)) {
        const c = counts.get(seat)!;
        c.reached++;
        c[response.action]++;
        seen.add(seat);
      }
      sequence.push(
        `${probe.players[seat].name} ${response.action}${response.amount ? ` to ${response.amount}` : ""}`,
      );
      act(probe, seat, response.action, response.amount);
    }
    if (steps >= 100)
      throw new Error("The immediate response tree did not finish.");
    if (
      action !== "fold" &&
      probe.players.every((p) => p.seat === 0 || p.folded)
    )
      allFold++;
    const label =
      sequence.join(" → ") ||
      "No opponent response before the next decision/street";
    branches.set(label, (branches.get(label) ?? 0) + 1);
    if (i % 40 === 39)
      await new Promise<void>((resolve) => setTimeout(resolve, 0));
  }
  const ranked = [...branches].sort((a, b) => b[1] - a[1]);
  const top = ranked.slice(0, 5);
  const other = ranked.slice(5).reduce((a, b) => a + b[1], 0);
  if (other) top.push(["Other legal response sequences", other]);
  const result: AssistantAnalysis = {
    revision: s.revision,
    action,
    amount: input.amount,
    samples,
    immediateAllFold: (allFold / samples) * 100,
    allFoldInterval: interval(allFold, samples),
    continuation: input.continuation,
    opponents: [...counts].map(([seat, c]) => {
      const p = s.players[seat],
        read = s.reads?.find((r) => r.seat === seat);
      return {
        seat,
        name: p.name,
        style: p.style,
        range: {
          combinations: ranges.get(seat)!.length,
          matrix: rangeMatrix(ranges.get(seat)!, [
            ...f.players[0].hole,
            ...f.board,
          ]),
        },
        profile: publicProfile(p.botId),
        reached: (c.reached / samples) * 100,
        fold: c.reached ? (c.fold / c.reached) * 100 : 0,
        call: c.reached ? (c.call / c.reached) * 100 : 0,
        raise: c.reached ? (c.raise / c.reached) * 100 : 0,
        check: c.reached ? (c.check / c.reached) * 100 : 0,
        intervals: {
          fold: interval(c.fold, c.reached),
          call: interval(c.call, c.reached),
          raise: interval(c.raise, c.reached),
        },
        observed: read
          ? {
              decisions: read.decisions,
              facing: read.facing,
              folds: read.folds,
              calls: read.calls,
              raises: read.raises,
              foldInterval: interval(read.folds, read.facing),
              callInterval: interval(read.calls, read.facing),
              raiseInterval: interval(read.raises, read.decisions),
            }
          : {
              decisions: 0,
              facing: 0,
              folds: 0,
              calls: 0,
              raises: 0,
              foldInterval: interval(0, 0),
              callInterval: interval(0, 0),
              raiseInterval: interval(0, 0),
            },
      };
    }),
    branches: top.map(([label, n]) => ({
      label,
      percent: (n / samples) * 100,
      interval: interval(n, samples),
    })),
    assumptions: [
      "Policies react to hand strength, call price, raise pressure, position, stack depth, earlier actions and the number of competitors. Contextual bots also make smoothed adjustments to public observations.",
      "Predictions use actual programmed bot policies averaged over ranges inferred from public actions, not human strategy charts.",
      "Response frequencies are conditional on that opponent being reached before your next decision or the next street. They incorporate earlier opponents' sampled actions, not independent fold-rate multiplication.",
      "Everyone-folds means opponents fold before your next decision/street, not folds later in the hand. Branches stop when you must decide again.",
      "Observed counts describe prior public actions, not probabilities for this particular size or position. Sampling intervals do not measure model realism.",
      "Ranges exclude your cards and visible board; joint deals reject card collisions. Folded cards are sampled uniformly, without modeling their fold likelihood.",
    ],
  };
  if (input.layer === "advanced" || input.layer === "advice") {
    if (input.layer === "advanced") result.equity = await liveOdds(s);
    f.action = action;
    f.amount = input.amount;
    const values = valueModel(f, ranges, (seed + 1) >>> 0, {
      samples,
      continuation: input.continuation,
      details: true,
    });
    result.recommendation = recommendMove(values);
    result.comparisons = pairedActionComparisons(values, action);
    result.values = values.map(({ outcomes: _outcomes, ...v }) => v);
    result.assumptions.push(
      input.continuation === "theo"
        ? "After your chosen action, non-river learner decisions follow Theo's authored policy; this is one possible continuation, not your optimal play."
        : "After your chosen action, non-river learner decisions check when free and fold to every bet. This deliberate check/fold sensitivity test is not recommended strategy.",
      "Heads-up river entries explicitly distinguish call-to-reraise and fold-to-reraise plans. River call continuations do not search optimal further raises.",
      "EV = average final learner stack minus stack at this decision. Already committed chips are sunk. Side pots, returned excess bets and odd chips use the game settlement rules.",
      "Values use the same sampled worlds across tested actions. Marginal EV intervals show sampling noise; small differences do not establish a best choice. More samples cannot validate opponent assumptions.",
    );
  }
  return result;
}

export function recommendMove(
  values: Parameters<typeof pairedActionComparisons>[0],
): MoveAdvice {
  if (!values.length || values.some((v) => !Number.isFinite(v.chips)))
    throw new Error("No valid action comparison is available.");
  const best = values.reduce((a, b) => (b.chips > a.chips ? b : a));
  const comparisons = pairedActionComparisons(values, best.key, true);
  const alternatives = comparisons
    .filter((c) => -c.difference <= c.margin + 1e-8)
    .map((c) => c.key);
  const action = best.key.startsWith("raise")
    ? "raise"
    : best.key.startsWith("call")
      ? "call"
      : best.key.startsWith("check")
        ? "check"
        : "fold";
  const match = best.label.match(/(?:Raise to|Bet) (\d+)/i);
  return {
    key: best.key,
    action,
    ...(match ? { amount: Number(match[1]) } : {}),
    label: best.label,
    chips: best.chips,
    status: alternatives.length ? "close" : "distinct",
    alternatives,
    explanation: alternatives.length
      ? "This has the highest estimated return, but other tested choices are too close to separate confidently. The highlight is a tentative bot-model preference."
      : "This has a higher estimated return than the other tested choices after accounting for sampling uncertainty. It depends on inferred ranges and the stated continuation policy, not guaranteed optimal poker play.",
  };
}
