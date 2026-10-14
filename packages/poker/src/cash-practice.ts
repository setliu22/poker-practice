import type {
  CashAction,
  CashAnswer,
  CashDrillSpecification,
  CashFeedback,
  CashHistoryAction,
  CashQuestion,
  CashRange,
  CashSkill,
} from "../../shared/src/cash-practice";
import { positionName } from "../../shared/src/positions";
import { best, compare, deck, random, validateCards } from "./index";

export const cashSkillLabels: Record<CashSkill, string> = {
  "bluff-catch": "River bluff catching",
  "value-bet": "River value betting",
  bluff: "River bluffing",
  "multiway-call": "Closing multiway calls",
};
export const cashSkillCues: Record<CashSkill, string> = {
  "bluff-catch":
    "Before a river call, compare your share against the entire betting range with the price, including rake.",
  "value-bet":
    "Before a value bet, identify which worse hands call and compare betting with checking against the full range.",
  bluff:
    "Before a bluff, estimate which hands fold and compare that frequency with the break-even fold threshold.",
  "multiway-call":
    "When a multiway river call closes the action, count legal joint ranges and split-pot shares before comparing with the price.",
};
const reasonIds: Record<CashSkill, string> = {
  "bluff-catch": "range-price",
  "multiway-call": "joint-share",
  "value-bet": "called-range",
  bluff: "fold-threshold",
};
const reasons: Record<CashSkill, { id: string; label: string }[]> = {
  "bluff-catch": [
    {
      id: "range-price",
      label:
        "Compare my pot share against the full betting range with the cost of calling.",
    },
    {
      id: "absolute-strength",
      label:
        "A top pair is strong enough to call regardless of the opponent's range or price.",
    },
    {
      id: "sunk-chips",
      label: "I have already invested chips, so folding would waste them.",
    },
  ],
  "multiway-call": [
    {
      id: "joint-share",
      label:
        "Compare my share against legal combinations of both ranges, including split pots, with the closing-call price.",
    },
    {
      id: "separate-opponents",
      label:
        "Use only my equity against the bettor and ignore the other caller.",
    },
    {
      id: "bigger-pot",
      label:
        "An extra caller always makes a call profitable because the pot is bigger.",
    },
  ],
  "value-bet": [
    {
      id: "called-range",
      label:
        "Compare betting with checking using which worse and better hands actually call.",
    },
    {
      id: "ahead-enough",
      label:
        "If I beat most of the whole range, any bet size earns more than checking.",
    },
    {
      id: "protect-river",
      label: "Bet to deny a free next card on the river.",
    },
  ],
  bluff: [
    {
      id: "fold-threshold",
      label:
        "Compare the supplied fold frequency with the break-even threshold for this bet.",
    },
    {
      id: "due-to-win",
      label: "A missed draw should bluff because it is due to win a pot.",
    },
    {
      id: "large-always",
      label: "A large bet always forces a better hand to fold.",
    },
  ],
};

type World = { weight: number; share: number; weaker: boolean; folds: boolean };
function worlds(q: CashQuestion): World[] {
  validateCards([...q.hole, ...q.board], 7, 7);
  if (
    q.hole.length !== 2 ||
    q.board.length !== 5 ||
    !q.ranges.length ||
    q.ranges.length > 2
  )
    throw new Error("Use a river question with one or two opponent ranges.");
  if (
    ![q.potBb, q.callBb, q.betBb, q.rakeBb].every(Number.isFinite) ||
    q.potBb <= q.rakeBb ||
    q.rakeBb < 0 ||
    q.callBb < 0 ||
    q.betBb < 0 ||
    q.callBb > 0 === q.betBb > 0
  )
    throw new Error(
      "Use finite nonnegative sizes and a pot larger than study rake.",
    );
  const hero = best([...q.hole, ...q.board]);
  const used = new Set([...q.hole, ...q.board]);
  const rows = q.ranges.map((range) => {
    if (!range.combinations.length) throw new Error("Supply a nonempty range.");
    const keys = new Set<string>();
    const sum = range.combinations.reduce((s, c) => s + c.weight, 0);
    if (!Number.isFinite(sum) || sum <= 0)
      throw new Error("Supply positive finite range mass.");
    return range.combinations.map((c) => {
      validateCards(c.cards, 2, 2);
      const key = [...c.cards].sort().join("");
      if (
        keys.has(key) ||
        c.cards.some((card) => used.has(card)) ||
        !Number.isFinite(c.weight) ||
        c.weight < 0
      )
        throw new Error(
          "Range combinations must be unique, unblocked, and have finite nonnegative weights.",
        );
      keys.add(key);
      if (q.betBb > 0 && c.response !== "call" && c.response !== "fold")
        throw new Error(
          "Bet/check questions require a response for every combination.",
        );
      return {
        cards: c.cards,
        weight: c.weight / sum,
        result: compare(hero, best([...q.board, ...c.cards])),
        response: c.response,
      };
    });
  });
  if (q.betBb > 0 && rows.length !== 1)
    throw new Error("Bet/check questions use one opponent.");
  const result: World[] = [];
  for (const a of rows[0]) {
    for (const b of rows.length === 2 ? rows[1] : [null]) {
      if (
        a.weight === 0 ||
        b?.weight === 0 ||
        b?.cards.some((card) => a.cards.includes(card))
      )
        continue;
      const outcomes = b ? [a.result, b.result] : [a.result];
      const share = outcomes.some((r) => r < 0)
        ? 0
        : 1 / (1 + outcomes.filter((r) => r === 0).length);
      result.push({
        weight: a.weight * (b?.weight ?? 1),
        share,
        weaker: a.result > 0,
        folds: a.response === "fold",
      });
    }
  }
  const sum = result.reduce((s, w) => s + w.weight, 0);
  if (!sum)
    throw new Error(
      "No legal positive-weight joint range combinations remain.",
    );
  return result.map((w) => ({ ...w, weight: w.weight / sum }));
}

export function gradeCashQuestion(
  q: CashQuestion,
  answer: CashAnswer,
  assisted = false,
): CashFeedback {
  if (
    answer.phase !== q.phase ||
    !q.options.some((o) => o.action === answer.action) ||
    !q.reasons.some((r) => r.id === answer.reasonId) ||
    !Number.isFinite(answer.estimatePercent) ||
    answer.estimatePercent < 0 ||
    answer.estimatePercent > 100
  )
    throw new Error(
      "Answer the current question using its offered action and reasoning choices.",
    );
  const ws = worlds(q);
  const share = ws.reduce((s, w) => s + w.weight * w.share, 0);
  const fold = ws.reduce((s, w) => s + (w.folds ? w.weight : 0), 0);
  const callMass = 1 - fold;
  const weaker =
    callMass > 0
      ? ws.reduce((s, w) => s + (!w.folds && w.weaker ? w.weight : 0), 0) /
        callMass
      : 0;
  const netPot = q.potBb - q.rakeBb;
  const ev: Partial<Record<CashAction, number>> =
    q.callBb > 0
      ? {
          fold: 0,
          call: share * (netPot + q.callBb) - q.callBb,
        }
      : {
          check: share * netPot,
          bet: ws.reduce(
            (s, w) =>
              s +
              w.weight *
                (w.folds ? netPot : w.share * (netPot + 2 * q.betBb) - q.betBb),
            0,
          ),
        };
  if (q.skill === "bluff" && share > 1e-10)
    throw new Error("This pure-bluff exercise requires zero showdown share.");
  if (q.skill === "value-bet" && callMass <= 0)
    throw new Error("A value-bet question must have a nonempty calling range.");
  const expectedEstimate =
    q.skill === "value-bet"
      ? weaker * 100
      : q.skill === "bluff"
        ? (q.betBb / (netPot + q.betBb)) * 100
        : (q.callBb / (netPot + q.callBb)) * 100;
  const actionValues = q.options.map((o) => ({ ...o, evBb: ev[o.action]! }));
  if (actionValues.some((v) => !Number.isFinite(v.evBb)))
    throw new Error(
      "Question options do not match its bet or closing-call context.",
    );
  const maxEv = Math.max(...actionValues.map((o) => o.evBb));
  const acceptedActions = actionValues
    .filter((v) => Math.abs(v.evBb - maxEv) < 1e-9)
    .map((v) => v.action);
  const actionCorrect = acceptedActions.includes(answer.action);
  const reasonCorrect = answer.reasonId === reasonIds[q.skill];
  const estimateErrorPp = Math.abs(answer.estimatePercent - expectedEstimate);
  const estimateCorrect = estimateErrorPp <= 1;
  const pct = (v: number) => `${(v * 100).toFixed(1)}%`;
  const bb = (v: number) => v.toFixed(2);
  const explanation =
    q.callBb > 0
      ? `Under the supplied ${q.ranges.length === 2 ? "joint ranges" : "betting range"}, your expected pot share is ${pct(share)}. The closing-call price is ${expectedEstimate.toFixed(1)}%. ${acceptedActions.join(" or ")} has the highest conditional EV. Chips invested earlier are sunk.`
      : q.skill === "bluff"
        ? `Your hand has zero showdown share against this supplied range. The stipulated fold frequency is ${pct(fold)}; the break-even threshold is ${expectedEstimate.toFixed(1)}%. ${acceptedActions.join(" or ")} has the highest conditional EV.`
        : `${pct(weaker)} of the supplied calling range is weaker than your hand. Compare the full-range check value with the bet's fold and call branches; weaker-caller percentage alone is not a universal betting rule. ${acceptedActions.join(" or ")} has the highest conditional EV.`;
  const calculation =
    q.callBb > 0
      ? `Call EV = ${share.toFixed(4)} × (${bb(q.potBb)} + ${bb(q.callBb)} − ${bb(q.rakeBb)}) − ${bb(q.callBb)} = ${bb(ev.call!)} BB. Required share = ${bb(q.callBb)} / (${bb(q.potBb)} + ${bb(q.callBb)} − ${bb(q.rakeBb)}). Fold EV = 0 BB.`
      : `Check EV = ${share.toFixed(4)} × (${bb(q.potBb)} − ${bb(q.rakeBb)}) = ${bb(ev.check!)} BB. Bet EV averages fold payoff P − R and call payoff share × (P + 2B − R) − B across the supplied range = ${bb(ev.bet!)} BB.${q.skill === "bluff" ? ` Required folds = B / (P − R + B) = ${expectedEstimate.toFixed(1)}%.` : ""}`;
  return {
    phase: q.phase,
    actionCorrect,
    reasonCorrect,
    estimateCorrect,
    estimateErrorPp,
    correct: actionCorrect && reasonCorrect && estimateCorrect,
    assisted,
    acceptedActions,
    expectedEstimate,
    selectedActionEvBb: ev[answer.action]!,
    actionValues,
    sharePercent: share * 100,
    ...(q.betBb > 0 ? { foldPercent: fold * 100 } : {}),
    ...(q.skill === "value-bet" ? { weakerCallerPercent: weaker * 100 } : {}),
    legalWorlds: ws.length,
    explanation,
    calculation,
    takeaway: cashSkillCues[q.skill],
  };
}

export function cashHint(q: CashQuestion): string {
  return q.skill === "value-bet"
    ? "Separate the supplied range into folds and calls. Among calls, count worse hands; then compare the EV of checking with the fold and call branches of betting."
    : q.skill === "bluff"
      ? "For a pure bluff, a fold wins the current pot after study rake and a call loses your bet. Divide the bet by the net current pot plus the bet to find the break-even fold frequency."
      : q.skill === "multiway-call"
        ? "Discard joint combinations that reuse a card. Normalize the remaining weights. For each world, count a win as 1 and a tie among k winners as 1/k. Compare this share with call / (current pot + call − study rake)."
        : "Count wins and split pots against the whole supplied betting range. Compare that share with call / (current pot + call − study rake), using the pot that already includes the opponent's bet.";
}

// Original dry-board study templates, not imported opening charts or solver solutions.
const templates = [
  { board: ["Ac", "7d", "4h", "Js", "2c"], hole: ["Ah", "Qc"] },
  { board: ["Kc", "8d", "4h", "Ts", "2c"], hole: ["Kh", "Qc"] },
  { board: ["Qc", "6d", "3h", "Ts", "2c"], hole: ["Qh", "Jc"] },
  { board: ["Jc", "8d", "3h", "9s", "2c"], hole: ["Jh", "Tc"] },
  { board: ["Tc", "6d", "3h", "8s", "2c"], hole: ["Th", "9c"] },
  { board: ["Ac", "8d", "5h", "Ts", "3c"], hole: ["Ah", "Qc"] },
  { board: ["Kc", "7d", "3h", "Js", "2c"], hole: ["Kh", "Qc"] },
  { board: ["Qc", "8d", "5h", "9s", "2c"], hole: ["Qh", "Jc"] },
];
const templateRanges = new Map<
  number,
  { weak: string[][]; strong: string[][] }
>();
function candidates(index: number) {
  const cached = templateRanges.get(index);
  if (cached) return cached;
  const t = templates[index];
  const mine = best([...t.hole, ...t.board]);
  const available = deck.filter((c) => ![...t.hole, ...t.board].includes(c));
  const weak: string[][] = [],
    strong: string[][] = [];
  // Prefer pairs involving a board rank: recognizable made-hand ranges.
  for (let i = 0; i < available.length; i++)
    for (let j = i + 1; j < available.length; j++) {
      const pair = [available[i], available[j]];
      if (!pair.some((c) => t.board.some((b) => b[0] === c[0]))) continue;
      const theirs = best([...pair, ...t.board]);
      const outcome = compare(mine, theirs);
      if (outcome > 0) weak.push(pair);
      if (outcome < 0) strong.push(pair);
    }
  if (weak.length < 3 || strong.length < 3)
    throw new Error("Study template lacks contrasting made hands.");
  const result = { weak, strong };
  templateRanges.set(index, result);
  return result;
}

export function generateCashDrill(
  seed: number,
  players: number,
  skill: CashSkill,
): CashDrillSpecification {
  if (
    !Number.isInteger(seed) ||
    seed < 0 ||
    seed > 0xffffffff ||
    !Number.isInteger(players) ||
    players < 2 ||
    players > 9 ||
    !(skill in cashSkillLabels) ||
    (skill === "multiway-call" && players === 2)
  )
    throw new Error(
      "Use a uint32 seed, 2–9 seats, and a supported skill for that table.",
    );
  const rng = random(seed),
    choose = <T>(xs: T[]): T => xs[Math.floor(rng() * xs.length)];
  const index = Math.floor(rng() * templates.length),
    t = templates[index];
  const suits = [..."cdhs"];
  for (let i = 3; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [suits[i], suits[j]] = [suits[j], suits[i]];
  }
  const map = (card: string) => card[0] + suits["cdhs".indexOf(card[1])];
  const board = t.board.map(map);
  const baseHole = skill === "bluff" ? ["6c", "5s"] : t.hole;
  // Pick a missed-draw hand with no share against every supplied candidate.
  let hole = baseHole.map(map);
  const pool = candidates(index);
  const disjoint = (source: string[][]) => {
    const shuffled = [...source];
    for (let i = shuffled.length - 1; i > 0; i--) {
      const j = Math.floor(rng() * (i + 1));
      [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
    }
    const picked: string[][] = [],
      used = new Set<string>();
    for (const combo of shuffled) {
      if (combo.some((c) => used.has(c))) continue;
      picked.push(combo);
      combo.forEach((c) => used.add(c));
      if (picked.length === 3) return picked;
    }
    throw new Error(
      "Template needs three mutually compatible study combinations.",
    );
  };
  let weak = disjoint(pool.weak),
    strong = disjoint(pool.strong);
  if (skill === "bluff") {
    const occupied = new Set(t.board);
    const lowHands = [
      ["6c", "5s"],
      ["4c", "5s"],
      ["3c", "6s"],
      ["2h", "5s"],
      ["4c", "6s"],
    ];
    let selected: { hand: string[]; combos: string[][] } | undefined;
    for (const hand of lowHands) {
      if (hand.some((c) => occupied.has(c))) continue;
      const mine = best([...t.board, ...hand]);
      const combos = [...pool.weak, ...pool.strong].filter(
        (cs) =>
          !cs.some((c) => hand.includes(c)) &&
          compare(mine, best([...t.board, ...cs])) < 0,
      );
      if (combos.length >= 6) {
        selected = { hand, combos };
        break;
      }
    }
    if (!selected) throw new Error("Study template lacks a pure bluff.");
    hole = selected.hand.map(map);
    weak = selected.combos.slice(0, 3);
    strong = selected.combos.slice(3, 6);
  }
  const offeredReasons = reasons[skill].map((r) => ({ ...r }));
  for (let i = offeredReasons.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [offeredReasons[i], offeredReasons[j]] = [
      offeredReasons[j],
      offeredReasons[i],
    ];
  }
  const initialHigh = rng() >= 0.5;
  const flop = choose([2, 2.5, 3, 3.5, 4]),
    turn = choose([4, 5, 6, 7, 8]);
  const wager = choose([6, 8, 10, 12]),
    rake = choose([0, 0.5]);
  const multi = skill === "multiway-call",
    villain = players === 2 ? 1 : 2;
  const active = multi ? [0, 1, 2] : [0, villain];
  const make = (
    phase: "initial" | "transfer",
    high: boolean,
    suppliedMass?: number,
  ): CashQuestion => {
    const call = skill === "bluff-catch" || multi ? wager : 0;
    const bet = call === 0 ? wager : 0;
    const history: CashHistoryAction[] = [];
    const committed = Array.from({ length: players }, () => 0);
    const streetTotals = new Map<string, number>();
    const add = (
      street: CashHistoryAction["street"],
      seat: number,
      action: CashHistoryAction["action"],
      total = 0,
    ) => {
      const key = `${street}:${seat}`,
        prior = streetTotals.get(key) ?? 0;
      if (total < prior)
        throw new Error("Invalid decreasing street commitment.");
      committed[seat] += total - prior;
      streetTotals.set(key, total);
      history.push({
        street,
        seat,
        action,
        streetTotalBb: total,
        label: `${positionName(seat, 0, players)} ${action}${total ? ` to ${total} BB` : ""}`,
      });
    };
    add("preflop", players === 2 ? 0 : 1, "small-blind", 0.5);
    add("preflop", players === 2 ? 1 : 2, "big-blind", 1);
    for (let seat = 3; seat < players; seat++) add("preflop", seat, "fold");
    add("preflop", 0, "raise", 2.5);
    if (players > 2)
      add("preflop", 1, multi ? "call" : "fold", multi ? 2.5 : 0.5);
    add("preflop", villain, "call", 2.5);
    for (const [street, amount] of [
      ["flop", flop],
      ["turn", turn],
    ] as const) {
      for (const seat of active.filter((s) => s !== 0))
        add(street, seat, "check");
      add(street, 0, "bet", amount);
      for (const seat of active.filter((s) => s !== 0))
        add(street, seat, "call", amount);
    }
    const effective = 100 - committed[0];
    if (call) {
      add("river", multi ? 1 : villain, "bet", call);
      if (multi) add("river", 2, "call", call);
    } else add("river", villain, "check");
    const mass =
      suppliedMass ??
      (high ? choose([0.75, 0.8, 0.85, 0.9]) : choose([0.05, 0.08, 0.1, 0.12]));
    const ranges: CashRange[] = active
      .filter((s) => s !== 0)
      .map((seat) => ({
        seat,
        label: `${positionName(seat, 0, players)} supplied ${call ? (multi && seat === 2 ? "calling" : "betting") : "river"} range`,
        combinations: [
          ...weak.map((cards) => ({
            cards: cards.map(map),
            weight: mass / 3,
            ...(bet
              ? {
                  response:
                    skill === "bluff" ? ("fold" as const) : ("call" as const),
                }
              : {}),
          })),
          ...strong.map((cards) => ({
            cards: cards.map(map),
            weight: (1 - mass) / 3,
            ...(bet ? { response: "call" as const } : {}),
          })),
        ],
      }));
    if (skill === "value-bet") ranges[0].combinations[0].response = "fold";
    return {
      phase,
      skill,
      title: cashSkillLabels[skill],
      tablePlayers: players,
      activePlayers: active.length,
      heroSeat: 0,
      dealerSeat: 0,
      startingStackBb: 100,
      effectiveStackBb: effective,
      seats: committed.map((c, seat) => ({
        seat,
        position: positionName(seat, 0, players),
        label: seat === 0 ? "You" : `Seat ${seat + 1}`,
        status: active.includes(seat) ? "active" : "folded",
        stackBb: 100 - c,
      })),
      hole: [...hole],
      board: [...board],
      potBb: committed.reduce((s, v) => s + v, 0),
      callBb: call,
      betBb: bet,
      rakeBb: rake,
      history,
      ranges,
      options: call
        ? [
            { action: "fold", label: "Fold" },
            { action: "call", label: `Call ${call} BB` },
          ]
        : [
            { action: "check", label: "Check back" },
            { action: "bet", label: `Bet ${bet} BB` },
          ],
      reasons: offeredReasons.map((r) => ({ ...r })),
      estimatePrompt:
        skill === "value-bet"
          ? "What percentage of the supplied calling range is weaker than your hand?"
          : skill === "bluff"
            ? "What minimum fold percentage makes this pure bluff break even?"
            : "What minimum pot-share percentage makes this closing call break even?",
      assumptions: [
        "100 BB starting stacks. All amounts are in big blinds; earlier investments are sunk at this decision.",
        "These weighted ranges are hypothetical study assumptions, not a read of a real opponent or an optimal strategy.",
        multi
          ? "This call closes the river action. All players cover the wager; no side pots or further raises. Range weights multiply before card-collision conditioning; incompatible joint hands are discarded and remaining worlds renormalized."
          : call
            ? "This call closes the river action. No more bets, raises, or side pots."
            : "Checking ends the hand. For the offered bet, each supplied hand responds exactly as shown; there are no raises or further bets.",
        `A fixed ${rake} BB study rake is deducted once from the settled pot in every branch. This is not a site's fee schedule.`,
      ],
      ...(phase === "transfer"
        ? {
            change:
              "Keep the cards, pot, and price. The supplied range weights have changed. Reassess your decision under these new assumptions.",
          }
        : {}),
    };
  };
  const initial = make("initial", initialHigh);
  // Some new ranges retain the same decision: do not teach "always reverse".
  const transferHigh = rng() < 0.75 ? !initialHigh : initialHigh;
  const initialMass = initial.ranges[0].combinations[0].weight * 3;
  const transferMass = choose(
    (transferHigh ? [0.75, 0.8, 0.85, 0.9] : [0.05, 0.08, 0.1, 0.12]).filter(
      (mass) => Math.abs(mass - initialMass) > 1e-9,
    ),
  );
  const transfer = make("transfer", transferHigh, transferMass);
  // Semantic fingerprint ignores suit-only variation and rendered labels.
  const fingerprint = JSON.stringify([
    skill,
    players,
    initial.hole.map((c) => c[0]),
    initial.board.map((c) => c[0]),
    flop,
    turn,
    wager,
    rake,
    initial.ranges.map((r) =>
      r.combinations.map((c) => [
        c.cards.map((s) => s[0]).join(""),
        Number(c.weight.toFixed(5)),
        c.response,
      ]),
    ),
  ]);
  return { version: 1, seed, skill, initial, transfer, fingerprint };
}
