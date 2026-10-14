import { best, compare, validateCards } from "./index";
import { startingHandClass } from "./range-summary";
import { positionName } from "../../shared/src/positions";
import type { DecisionContext } from "../../shared/src/table";
import type { DecisionFrame } from "./table";

const suits: Record<string, string> = {
  c: "clubs",
  d: "diamonds",
  h: "hearts",
  s: "spades",
};

/** Facts about this public decision, independent of bot forecasts and results. */
export function decisionFacts(f: DecisionFrame): DecisionContext {
  const hero = f.players[0];
  validateCards([...hero.hole, ...f.board]);
  const opponents = f.players.filter((p) => p.seat !== 0 && !p.folded);
  const call = Math.min(hero.stack, Math.max(0, f.currentBet - hero.streetBet));
  const playersStillToAct = f.pending.filter(
    (seat) =>
      seat !== 0 && !f.players[seat].folded && f.players[seat].stack > 0,
  ).length;
  const afterCall = hero.contributed + call;
  const matched =
    opponents.length === 1 &&
    hero.streetBet + call === f.currentBet &&
    afterCall === opponents[0].contributed &&
    f.players.filter((p) => p.folded).every((p) => p.contributed <= afterCall);
  const noFutureBets =
    f.street === "river" ||
    hero.stack === call ||
    (opponents.length === 1 && opponents[0].stack === 0);
  const closingCall =
    call > 0 && matched && playersStillToAct === 0 && noFutureBets;
  const callReason = !call
    ? "There is no bet to call; checking costs zero chips."
    : opponents.length !== 1
      ? "Several opponents remain. Other responses and pot eligibility can change the call calculation."
      : !matched
        ? "Contributions do not match for one eligible pot. Side pots or returned excess bets need separate payout calculations."
        : playersStillToAct > 0
          ? "Another player still has an action. A raise can change the price."
          : !noFutureBets
            ? "More streets and betting remain. This call does not buy a guaranteed showdown."
            : "This call closes betting for one eligible pot. Compare expected pot share, including ties, with the call price; odd chips use the actual payout rules.";
  const raises = (f.actions ?? []).filter(
    (a) => a.street === f.street && a.action === "raise",
  ).length;
  const observations: string[] = [];
  let bestFive: string[] | undefined;
  if (!f.board.length) {
    const hand = startingHandClass(hero.hole);
    observations.push(
      `Your starting hand is ${hand}${hand.endsWith("s") ? " (suited)" : hand.endsWith("o") ? " (offsuit)" : " (a pocket pair)"}.`,
    );
    if (raises >= 2)
      observations.push(
        `There have already been ${raises} raises before this decision. An unopened-pot chart does not apply here.`,
      );
    else if (raises === 1)
      observations.push(
        "Someone has already raised. Opening the pot and responding to a raise are different chart situations.",
      );
  } else {
    const hand = best([...hero.hole, ...f.board]);
    bestFive = hand.cards;
    if (f.board.length === 5 && compare(hand, best(f.board)) === 0)
      observations.push(
        hand.category === 8 && hand.kickers[0] === 14
          ? "The royal flush is on the board. Every remaining player ties for first; your hole cards do not change that."
          : "Your hole cards do not improve the river board. Check whether an opponent can improve it; playing the board alone does not prove a tie.",
      );
    const suit = Object.keys(suits).find(
      (s) => f.board.filter((c) => c[1] === s).length >= 3,
    );
    if (suit)
      observations.push(
        `${f.board.filter((c) => c[1] === suit).length} community cards are ${suits[suit]}. A flush is possible; that is not proof an opponent has one.`,
      );
    const paired = f.board.some((c, i) =>
      f.board.some((other, j) => j !== i && other[0] === c[0]),
    );
    if (paired)
      observations.push(
        "The board contains repeated ranks. Include those shared cards when comparing each player's best five.",
      );
    if (hand.category === 5 && paired)
      observations.push(
        "A full house beats a flush. Check which stronger hands remain legal in the opponent's range.",
      );
    if (!observations.length)
      observations.push(
        `You currently have ${hand.name.toLowerCase()}. Compare that made hand with the possible hands shown in the range grid.`,
      );
  }
  const takeaway =
    f.action === "raise"
      ? "A bet's value depends on which hands fold, call, or raise. Use the response breakdown where available; equity alone does not settle it."
      : call
        ? closingCall
          ? "For this closing call, use pot share including ties—not just the chance of winning outright. The range assumption still matters."
          : `The ${call}-chip call price is one part of the decision; later bets or other responses can change its return.`
        : f.action === "fold"
          ? "Checking was free in this situation. Folding ended your chance to win without avoiding an immediate payment."
          : "Checking preserves the option to respond to a later bet. A current made hand is not a guarantee of winning at showdown.";
  return {
    position: positionName(0, f.dealer, f.players.length),
    opponents: opponents.length,
    playersStillToAct,
    stack: hero.stack,
    effectiveStack: Math.min(
      hero.stack,
      Math.max(
        0,
        ...opponents.map((p) => p.stack + p.streetBet - hero.streetBet),
      ),
    ),
    raises,
    closingCall,
    callReason,
    observations,
    takeaway,
    bestFive,
  };
}
