import { best, compare, deck, random, validateCards } from "./index";
import type { DecisionFrame } from "./table";
import type { ProbabilityReview, LiveOdds } from "../../shared/src/table";
export type Combo = { cards: string[]; weight: number };
export function shuffle<T>(items: T[], rng: () => number) {
  const a = [...items];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}
export function sampleHoles(
  f: DecisionFrame,
  ranges: Map<number, Combo[]>,
  rng: () => number,
) {
  // Independent range draws, rejecting the entire tuple on collision, sample
  // the product of action likelihoods conditioned on a legal deal. Sequentially
  // renormalizing later seats would bias this joint distribution.
  let holes = new Map<number, string[]>();
  let used = new Set<string>();
  let accepted = false;
  for (let attempt = 0; attempt < 2000; attempt++) {
    holes = new Map([[0, f.players[0].hole]]);
    used = new Set([...f.board, ...f.players[0].hole]);
    let collision = false;
    for (const [seat, combos] of ranges) {
      const sum = combos.reduce((n, c) => n + c.weight, 0);
      let roll = rng() * sum;
      let selected = combos[combos.length - 1];
      for (const c of combos) {
        roll -= c.weight;
        if (roll <= 0) {
          selected = c;
          break;
        }
      }
      if (!selected || selected.cards.some((card) => used.has(card))) {
        collision = true;
        break;
      }
      holes.set(seat, selected.cards);
      selected.cards.forEach((card) => used.add(card));
    }
    if (!collision) {
      accepted = true;
      break;
    }
  }
  if (!accepted) return null;
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
export function outcome(
  hero: string[],
  opponents: string[][],
  board: string[],
) {
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

type Trial = ReturnType<typeof outcome> & { weight: number };
type Options = { actual?: boolean; samples?: number; exactLimit?: number };

// Shared by completed-hand reviews and live odds. No betting takes place here.
function trials(
  f: DecisionFrame,
  input: Map<number, Combo[]>,
  seed: number,
  options: Options,
) {
  validateCards([...f.players[0].hole, ...f.board]);
  if (f.players[0].hole.length !== 2 || ![0, 3, 4, 5].includes(f.board.length))
    throw new Error("Use two hole cards and a legal Hold’em board.");
  const seats = f.players
    .filter((p) => p.seat !== 0 && !p.folded)
    .map((p) => p.seat);
  const actual = options.actual ?? false;
  const ranges = new Map<number, Combo[]>();
  if (!actual)
    for (const seat of seats) {
      const combos = input.get(seat);
      if (!combos?.length)
        throw new Error("Each competing opponent needs a nonempty range.");
      const legal = combos.filter((c) => {
        validateCards(c.cards, 2, 2);
        if (!Number.isFinite(c.weight) || c.weight < 0)
          throw new Error("Range weights must be finite and nonnegative.");
        return (
          c.weight > 0 &&
          !c.cards.some((card) =>
            [...f.players[0].hole, ...f.board].includes(card),
          )
        );
      });
      const mass = legal.reduce((sum, c) => sum + c.weight, 0);
      if (!mass)
        throw new Error(
          "All opponent combinations are blocked or have zero weight.",
        );
      ranges.set(
        seat,
        legal.map((c) => ({ cards: c.cards, weight: c.weight / mass })),
      );
    }
  const rng = random(seed);
  const evaluate = (
    holes: Map<number, string[]>,
    board: string[],
    weight = 1,
  ): Trial => ({
    ...outcome(
      f.players[0].hole,
      seats.map((seat) => holes.get(seat)!),
      board,
    ),
    weight,
  });
  const count = options.samples ?? 400;
  if (!Number.isInteger(count) || count < 1)
    throw new Error("Use a positive simulation count.");
  const knownRoyal =
    f.board.length === 5 &&
    best(f.board).category === 8 &&
    best(f.board).kickers[0] === 14;
  const headsUp = !actual && seats.length === 1;
  const combinations = headsUp ? ranges.get(seats[0])! : [];
  const enumerateTurn =
    headsUp &&
    f.board.length === 4 &&
    combinations.length * 44 <= (options.exactLimit ?? 0);
  const exact =
    (actual && f.board.length >= 4) ||
    (!actual && knownRoyal) ||
    (headsUp && f.board.length === 5) ||
    enumerateTurn;
  function* generate(): Generator<Trial> {
    if (actual && f.board.length >= 4) {
      const holes = new Map(f.players.map((p) => [p.seat, p.hole]));
      validateCards([...f.board, ...[...holes.values()].flat()]);
      const remaining = deck.filter(
        (c) => !f.board.includes(c) && ![...holes.values()].flat().includes(c),
      );
      if (f.board.length === 5) yield evaluate(holes, f.board);
      else
        for (const card of remaining) yield evaluate(holes, [...f.board, card]);
    } else if (!actual && knownRoyal) {
      // Validate that the supplied ranges admit at least one jointly legal deal.
      if (!sampleHoles(f, ranges, rng))
        throw new Error("Opponent ranges do not admit a legal joint deal.");
      yield {
        win: seats.length ? 0 : 1,
        tie: seats.length ? 1 : 0,
        lose: 0,
        share: 1 / (seats.length + 1),
        weight: 1,
      };
    } else if (headsUp && (f.board.length === 5 || enumerateTurn)) {
      for (const combo of combinations) {
        const holes = new Map([
          [0, f.players[0].hole],
          [seats[0], combo.cards],
        ]);
        if (f.board.length === 5) yield evaluate(holes, f.board, combo.weight);
        else {
          const remaining = deck.filter(
            (c) =>
              ![...f.board, ...f.players[0].hole, ...combo.cards].includes(c),
          );
          for (const card of remaining)
            yield evaluate(
              holes,
              [...f.board, card],
              combo.weight / remaining.length,
            );
        }
      }
    } else
      for (let i = 0; i < count; i++) {
        const holes = actual
          ? new Map(f.players.map((p) => [p.seat, p.hole]))
          : sampleHoles(f, ranges, rng);
        if (!holes)
          throw new Error("Unable to sample a legal joint opponent range.");
        const used = [...f.board, ...[...holes.values()].flat()];
        const board = [
          ...f.board,
          ...shuffle(
            deck.filter((c) => !used.includes(c)),
            rng,
          ).slice(0, 5 - f.board.length),
        ];
        yield evaluate(holes, board);
      }
  }
  return { exact, generate: generate() };
}

function accumulator() {
  const sums = { win: 0, tie: 0, lose: 0, share: 0 };
  let mass = 0,
    samples = 0;
  return {
    add(t: Trial) {
      for (const key of ["win", "tie", "lose", "share"] as const)
        sums[key] += t[key] * t.weight;
      mass += t.weight;
      samples++;
    },
    finish(exact: boolean): ProbabilityReview {
      if (!mass) throw new Error("No legal showdown outcomes.");
      return {
        win: (100 * sums.win) / mass,
        tie: (100 * sums.tie) / mass,
        lose: (100 * sums.lose) / mass,
        share: (100 * sums.share) / mass,
        exact,
        samples: exact ? 0 : samples,
        note: exact
          ? "Enumerated outcomes under the supplied ranges."
          : `Approximate estimate from ${samples.toLocaleString("en-US")} simulated showdowns.`,
      };
    },
  };
}

export function probability(
  f: DecisionFrame,
  ranges: Map<number, Combo[]>,
  seed: number,
  actual = false,
): ProbabilityReview {
  const simulation = trials(f, ranges, seed, { actual });
  const totals = accumulator();
  for (const trial of simulation.generate) totals.add(trial);
  return totals.finish(simulation.exact);
}

// Wilson intervals remain nonzero even when a sampled outcome never occurs.
export function binomialInterval(
  percent: number,
  count: number,
): [number, number] {
  const p = percent / 100,
    z = 1.96,
    denominator = 1 + (z * z) / count;
  const center = (p + (z * z) / (2 * count)) / denominator;
  const half =
    (z * Math.sqrt((p * (1 - p)) / count + (z * z) / (4 * count * count))) /
    denominator;
  return [
    Math.max(0, 100 * (center - half)),
    Math.min(100, 100 * (center + half)),
  ];
}

export const LIVE_ODDS_SAMPLES = 6000;
export async function estimateShowdown(
  f: DecisionFrame,
  ranges: Map<number, Combo[]>,
  seed: number,
  options: { samples?: number; signal?: AbortSignal } = {},
): Promise<ProbabilityReview & { intervals: LiveOdds["intervals"] }> {
  const simulation = trials(f, ranges, seed, {
    samples: options.samples ?? LIVE_ODDS_SAMPLES,
    exactLimit: 5000,
  });
  const totals = accumulator();
  let count = 0;
  for (const trial of simulation.generate) {
    if (options.signal?.aborted) throw new Error("Odds calculation cancelled.");
    totals.add(trial);
    // Cooperatively yield so a calculation cannot block other API requests.
    if (++count % 64 === 0)
      await new Promise<void>((resolve) => setImmediate(resolve));
  }
  const result = totals.finish(simulation.exact);
  // Share is bounded in [0,1], but is not binary in multiway ties. Hoeffding's
  // finite-sample 95% bound avoids pretending its variance is binomial or zero.
  const shareMargin = result.exact
    ? 0
    : 100 * Math.sqrt(Math.log(40) / (2 * result.samples));
  return {
    ...result,
    intervals: {
      win: result.exact
        ? [result.win, result.win]
        : binomialInterval(result.win, result.samples),
      tie: result.exact
        ? [result.tie, result.tie]
        : binomialInterval(result.tie, result.samples),
      share: [
        Math.max(0, result.share - shareMargin),
        Math.min(100, result.share + shareMargin),
      ],
    },
  };
}
