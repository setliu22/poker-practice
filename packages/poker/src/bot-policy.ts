import { best, compare, ranks } from "./index";
import type {
  BotProfile,
  TableAction,
  TableView,
} from "../../shared/src/table";
export type PublicAction = {
  seat: number;
  street: string;
  action: TableAction;
  amount?: number;
};
export type PublicRead = {
  seat: number;
  decisions: number;
  facing: number;
  folds: number;
  calls: number;
  raises: number;
};
export type BotObservation = {
  hole: string[];
  board: string[];
  style: string;
  pot: number;
  currentBet: number;
  streetBet: number;
  playersLeft: number;
  legal: NonNullable<TableView["legal"]>;
  policyVersion?: number;
  botId?: string;
  seat?: number;
  dealer?: number;
  tableSize?: number;
  activeSeats?: number[];
  stack?: number;
  effectiveStack?: number;
  history?: PublicAction[];
  reads?: PublicRead[];
};
type Tuning = {
  tight: number;
  aggression: number;
  bluff: number;
  trap: number;
  draw: number;
  station: number;
  pressure: number;
  adapt: number;
};
type Personality = BotProfile & { tuning: Tuning };
export const personalities: Personality[] = [
  {
    id: "mara",
    name: "Mara",
    style: "Patient trapper",
    summary:
      "Hides some strong hands early and becomes more aggressive on later streets.",
    tendencies: [
      "Checks or calls some very strong hands on safer boards.",
      "Can check-raise after inviting a bet, or raise after an earlier slow-play.",
      "Protects vulnerable hands more often on draw-heavy boards.",
    ],
    adjustment:
      "An early check does not rule out a strong hand. Reassess the board and range when Mara raises.",
    tuning: {
      tight: 0.65,
      aggression: 0.67,
      bluff: 0.08,
      trap: 0.9,
      draw: 0.55,
      station: 0.05,
      pressure: 0.25,
      adapt: 0.1,
    },
  },
  {
    id: "theo",
    name: "Theo",
    style: "Tight-aggressive",
    summary:
      "Selective before the flop; builds pots with strong hands and good draws.",
    tendencies: [
      "Opens wider in late position and defends tighter against repeated raises.",
      "Uses continuation bets selectively, with fewer bluffs against several players.",
      "Often checks medium-strength hands to keep the pot manageable.",
    ],
    adjustment:
      "Respect repeated aggression, but do not assume every bet is value.",
    tuning: {
      tight: 0.7,
      aggression: 0.85,
      bluff: 0.1,
      trap: 0.12,
      draw: 0.65,
      station: 0,
      pressure: 0.3,
      adapt: 0.15,
    },
  },
  {
    id: "juno",
    name: "Juno",
    style: "Loose-aggressive",
    summary:
      "Plays more hands and applies pressure with value, draws, and selected bluffs.",
    tendencies: [
      "Steals more often from late position and re-raises more than the tighter bots.",
      "Can continue betting with draws and missed draws.",
      "Still reduces pure bluffs when multiple opponents remain.",
    ],
    adjustment:
      "Do not judge Juno by a single bluff. Compare your hand with the whole betting range.",
    tuning: {
      tight: 0.25,
      aggression: 1.15,
      bluff: 0.25,
      trap: 0.08,
      draw: 0.85,
      station: 0.12,
      pressure: 0.7,
      adapt: 0.1,
    },
  },
  {
    id: "felix",
    name: "Felix",
    style: "Sticky caller",
    summary: "Continues with more pairs and draws, but raises less often.",
    tendencies: [
      "Calls more marginal hands and tolerates larger call prices.",
      "Prefers calling to raising with many playable hands.",
      "Still bets strong hands; a rare raise often carries more strength.",
    ],
    adjustment:
      "Look for value from weaker calling hands. Bluffs need a believable chance of getting a fold.",
    tuning: {
      tight: 0.18,
      aggression: 0.3,
      bluff: 0.025,
      trap: 0.12,
      draw: 0.55,
      station: 0.8,
      pressure: 0.05,
      adapt: 0,
    },
  },
  {
    id: "iris",
    name: "Iris",
    style: "Selective defender",
    summary:
      "Folds marginal hands readily and commits chips with a narrower range.",
    tendencies: [
      "Plays fewer early-position hands and avoids expensive weak draws.",
      "Gives more credit to large bets and repeated raises.",
      "Occasionally bluffs or traps, so the style is not perfectly predictable.",
    ],
    adjustment:
      "A fold is more plausible than against Felix, but a continuing range can be much stronger.",
    tuning: {
      tight: 1,
      aggression: 0.55,
      bluff: 0.045,
      trap: 0.2,
      draw: 0.3,
      station: 0,
      pressure: 0.12,
      adapt: 0.1,
    },
  },
  {
    id: "nico",
    name: "Nico",
    style: "Draw-focused aggressor",
    summary: "Uses flush and straight draws to mix calls with semi-bluffs.",
    tendencies: [
      "Distinguishes strong draws, weaker draws, and backdoor possibilities.",
      "Prefers deeper stacks and position for speculative hands.",
      "Sometimes bluffs a missed draw, but slows down when the price or board is unfavorable.",
    ],
    adjustment:
      "Separate completed draws from missed draws. A drawing hand can become a bluff or a value hand.",
    tuning: {
      tight: 0.45,
      aggression: 0.85,
      bluff: 0.15,
      trap: 0.08,
      draw: 1.35,
      station: 0.1,
      pressure: 0.4,
      adapt: 0.1,
    },
  },
  {
    id: "sloane",
    name: "Sloane",
    style: "Pressure bettor",
    summary: "Uses a wider mix of bet sizes, including selected overbets.",
    tendencies: [
      "Attacks checked-through streets and some threatening turn or river cards.",
      "Uses large bets mainly with very strong hands or selected low-showdown-value hands.",
      "Adjusts pressure for stack depth, position, and the number of opponents.",
    ],
    adjustment:
      "A large bet is not automatically a strong hand. Work out the price and plausible value/bluff hands.",
    tuning: {
      tight: 0.5,
      aggression: 1,
      bluff: 0.21,
      trap: 0.15,
      draw: 0.75,
      station: 0.02,
      pressure: 1,
      adapt: 0.2,
    },
  },
  {
    id: "remy",
    name: "Remy",
    style: "Adaptive observer",
    summary:
      "Makes gradual adjustments to opponents’ visible calls, folds, and raises.",
    tendencies: [
      "Starts cautiously, then uses smoothed observations from this table.",
      "Bluffs somewhat more against frequent folders and seeks more value against frequent callers.",
      "Respects sustained aggression without treating a short sample as certainty.",
    ],
    adjustment:
      "Avoid repeating an automatic response. Remy remembers public actions across hands at the same table.",
    tuning: {
      tight: 0.6,
      aggression: 0.8,
      bluff: 0.12,
      trap: 0.25,
      draw: 0.7,
      station: 0.03,
      pressure: 0.45,
      adapt: 1,
    },
  },
];
export function publicProfile(id?: string): BotProfile | undefined {
  const p = personalities.find((p) => p.id === id);
  if (!p) return;
  const { tuning, ...profile } = p;
  return profile;
}
const clamp = (n: number, a = 0, b = 1) => Math.max(a, Math.min(b, n));
const sigmoid = (x: number) => 1 / (1 + Math.exp(-x));
function windows(values: number[]) {
  const v = new Set(values);
  if (v.has(14)) v.add(1);
  return Array.from({ length: 10 }, (_, i) =>
    Array.from({ length: 5 }, (_, j) => i + 1 + j),
  ).map((w) => ({ w, present: w.filter((n) => v.has(n)) }));
}
export function boardFeatures(board: string[]) {
  const values = board.map((c) => ranks.indexOf(c[0]) + 2),
    suits = [..."cdhs"].map((s) => board.filter((c) => c[1] === s).length);
  const suitCount = Math.max(0, ...suits),
    connected = Math.max(0, ...windows(values).map((w) => w.present.length));
  return {
    suitCount,
    connected,
    paired: new Set(values).size < values.length,
    wet: clamp(
      (suitCount >= 3 ? 0.65 : suitCount === 2 ? 0.3 : 0) +
        (connected >= 4 ? 0.5 : connected === 3 ? 0.3 : 0),
    ),
    fourFlush: suitCount >= 4,
    fourStraight: connected >= 4,
  };
}
export function handFeatures(hole: string[], board: string[]) {
  const values = hole.map((c) => ranks.indexOf(c[0]) + 2),
    high = Math.max(...values),
    low = Math.min(...values),
    pair = high === low;
  if (!board.length) {
    let strength = pair
      ? 0.48 + high * 0.035
      : 0.16 +
        high * 0.025 +
        low * 0.014 +
        (hole[0][1] === hole[1][1] ? 0.06 : 0) +
        (high - low <= 2 ? 0.025 : 0);
    if (high === 14 && hole[0][1] === hole[1][1] && low <= 5) strength += 0.025;
    if (!pair && hole[0][1] !== hole[1][1] && low < 9 && high >= 12)
      strength -= 0.055;
    return {
      strength: clamp(strength),
      draw: 0,
      flushDraw: false,
      nutFlushDraw: false,
      straightOutRanks: 0,
      backdoor: false,
      monster: pair && high >= 12,
      playsBoard: false,
      lockedBoard: false,
      royalFlush: false,
    };
  }
  const h = best([...hole, ...board]),
    bv = board.map((c) => ranks.indexOf(c[0]) + 2),
    top = Math.max(...bv);
  const boardCount = (rank: number) => bv.filter((v) => v === rank).length;
  let strength: number;
  if (h.category >= 6) strength = 0.94 + (h.category - 6) * 0.025;
  else if (h.category === 5) {
    const suit = h.cards[0][1];
    strength =
      0.84 +
      (Math.max(
        0,
        ...hole
          .filter((c) => c[1] === suit)
          .map((c) => ranks.indexOf(c[0]) + 2),
      ) /
        14) *
        0.09;
  } else if (h.category === 4) strength = 0.81 + (h.kickers[0] / 14) * 0.05;
  else if (h.category === 3)
    strength =
      boardCount(h.kickers[0]) === 3 ? 0.38 + (high / 14) * 0.09 : 0.82;
  else if (h.category === 2)
    strength =
      boardCount(h.kickers[0]) === 2 && boardCount(h.kickers[1]) === 2
        ? 0.35 + (high / 14) * 0.09
        : 0.75;
  else if (h.category === 1) {
    const pr = h.kickers[0];
    strength =
      pair && pr > top
        ? 0.69
        : hole.some((c) => ranks.indexOf(c[0]) + 2 === pr)
          ? pr === top
            ? 0.59 + (h.kickers[1] / 14) * 0.08
            : pr >= [...new Set(bv)].sort((a, b) => b - a)[1]
              ? 0.44
              : 0.33
          : 0.15 + (high / 14) * 0.1;
  } else strength = 0.09 + (high / 14) * 0.12;
  const texture = boardFeatures(board),
    playsBoard = board.length === 5 && compare(h, best(board)) === 0,
    royalFlush = h.category === 8 && h.kickers[0] === 14;
  // These shared board hands cannot lose to any legal two-card holding.
  // An ace-high straight is protected only when no flush can be completed.
  const lockedBoard =
    playsBoard &&
    ((h.category === 8 && h.kickers[0] === 14) ||
      (h.category === 7 && h.kickers[1] === 14) ||
      (h.category === 4 && h.kickers[0] === 14 && texture.suitCount < 3));
  if (playsBoard) strength = lockedBoard ? 0.5 : 0.23;
  if (texture.fourFlush && h.category < 5) strength -= 0.15;
  if (texture.fourStraight && h.category < 4) strength -= 0.12;
  if (texture.paired && h.category === 5) strength -= 0.04;
  const all = [...hole, ...board],
    suitCounts = [..."cdhs"].map((s) => ({
      s,
      n: all.filter((c) => c[1] === s).length,
    }));
  const drawSuit = suitCounts.find(
      ({ s, n }) => n === 4 && hole.some((c) => c[1] === s),
    ),
    flushDraw = board.length < 5 && h.category < 5 && !!drawSuit;
  // The nut draw uses the highest suited rank that is not already on the board;
  // for example K♥ is the nut-flush draw when A♥ is a community card.
  const highestUnboardedSuitRank = drawSuit
    ? [...ranks].reverse().find((rank) => !board.includes(rank + drawSuit.s))
    : undefined;
  const nutFlushDraw =
    flushDraw && hole.includes(highestUnboardedSuitRank + drawSuit!.s);
  const straightMissing = new Set<number>();
  if (board.length < 5 && h.category < 4)
    for (const { w, present } of windows([...values, ...bv]))
      if (
        present.length === 4 &&
        values.some(
          (v) =>
            !bv.includes(v) &&
            (present.includes(v) || (v === 14 && present.includes(1))),
        )
      )
        straightMissing.add(w.find((v) => !present.includes(v))!);
  const backdoor =
    board.length === 3 &&
    suitCounts.some(({ s, n }) => n === 3 && hole.some((c) => c[1] === s)) &&
    !flushDraw;
  const draw =
    (flushDraw ? 0.18 : 0) +
    (nutFlushDraw ? 0.035 : 0) +
    (straightMissing.size >= 2
      ? 0.14
      : straightMissing.size === 1
        ? 0.055
        : 0) +
    (backdoor ? 0.018 : 0);
  return {
    strength: clamp(strength),
    draw,
    flushDraw,
    nutFlushDraw,
    straightOutRanks: straightMissing.size,
    backdoor,
    monster: strength >= 0.8 && !playsBoard,
    playsBoard,
    lockedBoard,
    royalFlush,
  };
}
export function contextualDistribution(
  o: BotObservation,
): { action: TableAction; amount?: number; probability: number }[] {
  const p = personalities.find((p) => p.id === o.botId) ?? personalities[1],
    t = p.tuning;
  const seat = o.seat ?? 0,
    dealer = o.dealer ?? 0,
    n = o.tableSize ?? o.playersLeft,
    history = o.history ?? [];
  const street =
    o.board.length === 0
      ? "preflop"
      : o.board.length === 3
        ? "flop"
        : o.board.length === 4
          ? "turn"
          : "river";
  const current = history.filter((a) => a.street === street),
    raises = current.filter((a) => a.action === "raise");
  const prior = history.filter((a) => a.street !== street),
    lastAggressor = prior.filter((a) => a.action === "raise").at(-1)?.seat;
  const live =
    o.activeSeats ?? Array.from({ length: o.playersLeft }, (_, i) => i);
  const order = [...live].sort(
    (a, b) => ((a - dealer - 1 + n) % n) - ((b - dealer - 1 + n) % n),
  );
  const position = clamp(order.indexOf(seat) / Math.max(1, order.length - 1)),
    inPosition = order.at(-1) === seat;
  const bigBlind = (dealer + (n === 2 ? 1 : 2)) % n,
    preIndex = (seat - bigBlind - 1 + n) % n;
  const late = seat === dealer || seat === (dealer - 1 + n) % n || n === 2;
  const f = handFeatures(o.hole, o.board),
    texture = boardFeatures(o.board),
    multi = Math.max(0, o.playersLeft - 2);
  const stack = o.stack ?? o.legal.maxRaiseTo - o.streetBet,
    effective = o.effectiveStack ?? stack,
    spr = effective / Math.max(10, o.pot);
  const price = o.legal.toCall / (o.pot + o.legal.toCall || 1),
    betPressure = o.legal.toCall / Math.max(10, o.pot - o.legal.toCall);
  // Smoothed public behavior prevents a single fold or call from defining an opponent.
  const others = (o.reads ?? []).filter(
    (r) => r.seat !== seat && live.includes(r.seat),
  );
  const faced = others.reduce((a, r) => a + r.facing, 0),
    folds = others.reduce((a, r) => a + r.folds, 0),
    calls = others.reduce((a, r) => a + r.calls, 0);
  const aggressionRead =
    (others.reduce((n, r) => n + r.raises, 0) + 2) /
    (others.reduce((n, r) => n + r.decisions, 0) + 10);
  const foldRead = (folds + 4) / (faced + 10),
    callRead = (calls + 4) / (faced + 10);
  const adaptation = t.adapt * clamp(faced / 30),
    overfold = adaptation * (foldRead - 0.4),
    sticky = adaptation * (callRead - 0.4);
  const checkedBefore = current.some(
    (a) => a.seat === seat && a.action === "check",
  );
  const ownPassiveEarlier = prior.some(
    (a) => a.seat === seat && (a.action === "check" || a.action === "call"),
  );
  const previousBoard = o.board.slice(0, o.board.length === 5 ? 4 : 3);
  const previous =
    o.board.length >= 4 ? handFeatures(o.hole, previousBoard) : null;
  const trapLine =
    !!previous?.monster &&
    prior.some(
      (a) =>
        a.seat === seat &&
        a.street === (street === "river" ? "turn" : "flop") &&
        (a.action === "check" || a.action === "call"),
    );
  const missedDraw =
    street === "river" &&
    !!previous &&
    (previous.flushDraw || previous.straightOutRanks > 0) &&
    f.strength < 0.4;
  const aceBlocker = o.hole.some(
    (c) => c[0] === "A" && o.board.filter((b) => b[1] === c[1]).length >= 3,
  );
  const scare =
    street === "turn" || street === "river"
      ? o.board.at(-1)![0] === "A" || texture.fourFlush || texture.fourStraight
      : false;
  let callProbability: number, raiseProbability: number;
  if (street === "preflop") {
    const required =
      0.46 +
      t.tight * 0.12 -
      (late ? 0.07 : 0) +
      raises.length * 0.075 +
      (preIndex < Math.max(1, n - 4) && n > 3 ? 0.035 : 0);
    const playability =
      (o.hole[0][1] === o.hole[1][1] && spr > 5 ? 0.025 : 0) +
      (seat === bigBlind ? 0.035 : 0);
    callProbability =
      sigmoid((f.strength + playability - required - price * 0.18) * 17) +
      t.station * 0.26;
    const value = sigmoid((f.strength - required - 0.035) * 18);
    raiseProbability = clamp(
      value * t.aggression * 0.76 +
        (late && !raises.length ? t.pressure * 0.12 : 0) +
        t.bluff * (o.hole.some((c) => c[0] === "A") ? 0.14 : 0.025),
    );
    if (raises.length >= 2) raiseProbability *= f.strength > 0.87 ? 1 : 0.28;
  } else {
    const strength = clamp(
      f.strength - multi * 0.035 - (raises.length > 1 ? 0.065 : 0),
    );
    const drawValue =
      f.draw * t.draw * (spr > 2 ? 1 : 0.65) * (inPosition ? 1.1 : 0.85);
    const required =
      0.26 +
      t.tight * 0.12 +
      price * 0.65 +
      multi * 0.025 +
      adaptation * (0.2 - aggressionRead) * 0.12 +
      Math.max(0, raises.length - 1) * 0.04 +
      (betPressure > 1 ? 0.06 : 0);
    callProbability =
      sigmoid((strength + drawValue - required) * 15) + t.station * 0.28;
    if (spr > 5 && f.strength < 0.4 && f.draw && price > 0.3)
      callProbability *= 0.8;
    const value = sigmoid((strength - 0.71) * 17) * t.aggression;
    const bluff =
      t.bluff *
      (f.strength < 0.35 ? 1 : 0.12) *
      (1 +
        position * 0.3 +
        (aceBlocker ? 0.5 : 0) +
        (scare ? t.pressure * 0.4 : 0) +
        (missedDraw ? 0.25 : 0)) *
      Math.pow(0.5, multi) *
      (1 + overfold * 2 - sticky * 1.5);
    const semi = f.draw * t.draw * 0.85 * Math.pow(0.7, multi);
    if (o.legal.toCall) {
      raiseProbability = value * 0.6 + semi * 0.48 + bluff * 0.35;
      if (checkedBefore)
        raiseProbability += t.trap * (f.monster ? 0.24 : f.draw * 0.18);
      if (street === "river" && trapLine) raiseProbability += t.trap * 0.22;
    } else {
      raiseProbability = value * 0.8 + semi + bluff;
      if (lastAggressor === seat && street === "flop" && raises.length === 0)
        raiseProbability +=
          0.12 * t.aggression * (1 - texture.wet * 0.5) * Math.pow(0.6, multi);
      if (
        lastAggressor === seat &&
        (street === "turn" || street === "river") &&
        (f.draw > 0.1 || aceBlocker)
      )
        raiseProbability += 0.1 * t.aggression * Math.pow(0.6, multi);
      if (street === "turn" && ownPassiveEarlier && raises.length === 0)
        raiseProbability += t.pressure * 0.12 * (inPosition ? 1 : 0.65);
      if (f.strength > 0.4 && f.strength < 0.72) raiseProbability *= 0.55; // Preserve showdown value rather than automatically inflate the pot.
      if (street === "river" && trapLine) raiseProbability += t.trap * 0.3;
    }
    if (street !== "river" && f.monster && texture.wet < 0.6 && spr > 1.5)
      raiseProbability *= 1 - t.trap * (street === "flop" ? 0.88 : 0.72);
    if (street !== "river" && texture.wet >= 0.6 && f.monster)
      raiseProbability += 0.14; // Trapping is less attractive on a vulnerable board.
    if (spr < 1.4 && strength > 0.69) raiseProbability += 0.15;
    if (texture.wet > 0.6 && f.strength < 0.72 && f.draw === 0)
      raiseProbability *= 0.6;
    raiseProbability *=
      1 +
      sticky * (f.strength > 0.72 ? 1.5 : -1) +
      overfold * (f.strength < 0.35 ? 1 : 0);
    if (f.playsBoard) raiseProbability *= 0.03;
  }
  // A made royal flush cannot lose, even with community cards still to come.
  // Keep value raises available when it uses private cards; a shared locked
  // board remains a check/call because no opponent can have a weaker hand.
  callProbability =
    f.lockedBoard || f.royalFlush ? 1 : clamp(callProbability, 0.005, 0.995);
  raiseProbability =
    o.legal.canRaise && !f.lockedBoard
      ? clamp(raiseProbability, 0.002, 0.94)
      : 0;
  // Three size families share support for value and bluffs. Merge sizes clipped to the same legal amount.
  const candidates: { amount: number; weight: number }[] = [];
  if (raiseProbability > 0) {
    if (street === "preflop") {
      const limpers = current.filter((a) => a.action === "call").length;
      const base =
        raises.length === 0
          ? 25 + limpers * 10 + (inPosition ? 0 : 5)
          : o.currentBet * (inPosition ? 3 : 4) + limpers * 10;
      candidates.push(
        { amount: base * 0.9, weight: 0.2 },
        { amount: base, weight: 0.6 },
        { amount: base * 1.2, weight: 0.2 },
      );
    } else {
      const polarized = f.strength >= 0.8 || f.strength < 0.35,
        largeWeight = polarized ? 0.22 + t.pressure * 0.25 : 0.06;
      const base = o.pot + o.legal.toCall;
      candidates.push(
        {
          amount: o.currentBet + base * 0.33,
          weight: f.strength > 0.4 && f.strength < 0.72 ? 0.65 : 0.32,
        },
        { amount: o.currentBet + base * 0.7, weight: 0.48 },
        {
          amount: o.currentBet + base * (t.pressure > 0.65 ? 1.25 : 1),
          weight: largeWeight,
        },
      );
    }
    if (
      spr < 2 &&
      (f.monster || f.draw > 0.18 || (t.pressure > 0.65 && f.strength < 0.3))
    )
      candidates.push({ amount: o.legal.maxRaiseTo, weight: 0.4 });
  }
  const sizeSum = candidates.reduce((n, c) => n + c.weight, 0),
    sizes = new Map<number, number>();
  for (const c of candidates) {
    const amount = Math.round(
      clamp(c.amount, o.legal.minRaiseTo, o.legal.maxRaiseTo),
    );
    sizes.set(
      amount,
      (sizes.get(amount) ?? 0) + (raiseProbability * c.weight) / sizeSum,
    );
  }
  const rest = 1 - raiseProbability;
  const choices: {
    action: TableAction;
    amount?: number;
    probability: number;
  }[] = [...sizes].map(([amount, probability]) => ({
    action: "raise",
    amount,
    probability,
  }));
  if (o.legal.toCall)
    choices.push(
      { action: "call", probability: rest * callProbability },
      { action: "fold", probability: rest * (1 - callProbability) },
    );
  else choices.push({ action: "check", probability: rest });
  return choices;
}
