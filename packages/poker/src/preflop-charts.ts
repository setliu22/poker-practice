import { z } from "zod";
import importedOpenings from "../data/preflop/openings.json";
import type { OpeningChart, PreflopGuide } from "../../shared/src/preflop";
import { positionName } from "../../shared/src/positions";
import { validateCards } from "./index";
import { rangeRanks, startingHandClass } from "./range-summary";
import type { DecisionFrame, TableState } from "./table";

const gridHands = [...rangeRanks].flatMap((row, rowIndex) =>
  [...rangeRanks].map((column, columnIndex) =>
    rowIndex === columnIndex
      ? row + column
      : rowIndex < columnIndex
        ? row + column + "s"
        : column + row + "o",
  ),
);

// Only these directly authored source definitions are included. In particular,
// do not import upstream get_range_key's fallback to the widest button chart.
const sourcePositions: Record<string, string> = {
  "2_BTN": "Button · Small blind",
  "6_UTG": "Lojack",
  "6_HJ": "Hijack",
  "6_CO": "Cutoff",
  "6_BTN": "Button",
  "6_SB": "Small blind",
  "9_UTG": "Under the gun",
  "9_UTG+1": "Under the gun + 1",
  "9_UTG+2": "Under the gun + 2",
  "9_MP": "Lojack",
  "9_HJ": "Hijack",
  "9_CO": "Cutoff",
  "9_BTN": "Button",
  "9_SB": "Small blind",
};

const sourceChartSchema = z
  .object({
    sourceKey: z.string(),
    players: z.union([z.literal(2), z.literal(6), z.literal(9)]),
    position: z.string(),
    hands: z
      .array(z.string().refine((hand) => gridHands.includes(hand)))
      .min(1)
      .max(169)
      .refine((hands) => new Set(hands).size === hands.length),
  })
  .strict()
  .refine(
    (chart) =>
      sourcePositions[chart.sourceKey] === chart.position &&
      Number(chart.sourceKey.split("_")[0]) === chart.players,
    "The source definition must match its documented table size and position.",
  );

const sourceCharts = z
  .array(sourceChartSchema)
  .length(14)
  .refine(
    (charts) => new Set(charts.map((chart) => chart.sourceKey)).size === 14,
    "Every direct source definition must appear exactly once.",
  )
  .parse(importedOpenings);

const source = {
  name: "PreflopR · authored opening ranges",
  url: "https://github.com/bmorrow10/preflopR/tree/aed511d0451aea33a14f7e9204595fc2211f233f",
  license: "MIT",
  revision: "aed511d0451aea33a14f7e9204595fc2211f233f",
};
const note =
  "An illustrative opening baseline, not a solved recommendation or a winning probability. Chart agreement is not a skill score.";

/** Licensed, local raise/fold baselines. No network or solver is used. */
export const openingCharts: OpeningChart[] = sourceCharts.map((definition) => {
  const raiseHands = new Set(definition.hands);
  const raiseToBb = definition.position === "Small blind" ? 3 : 2.5;
  const combinations = definition.hands.reduce(
    (total, hand) =>
      total + (hand.length === 2 ? 6 : hand.endsWith("s") ? 4 : 12),
    0,
  );
  return {
    id: `preflopr-${definition.sourceKey.toLowerCase().replaceAll("+", "plus")}`,
    title: `${definition.players} players · ${definition.position}`,
    players: definition.players,
    position: definition.position,
    status: "illustrative",
    source: { ...source },
    assumptions: [
      "App context: blinds 5/10, 1,000-chip starting stacks (100 big blinds), no antes or rake.",
      "Before the flop, on your first action, with everyone before you folding and only the blinds in the pot.",
      `App opening size: raise to ${raiseToBb} big blinds (${raiseToBb * 10} chips). The source does not specify this size.`,
      "A simple raise-or-fold baseline; it does not include limping or mixed actions.",
      ...(definition.sourceKey === "6_UTG"
        ? [
            "The first seat to act at six players is called UTG in the source and Lojack in this app; these refer to the same seat.",
          ]
        : definition.sourceKey === "9_MP"
          ? [
              "The seat three places before the button is called MP in the source and Lojack in this app.",
            ]
          : []),
    ],
    limitations: [
      "Author-defined ranges, not solver-derived or expert-verified. This is educational guidance, not proof of the most profitable action.",
      "Source stack depth, rake, antes and bet sizes are unspecified. The app context above is an explicit assumption, not a verified strategy match.",
      "Only directly provided 2-, 6- and 9-player opening definitions are included. No fallback chart is used for other situations.",
      "Opponents can respond differently. A departure from this chart is not automatically a mistake and is never used as a skill grade.",
    ],
    raiseToBb,
    openPercent: (combinations / 1326) * 100,
    cells: gridHands.map((hand) => ({
      hand,
      action: raiseHands.has(hand) ? "raise" : "fold",
    })),
  };
});

function match(frame: DecisionFrame, compareAction: boolean): PreflopGuide {
  let hand = "—";
  let position = "Unknown";
  const unavailable = (reason: string): PreflopGuide => ({
    status: "unavailable",
    hand,
    position,
    note,
    reason,
  });
  const count = frame.players.length;
  try {
    position = positionName(0, frame.dealer, count);
    validateCards([...frame.players[0].hole, ...frame.board], 2, 7);
    hand = startingHandClass(frame.players[0].hole);
  } catch {
    return unavailable(
      "The public cards, table size or dealer position are invalid.",
    );
  }
  if (frame.street !== "preflop" || frame.board.length)
    return unavailable(
      "No matching chart: this library covers unopened preflop decisions, not later streets.",
    );
  if (position === "Big blind")
    return unavailable(
      "No matching chart: a big-blind check or defence is a different situation from opening an unopened pot.",
    );
  if (!Array.isArray(frame.actions))
    return unavailable(
      "No matching chart: complete public action history is needed to verify an unopened pot.",
    );
  if (frame.actions.some((action) => action.seat === 0))
    return unavailable(
      "No matching chart: this is not your first action in the hand.",
    );
  if (frame.actions.some((action) => action.action === "raise"))
    return unavailable(
      "No matching chart: someone has already raised. Responding to a raise needs a different chart.",
    );
  if (frame.actions.some((action) => action.action === "call"))
    return unavailable(
      "No matching chart: someone has limped or called. This guide requires everyone before you to fold.",
    );
  if (![2, 6, 9].includes(count))
    return unavailable(
      `No matching chart for ${count} players. The local library includes direct 2-, 6- and 9-player definitions only.`,
    );

  const smallBlind = count === 2 ? frame.dealer : (frame.dealer + 1) % count;
  const bigBlind = (smallBlind + 1) % count;
  // Public betting order starts left of the big blind (at the button heads-up).
  const order = Array.from(
    { length: count },
    (_, index) => (bigBlind + 1 + index) % count,
  );
  const earlierSeats = order.slice(0, order.indexOf(0));
  const foldedSeats = new Set(earlierSeats);
  const expectedPending = order.filter((seat) => !foldedSeats.has(seat));
  if (
    frame.currentBet !== 10 ||
    frame.minRaise !== 10 ||
    frame.eventCount !== earlierSeats.length ||
    frame.actions.length !== earlierSeats.length ||
    frame.actions.some(
      (action, index) =>
        action.street !== "preflop" ||
        action.action !== "fold" ||
        action.seat !== earlierSeats[index] ||
        action.amount !== undefined,
    ) ||
    frame.lastActBet.length !== count ||
    frame.lastActBet.some((bet, seat) =>
      foldedSeats.has(seat) ? bet !== 10 : bet !== null,
    ) ||
    frame.pending.length !== expectedPending.length ||
    new Set(frame.pending).size !== frame.pending.length ||
    frame.pending.some((seat) => !expectedPending.includes(seat))
  )
    return unavailable(
      "No matching chart: the public action history does not verify a first decision in a folded-to, unopened pot.",
    );
  // Reading these public fields deliberately avoids opponents' hole cards.
  for (let seat = 0; seat < count; seat++) {
    const player = frame.players[seat];
    const blind = seat === smallBlind ? 5 : seat === bigBlind ? 10 : 0;
    if (
      player.seat !== seat ||
      player.folded !== foldedSeats.has(seat) ||
      player.allIn ||
      player.streetBet !== blind ||
      player.contributed !== blind ||
      player.stack !== 1000 - blind ||
      player.payout !== 0
    )
      return unavailable(
        "No matching chart: this baseline requires the app's 100-big-blind starting stacks and only the 5/10 blinds committed, without antes or rake.",
      );
  }
  const chart = openingCharts.find(
    (candidate) =>
      candidate.players === count && candidate.position === position,
  );
  if (!chart)
    return unavailable(
      "No matching opening chart for this table size and position.",
    );
  const suggestedAction = chart.cells.find(
    (cell) => cell.hand === hand,
  )!.action;
  const raiseTo =
    suggestedAction === "raise" ? chart.raiseToBb * 10 : undefined;
  const result: PreflopGuide = {
    status: "available",
    hand,
    position,
    note,
    chart,
    suggestedAction,
    ...(raiseTo !== undefined ? { raiseTo } : {}),
  };
  if (compareAction) {
    const matches = frame.action === suggestedAction;
    const comparison = matches
      ? frame.action === "raise" && frame.amount !== raiseTo
        ? `You raised to ${frame.amount} chips. This agrees with the baseline's raise action; its app-selected opening size is ${raiseTo} chips. The chart does not compare the value of different sizes.`
        : `Your ${frame.action} agrees with the baseline for ${hand} from ${position}. This agreement is not proof of the best action.`
      : `You chose ${frame.action}${frame.action === "raise" ? ` to ${frame.amount} chips` : ""}; the baseline suggests ${suggestedAction}${raiseTo !== undefined ? ` to ${raiseTo} chips` : ""} for ${hand} from ${position}. This is a chart departure, not a calculated mistake or skill grade.`;
    result.comparison = {
      chosenAction: frame.action,
      matches,
      explanation: comparison,
    };
  }
  return result;
}

/** Review a decision from its before-action public snapshot. */
export function preflopGuide(frame: DecisionFrame): PreflopGuide {
  return match(frame, true);
}

/** Read-only guide: never reads private opponent cards, runout or review data. */
export function livePreflopGuide(state: TableState): PreflopGuide {
  if (state.complete || state.actor !== 0)
    return {
      status: "unavailable",
      hand: "—",
      position: "Unknown",
      note,
      reason:
        "The guide is available when it is your turn during an active hand.",
    };
  return match(
    {
      id: 0,
      street: state.street,
      board: state.board,
      players: state.players,
      dealer: state.dealer,
      currentBet: state.currentBet,
      minRaise: state.minRaise,
      pending: state.pending,
      lastActBet: state.lastActBet,
      action: "check",
      eventCount: state.policyEvents?.length ?? 0,
      actions: state.actions,
    },
    false,
  );
}
