import { best, deck, random } from "./index";
import { preflopGuide } from "./preflop-charts";
import { decisionRating } from "./decision-rating";
import { rangeDrawDensity } from "./range-draws";
import { shuffle, sampleHoles, probability, type Combo } from "./showdown";
import {
  normalizedRange,
  rangeMatrix,
  rangeMadeMatchup,
} from "./range-summary";
import { decisionFacts } from "./decision-facts";
export { probability } from "./showdown";
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
import type {
  DecisionReview,
  ActionValue,
  ResponsePreview,
  TableView,
} from "../../shared/src/table";
const totalPot = (f: DecisionFrame) =>
  f.players.reduce((n, p) => n + p.contributed, 0);
function hash(s: string) {
  let n = 2166136261;
  for (const c of s) n = Math.imul(n ^ c.charCodeAt(0), 16777619);
  return n >>> 0;
}
function raiseChoices(
  f: DecisionFrame,
  legal: NonNullable<TableView["legal"]>,
) {
  if (!legal.canRaise) return [];
  const clamp = (amount: number) =>
    Math.min(legal.maxRaiseTo, Math.max(legal.minRaiseTo, amount));
  const chosenAmount = clamp(
    f.action === "raise"
      ? f.amount!
      : f.currentBet + Math.round(totalPot(f) / 2),
  );
  const sizes = [
    ...new Set([
      chosenAmount,
      legal.minRaiseTo,
      clamp(f.currentBet + Math.round(totalPot(f) / 2)),
      clamp(f.currentBet + totalPot(f)),
    ]),
  ];
  return sizes.map((amount) => ({
    key: amount === chosenAmount ? "raise" : `raise-${amount}`,
    label: `${f.currentBet ? "Raise to" : "Bet"} ${amount}`,
    action: "raise" as const,
    amount,
  }));
}

// Enumerate only the next response to a bet in a heads-up situation. This is
// exact under the authored bot policy, not a forecast about human opponents.
export function betResponsePreviews(
  f: DecisionFrame,
  ranges: Map<number, Combo[]>,
): ResponsePreview[] {
  const competitors = f.players.filter((p) => p.seat !== 0 && !p.folded);
  if (ranges.size !== 1 || competitors.length !== 1) return [];
  const opponent = competitors[0];
  const input = ranges.get(opponent.seat);
  if (!input || opponent.stack <= 0) return [];
  const combos = normalizedRange(input, [...f.players[0].hole, ...f.board]);
  // Deliberately discard every hidden hole card and any future board. The
  // single-response calculation cannot advance the street or settle a hand.
  const publicProbe: TableState = {
    id: "response-preview",
    revision: 0,
    seed: 0,
    handNumber: 1,
    dealer: f.dealer,
    street: f.street,
    board: [...f.board],
    runout: [],
    players: f.players.map((p) => ({
      ...p,
      hole: p.seat === 0 ? [...p.hole] : [],
      payout: 0,
    })),
    currentBet: f.currentBet,
    minRaise: f.minRaise,
    actor: 0,
    pending: [...f.pending],
    lastActBet: [...f.lastActBet],
    complete: false,
    history: [],
    review: [],
    actions: structuredClone(f.actions ?? []),
    reads: structuredClone(f.reads ?? []),
    policyVersion: f.policyVersion ?? 1,
    analysisDisabled: true,
  };
  const legal = legalActions(publicProbe)!;
  return raiseChoices(f, legal).map((choice) => {
    const probe = structuredClone(publicProbe);
    act(probe, 0, "raise", choice.amount);
    if (
      probe.complete ||
      probe.street !== f.street ||
      probe.actor !== opponent.seat
    )
      throw new Error("A response preview must stay on the current street.");
    const observation = botObservation(probe);
    const result: ResponsePreview = {
      key: choice.key,
      label: choice.label,
      fold: 0,
      call: 0,
      raise: 0,
      foldExamples: [],
      callExamples: [],
      raiseExamples: [],
    };
    const examples = {
      fold: new Map<string, { cards: string[]; percent: number }>(),
      call: new Map<string, { cards: string[]; percent: number }>(),
      raise: new Map<string, { cards: string[]; percent: number }>(),
    };
    for (const combo of combos)
      for (const response of botDistribution({
        ...observation,
        hole: combo.cards,
      })) {
        if (response.action === "check")
          throw new Error("A bot cannot check when facing a previewed bet.");
        const percent = 100 * combo.weight * response.probability;
        if (!(percent > 0)) continue;
        result[response.action] += percent;
        const key = [...combo.cards].sort().join("");
        const example = examples[response.action].get(key) ?? {
          cards: [...combo.cards],
          percent: 0,
        };
        example.percent += percent;
        examples[response.action].set(key, example);
      }
    for (const response of ["fold", "call", "raise"] as const)
      result[`${response}Examples`] = [...examples[response].values()]
        .sort((a, b) => b.percent - a.percent)
        .slice(0, 3);
    return result;
  });
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
export function valueModel(
  f: DecisionFrame,
  ranges: Map<number, Combo[]>,
  seed: number,
  options: {
    samples?: number;
    continuation?: "theo" | "check-fold";
    details?: boolean;
  } = {},
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
    foldToRaise?: boolean;
  }[] = [
    { key: "fold", label: "Fold", action: "fold" },
    {
      key: call ? "call" : "check",
      label: call ? `Call ${call}` : "Check",
      action: call ? "call" : "check",
    },
  ];
  const exactRiver = f.board.length === 5 && ranges.size === 1;
  if (legal.canRaise) {
    for (const { key, label, amount } of raiseChoices(f, legal)) {
      const canFaceRaise = amount < legal.maxRaiseTo;
      choices.push({
        key,
        label: exactRiver && canFaceRaise ? `${label}; call a re-raise` : label,
        action: "raise",
        amount,
      });
      // Explicitly compare a bet/fold plan with committing to a further raise.
      // These are separate continuations, not a claim about the best river play.
      if (exactRiver && canFaceRaise)
        choices.push({
          key: `${key}-fold-to-raise`,
          label: `${label}; fold to a re-raise`,
          action: "raise",
          amount,
          foldToRaise: true,
        });
    }
  }
  if (f.board.length === 5 && ranges.size === 1) {
    const [opponent, combos] = [...ranges][0];
    // On the river there are no unknown future cards. Enumerate the bot's
    // complete response tree instead of sampling policy actions or hole cards.
    // Enumerate explicitly named learner continuations: call any further raise,
    // or fold to a re-raise. The response tree is conditional on that plan.
    const settle = (
      s: TableState,
      foldToRaise: boolean,
      depth = 0,
    ): { chips: number; allFold: number } => {
      if (s.complete)
        return {
          chips: s.players[0].stack - f.players[0].stack,
          allFold: s.players.every((p) => p.seat === 0 || p.folded) ? 100 : 0,
        };
      if (depth > 8)
        throw new Error("River response tree exceeded its finite limit.");
      if (s.actor === 0) {
        const legal = legalActions(s)!;
        act(s, 0, legal.toCall ? (foldToRaise ? "fold" : "call") : "check");
        return settle(s, foldToRaise, depth + 1);
      }
      let chips = 0,
        allFold = 0;
      for (const response of botDistribution(botObservation(s))) {
        const branch = structuredClone(s);
        act(branch, branch.actor!, response.action, response.amount);
        const result = settle(branch, foldToRaise, depth + 1);
        chips += response.probability * result.chips;
        allFold += response.probability * result.allFold;
      }
      return { chips, allFold };
    };
    const mass = combos.reduce((sum, c) => sum + c.weight, 0);
    if (!(mass > 0))
      throw new Error("An opponent range must have positive weight.");
    return choices.map((choice) => {
      if (choice.action === "fold")
        return {
          key: choice.key,
          label: choice.label,
          chips: 0,
          allFold: 0,
          exact: true,
          margin: 0,
          samples: 0,
          outcomes: [] as number[],
        };
      let chips = 0,
        allFold = 0;
      for (const combo of combos) {
        const s = structuredClone(probe);
        s.runout = [...f.board];
        s.players[opponent].hole = [...combo.cards];
        s.players.forEach((p) => {
          p.payout = 0;
        });
        act(s, 0, choice.action, choice.amount);
        const result = settle(s, choice.foldToRaise ?? false);
        chips += (combo.weight / mass) * result.chips;
        allFold += (combo.weight / mass) * result.allFold;
      }
      return {
        key: choice.key,
        label: choice.label,
        chips,
        allFold,
        exact: true,
        margin: 0,
        samples: 0,
        outcomes: [] as number[],
      };
    });
  }
  const rng = random(seed);
  // Fixed sample count: do not stop as soon as a favorable interval appears.
  const budget = options.samples ?? 640;
  if (!Number.isInteger(budget) || budget < 200 || budget > 10000)
    throw new Error("Use 200 to 10,000 EV samples.");
  const worlds = Array.from({ length: budget }, () => {
    const holes = sampleHoles(f, ranges, rng);
    if (!holes)
      throw new Error("Unable to sample a legal joint opponent range.");
    const used = [...f.board, ...[...holes.values()].flat()];
    return {
      holes,
      runout: [
        ...f.board,
        ...shuffle(
          deck.filter((c) => !used.includes(c)),
          rng,
        ).slice(0, 5 - f.board.length),
      ],
      responseSeed: Math.floor(rng() * 4294967295),
    };
  });
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
        outcomes: worlds.map(() => 0),
        ...(options.details
          ? {
              sources: [
                {
                  kind: "folded" as const,
                  probability: 100,
                  contribution: 0,
                  averageNet: 0,
                },
              ],
            }
          : {}),
      };
    let sum = 0,
      squares = 0,
      allFold = 0,
      n = 0;
    const outcomes: number[] = [];
    const sources = {
      uncontested: { count: 0, sum: 0 },
      showdown: { count: 0, sum: 0 },
      folded: { count: 0, sum: 0 },
    };
    for (const world of worlds) {
      const responseRng = random(world.responseSeed);
      const { holes, runout } = world;
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
        const seat = s.actor!;
        const observation = botObservation(s);
        // A modeled learner continuation must use only their own cards and
        // public information. Never choose actions using sampled opponent hands
        // or the undealt portion of runout. Theo is an authored policy, not an
        // optimal strategy or a prediction of what the learner will actually do.
        const continuation =
          seat === 0
            ? {
                ...observation,
                policyVersion: 2,
                botId: "theo",
                style: "Tight-aggressive",
              }
            : observation;
        const a =
          seat === 0 && options.continuation === "check-fold"
            ? {
                action: observation.legal.toCall
                  ? ("fold" as const)
                  : ("check" as const),
              }
            : botAction(continuation, Math.floor(responseRng() * 4294967295));
        act(s, seat, a.action, a.amount);
      }
      if (!s.complete) throw new Error("Decision model did not finish.");
      const net = s.players[0].stack - f.players[0].stack;
      const kind = s.players[0].folded
        ? "folded"
        : s.players.every((p) => p.seat === 0 || p.folded)
          ? "uncontested"
          : "showdown";
      sources[kind].count++;
      sources[kind].sum += net;
      outcomes.push(net);
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
      margin:
        1.96 *
        Math.sqrt(Math.max(0, squares - n * mean * mean) / (n * (n - 1))),
      exact: false,
      samples: n,
      allFold: (100 * allFold) / n,
      outcomes,
      ...(options.details
        ? {
            sources: (
              Object.entries(sources) as [
                keyof typeof sources,
                { count: number; sum: number },
              ][]
            ).map(([kind, source]) => ({
              kind,
              probability: (100 * source.count) / n,
              contribution: source.sum / n,
              averageNet: source.count ? source.sum / source.count : 0,
            })),
          }
        : {}),
    };
  });
}
export function pairedActionComparisons(
  values: (ActionValue & { outcomes: number[] })[],
  chosenKey: string,
  selectingBest = false,
) {
  const chosen = values.find((value) => value.key === chosenKey);
  if (!chosen)
    throw new Error("The selected action is missing from the comparison.");
  const comparisons = values
    .filter((v) => v.key !== chosen.key)
    .map((v) => {
      if (v.exact && chosen.exact) {
        const difference = v.chips - chosen.chips;
        return {
          key: v.key,
          difference,
          margin: 0,
          samples: 0,
          clear: difference > 1e-8,
        };
      }
      const differences = v.outcomes.map(
        (x, i) =>
          (v.exact ? v.chips : x) -
          (chosen.exact ? chosen.chips : chosen.outcomes[i]),
      );
      const n = differences.length;
      const mean = differences.reduce((a, b) => a + b, 0) / n;
      const variance =
        differences.reduce((a, x) => a + (x - mean) ** 2, 0) / (n - 1);
      // Conservative normal critical values for Bonferroni-adjusted, two-sided
      // 95% intervals, accounting for every tested alternative and raise size.
      // Selecting the winner after sampling requires covering all pairs,
      // rather than only comparisons against a preselected learner action.
      const alternatives = selectingBest
        ? (values.length * (values.length - 1)) / 2
        : values.length - 1;
      const critical =
        [0, 1.96, 2.25, 2.4, 2.5, 2.58, 2.64, 2.7, 2.74, 2.78][alternatives] ??
        Math.sqrt(2 * Math.log((2 * alternatives) / 0.05));
      const margin = critical * Math.sqrt(variance / n);
      const difference = v.chips - chosen.chips;
      return {
        key: v.key,
        difference,
        margin,
        samples: n,
        clear: difference > margin,
      };
    });
  return comparisons;
}

function review(state: TableState, f: DecisionFrame): DecisionReview {
  const streetBoards: Record<string, number> = {
    preflop: 0,
    flop: 3,
    turn: 4,
    river: 5,
  };
  const boardCards = streetBoards[f.street];
  if (boardCards === undefined || f.board.length !== boardCards)
    throw new Error(
      "Decision snapshot street does not match its public board; analysis was withheld.",
    );
  const ranges = new Map(
    f.players
      .filter((p) => p.seat !== 0 && !p.folded)
      .map((p) => [p.seat, inferredRange(state, f, p.seat)]),
  );
  const seed = hash(
      `${state.analysisIdentity ?? state.id}/${state.handNumber}/${f.id}`,
    ),
    pot = totalPot(f),
    hero = f.players[0];
  const call = Math.min(hero.stack, Math.max(0, f.currentBet - hero.streetBet)),
    risk = f.action === "raise" ? f.amount! - hero.streetBet : 0;
  const values = valueModel(f, ranges, seed),
    chosen = values.find((v) => v.key === f.action)!;
  const rangeProbability = probability(f, ranges, seed + 1);
  // Retain valueModel's integer payouts, including the dealer-relative odd chip.
  // Fractional equity * pot is not an exact substitute for a split-pot payout.

  const comparisons = pairedActionComparisons(values, chosen.key);
  const better = comparisons
    .filter((c) => c.clear)
    .sort((a, b) => b.difference - a.difference)[0];
  const top = better ? values.find((v) => v.key === better.key)! : chosen;
  const clear = Boolean(better);
  const allExact = values.every((v) => v.exact);
  const groups = (cards: string[]) =>
    f.board.length >= 3
      ? best([...cards, ...f.board]).name
      : cards[0][0] === cards[1][0]
        ? "Pocket pair"
        : cards[0][1] === cards[1][1]
          ? "Suited"
          : "Offsuit";
  const result: DecisionReview = {
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
        matrix: rangeMatrix(combos, [...hero.hole, ...f.board]),
        matchup: rangeMadeMatchup(hero.hole, f.board, combos),
        drawDensity: rangeDrawDensity(hero.hole, f.board, combos),
      };
    }),
    rangeProbability,
    values: values.map(({ outcomes: _outcomes, ...v }) => v),
    comparisons,
    analysisVersion: 7,
    responsePreviews: betResponsePreviews(f, ranges),
    context: decisionFacts(f),
    preflopGuide: preflopGuide(f),
    chosenKey: f.action,
    verdict: clear
      ? `${top.label} has a higher estimated return in this limited model`
      : allExact
        ? "Your action has the highest return among the tested choices in this model"
        : "No clear evidence your action was worse in this model",
    explanation: clear
      ? `Your action averaged ${chosen.chips.toFixed(1)} chips from this decision; ${top.label.toLowerCase()} averaged ${top.chips.toFixed(1)}. ${better!.samples === 0 ? `The difference is ${better!.difference.toFixed(1)} chips, exactly enumerated under the stated bot-response model.` : `The paired difference is ${better!.difference.toFixed(1)} ± ${better!.margin.toFixed(1)} chips (approximate 95% sampling interval, adjusted for comparing alternatives).`} This does not measure whether the bot assumptions are realistic.`
      : allExact
        ? `Your action returns ${chosen.chips.toFixed(1)} chips on average under this exactly enumerated river model${comparisons.some((c) => Math.abs(c.difference) < 1e-8) ? "; another tested choice ties it" : ""}. Exact arithmetic does not validate the bot assumptions or the specified call/fold continuation.`
        : `Your action averaged ${chosen.chips.toFixed(1)} chips from this decision. The simulation cannot reliably separate these choices. That is an inconclusive comparison, not evidence your action was good.`,
    model:
      "Heads-up river comparisons enumerate the inferred range and bot responses exactly. Unless labeled ‘fold to a re-raise’, their learner continuation calls further raises. Other comparisons simulate betting through the end of the hand: opponents use their actual authored policies; your later actions follow Theo’s authored policy, which can check, fold, call or raise using only your cards and public information. Tested raise sizes include the legal minimum, half-pot, pot and your chosen size where distinct. Net chips exclude money already in the pot. Intervals describe random sampling error only, not incorrect bot assumptions. These forecasts depend on the specified continuations; they are not grades of poker skill or optimal-play recommendations.",
    rangeNote:
      "Ranges start with equally likely legal hands, then weight each hand by how often this bot would have taken its earlier actions. Only information available at your decision is used. Multiway samples draw independent ranges and reject colliding deals; this conditions the action-weighted joint range on legal cards. Folded cards are sampled uniformly from remaining cards; their fold likelihood is not modeled.",
  };
  result.modelRating = decisionRating(result);
  return result;
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
    if (
      r &&
      (r.analysisVersion !== 7 || !r.modelRating || r.modelRating.version !== 1)
    ) {
      s.rounds = s.rounds.filter((entry) => entry.id !== f.id);
      r = undefined;
    }
    if (!r) {
      r = review(s, f);
      s.rounds.push(r);
    }
    if (s.complete && !r.actualProbability) {
      r.actualProbability = probability(
        f,
        new Map(),
        hash(`${s.analysisIdentity ?? s.id}/${s.handNumber}/${f.id}/actual`),
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
