import type { Exercise, Feedback } from "../../../packages/shared/src/index";
type Scenario = {
  exercise: Omit<Exercise, "id" | "mode">;
  accepted: string[];
  feedback: Feedback;
};
const scenarios: Scenario[] = [];
function add(
  id: string,
  hero: string,
  board: string,
  context: string[],
  assumptions: string[],
  options: string[],
  accepted: string[],
  objective: string,
  explanation: string,
  kind: Feedback["kind"] = "illustrative",
  calculation?: string,
) {
  scenarios.push({
    exercise: {
      sourceId: id,
      question: "Which action would you choose under these assumptions?",
      hero: hero.split(" "),
      board: board.split(" "),
      context,
      assumptions,
      options,
      objective,
      tags: [objective],
      provenance: "original educational example",
      limitations:
        "Simplified heads-up teaching model. Responses are stipulated, not solver predictions or expert-approved advice.",
    },
    accepted,
    feedback: {
      kind,
      result:
        kind === "exact"
          ? "Compare the calculated payouts."
          : "A teaching recommendation under the stated assumptions.",
      explanation,
      takeaway: objective,
      calculation,
    },
  });
}
add(
  "value-ace",
  "As Qd",
  "Ac 7h 4s 2d 9c",
  [
    "You act last on the river. Pot $100; effective remaining stack $100. Opponent checked; earlier streets checked.",
  ],
  [
    "Range: AhJc, AdTc, KsQh, 9d9h (equal weights). A $30 bet is called by AJ, AT and 99; KQ folds. No raises. Checking reaches showdown.",
  ],
  ["Bet $30", "Check"],
  ["Bet $30"],
  "Value betting",
  "AJ and AT call with worse one-pair hands. You lose to 99 and beat KQ. Relative to checking, the bet gains $30 against each worse caller and loses $30 against 99: +$7.50 on average.",
  "exact",
  "Check EV = 3/4 × $100 = $75. Bet EV = (130 + 130 + 100 − 30) / 4 = $82.50. EV counts net chips from this decision.",
);
add(
  "thin-check",
  "Qs Jd",
  "Qh 8c 5s 2d Ac",
  [
    "You act last on the river. Pot $80; stack $100. Opponent checked after both players checked the turn.",
  ],
  [
    "Range: KcTc, 9h9d, AsTc, Ah8h (equal weights). A $40 bet makes KT and 99 fold; AT and A8 call. No raises. Checking reaches showdown.",
  ],
  ["Bet $40", "Check"],
  ["Check"],
  "Medium-strength hands",
  "You beat KT and 99, but those hands fold. AT and A8 beat you and call. Checking preserves the showdowns you win; betting gains nothing from worse hands.",
  "exact",
  "Check EV = 0.5 × $80 = $40. Bet EV = 0.5 × $80 − 0.5 × $40 = $20.",
);
add(
  "bluff-catch-call",
  "Kh Qc",
  "Ks 9d 6h 3c 2s",
  [
    "You act last facing a river bet. Pot before bet $100; opponent bets $50; call $50; stack $100. Turn checked through.",
  ],
  [
    "Range: AsAd, 9h9c, QhJh, JdTd (equal weights). Opponent bets every combination. No further betting.",
  ],
  ["Call $50", "Fold"],
  ["Call $50"],
  "Bluff catching",
  "KQ loses to AA and 99 but beats QJ and JT. You win half the time, above the 25% call threshold.",
  "exact",
  "Call EV = 0.5 × $150 − 0.5 × $50 = +$50; fold EV = $0.",
);
add(
  "bluff-catch-fold",
  "Kh Qc",
  "Ks 9d 6h 3c 2s",
  [
    "You act last facing a river bet. Pot before bet $100; bet and call $100; stack $100. Turn checked through.",
  ],
  [
    "Range: AsAd, AhAc, 9h9c, 6s6d, QhJh (equal weights). Every combination bets; no further betting.",
  ],
  ["Call $100", "Fold"],
  ["Fold"],
  "Bluff catching",
  "Only QJ is a bluff that you beat. Your 20% equity is below the 33.33% threshold.",
  "exact",
  "Call EV = 0.2 × $200 − 0.8 × $100 = −$40; fold EV = $0.",
);
add(
  "profitable-bluff",
  "7h 6h",
  "As Kd Qc 3s 2d",
  [
    "You act last on the river. Pot $100; stack $100; opponent checked. Earlier streets checked.",
  ],
  [
    "Opponent always has a hand that beats your seven-high. A $50 bet gets a fold 50% of the time and a call 50%; no raises. A check loses at showdown.",
  ],
  ["Bet $50", "Check"],
  ["Bet $50"],
  "Bluffing",
  "A fold wins the existing $100; a call loses your $50 bet. A 50% fold rate is enough for this bluff.",
  "exact",
  "Bet EV = 0.5 × $100 − 0.5 × $50 = +$25; check EV = $0. Break-even folds = 50 / 150 = 33.33%.",
);
add(
  "unprofitable-bluff",
  "7h 6h",
  "As Kd Qc 3s 2d",
  [
    "You act last on the river. Pot $100; stack $100; opponent checked. Earlier streets checked.",
  ],
  [
    "Opponent always beats seven-high. A $100 bet gets folds 20% and calls 80%; no raises. Checking loses at showdown.",
  ],
  ["Bet $100", "Check"],
  ["Check"],
  "Bluffing",
  "A large bluff needs enough folds. At this specified 20% fold rate, risking $100 is unprofitable.",
  "exact",
  "Bet EV = 0.2 × $100 − 0.8 × $100 = −$60; check EV = $0.",
);
add(
  "possible-flush",
  "As Qd",
  "Ac 8c 5c 2h 9s",
  [
    "You act last facing a river bet. Pot before bet $100; bet and call $25; stack $100. Turn checked through.",
  ],
  [
    "Range: KcJc, AhTd, QhJs, KhQh (equal weights). Every combination bets. No further betting.",
  ],
  ["Call $25", "Fold"],
  ["Call $25"],
  "Range comparison",
  "KcJc is a flush and beats you. AT, QJ and KQ are not flushes and lose to your pair of aces. A possible flush is not proof of a flush.",
  "exact",
  "Equity = 75%; threshold = 25 / 150 = 16.67%. Call EV = 0.75 × $125 − 0.25 × $25 = +$87.50.",
);
add(
  "nuts-value",
  "As Ks",
  "Qs Js Ts 4d 2c",
  [
    "You act last on the river with a royal flush. Pot $80; stack $100; opponent checked. Earlier streets checked.",
  ],
  [
    "Range: QhQd, JhJd (equal weights). Both hands call $40 or $80 and never raise. Checking reaches showdown.",
  ],
  ["Bet $40", "Bet $80", "Check"],
  ["Bet $80"],
  "Value betting",
  "Both sets call either size and always lose to your royal flush. Under this specific response model the larger bet earns more.",
  "exact",
  "Check EV = $80; bet $40 EV = $120; bet $80 EV = $160.",
);
add(
  "showdown-pair",
  "Jh Td",
  "Jc 8s 5h 3d 2c",
  [
    "You act last on the river. Pot $60; stack $90; opponent checked. Earlier streets checked.",
  ],
  [
    "Opponent can hold weaker pairs such as 99 or 77, and stronger jacks such as AJ. Weaker hands usually fold to $30; stronger hands usually call. Exact frequencies are unknown.",
  ],
  ["Check", "Bet $30"],
  ["Check"],
  "Medium-strength hands",
  "JT has showdown value against 99. AJ can call and beat you. Checking is a reasonable default when worse hands rarely call; without exact frequencies this is illustrative.",
);
add(
  "small-value-choice",
  "As Kd",
  "Ac 7h 4s 2d 9c",
  [
    "You act last on the river. Pot $100; stack $150; opponent checked. Earlier streets checked.",
  ],
  [
    "Opponent has many weaker aces such as AJ and AT; no two-pair or better in this model. Weaker aces may call $25 or $50. Exact response frequencies are unknown.",
  ],
  ["Bet $25", "Bet $50", "Check"],
  ["Bet $25", "Bet $50"],
  "Value betting",
  "AJ and AT can pay a value bet and lose to AK. Either offered bet is reasonable. Without call frequencies we cannot rank their expected values exactly.",
);
add(
  "draw-check",
  "Ah Jh",
  "Kh 8h 4c 2d",
  ["You act first on the turn. Pot $80; stack $160. Flop checked through."],
  [
    "Opponent has pairs such as KQ or 99 and rarely folds to $40. A check gives the opponent the option to bet. No exact turn response or river strategy is supplied.",
  ],
  ["Check", "Bet $40"],
  ["Check"],
  "Equity realization",
  "AJ has a heart draw and ace-high. Checking is a reasonable default against an opponent who rarely folds. Nine hearts improve to a flush, but future betting and other hands still matter; no complete EV model is supplied.",
);
add(
  "board-check",
  "2c 3d",
  "As Kd Qh Jc Ts",
  [
    "You act last on the river. Pot $100; stack $100; opponent checked. Earlier streets checked.",
  ],
  [
    "The board is the best hand for both players. Opponent always calls $50 and never raises. Checking splits the pot.",
  ],
  ["Check", "Bet $50"],
  ["Check", "Bet $50"],
  "Split pot",
  "Both players have an ace-high straight from the board. A called bet is split too, so neither action improves your net payout. Checking avoids an unnecessary bet.",
  "exact",
  "Check EV = $50. Bet EV = ($100 + $50 + $50) / 2 − $50 = $50.",
);
export { scenarios };
