# Poker strategy research and feedback audit

Reviewed 2026-10-08. Requested source: [Poker Trainer tutorials](https://pokertrainer.se/poker-tutorials/). Read the text of all 31 linked public articles. This review covers the public tutorials, not the implementation or private solver data behind their app. These are original research notes; the app was not changed during this research task.

## Rules and calculations to preserve

- Hold'em compares the best five cards from available hole/community cards. Zero, one, or two hole cards may play. Compare all relevant ranks/kickers; suits do not break ties. An ace can be low in A2345, but cannot wrap a straight.
- Full houses compare trips first, then the pair. Quads can need a fifth-card kicker. Two pair compares the higher pair, lower pair, then the kicker. A board-only tie requires that none of the relevant players improves the board.
- Heads-up: the button posts the small blind and acts first preflop, last postflop. With more players, preflop starts left of the big blind; postflop starts with the first remaining player left of the button. Calling closes action only if nobody else retains an action or raise opportunity.
- Minimum full raise increments and short all-in reopening rules matter. An all-in player retains eligibility for matched contribution layers, not every pot. Several all-in players can be eligible for different side pots.
- Let P be the pot immediately before the learner's action, including any opponent bet already made. A closing call costing C needs pot share C/(P+C), absent rake and side-pot restrictions. Its net EV relative to folding is equity*(P+C)-C. Previously committed chips are sunk.
- Equity is expected showdown pot share, including ties. Heads-up equity is win probability plus half tie probability; multiway ties divide share among all tied winners. Equity against a river range can be any percentage, not just 0%, 50%, or 100%.
- For a heads-up all-in bet B into pot P, where the opponent folds with probability F or calls B and the learner has conditional pot share E, net EV is F*P+(1-F)*(E*(P+2B)-B). This assumes full matching, no raises, no later bets, no rake, and no side pots. E must be against the calling range, not the original range.
- A zero-showdown-equity bluff with risk B needs folds B/(P+B). MDF P/(P+B) is a simplified range-defense benchmark, not a mandatory call rate for each hand, street, or player in a multiway pot.
- Outs times 2 approximates next-card improvement; flop outs times 4 approximates improvement by the river when seeing both remaining cards. Draw completion, becoming the best hand, and retaining the best hand are different events. Avoid double-counting overlapping outs; dirty outs and opponent redraws matter.

## Strategy concepts relevant to this app

A bet needs a concrete purpose. Value: weaker hands continue. Bluff: stronger hands fold. Protection/equity denial: hands currently behind lose opportunities to improve. These purposes can overlap. Protection is not an automatic reason to bet: the cost of getting called/raised and the value of checking still matter.

Separate the opponent's current range from its response ranges for a particular size. A useful review identifies specific calling, folding, and raising combinations and their weights. High equity against the current range does not imply high equity against the continuing range. Nor does a positive bet EV prove betting beats checking.

Board texture is relational. Connected or suited boards offer different draws; paired boards allow full houses/quads. A range's average strength and its concentration of very strong hands are distinct. A dangerous-looking board does not prove the opponent has a flush or straight. Claims of range/nut advantage require explicit ranges for both players.

Hand reading updates probabilities using earlier actions, blockers, sizes, position, and opponent behavior. Checks and calls can contain traps; they do not automatically remove all strong hands. A blocker can remove either calls or folds, so its effect on a bluff is not always favorable.

Position changes information and the ability to realize equity. Starting-hand recommendations also depend on table size, effective stack, rake, antes, prior actions, and opponents behind. The site's main preflop chart discussion assumes six players, 100 big blinds, rake, and defined raise sizes. Our 2–9-player no-rake tables do not match all those assumptions.

Linear and polarized strategies are useful descriptions, not fixed instructions. Large polarized bets often pair strong value with bluffs; medium-strength hands can prefer checking because betting folds out worse hands while retaining better ones. Different bot tendencies should lead to different response ranges and learning feedback.

Short-term chip results cannot grade decisions. Practice should revisit specific recurring mistakes, explain one concrete concept at a time, and distinguish calculation uncertainty from uncertainty in the opponent model. Books, bankroll, downswing, and win-rate articles reinforce study/review and variance; real-money bankroll features are outside this local app's scope.

## Source corrections and cautions

1. [Best poker hand](https://pokertrainer.se/best-poker-hand/), two-pair example: board Ad Td 8c 2h 8d, player A Ah 8s, player B As 2d. The article labels A as aces/eights two pair and B as aces/twos two pair. Actually A has **eights full of aces** (888AA); B has **aces and eights, ten kicker** (AA88T). Checked against our evaluator and the independent `pokersolver` development dependency; both agree. The winner remains A, but the stated hands/reason are wrong.
2. [Introduction to poker equity](https://pokertrainer.se/introduction-to-poker-equity/) says river equity is 0%, 50%, or 100%. That describes a fixed heads-up hand matchup only. A range or multiway pot changes those possibilities. Holding the nuts can still tie, so it does not always imply 100% share.
3. [Poker positions](https://pokertrainer.se/poker-positions/) suggests no action follows a last player's raise in one relative-position example. A raise normally returns action to eligible earlier players. The small-blind position disadvantage also needs the heads-up button exception.
4. [Poker all-in](https://pokertrainer.se/poker-all-in/) says a larger pot relative to the call requires more bluffs. The required winning share actually falls as the call gets cheaper relative to the final pot. Its side-pot description also needs eligibility by matched contributions, rather than simply whether a player still has chips.
5. [Poker bankroll management](https://pokertrainer.se/poker-bankroll-management/) repeats $800/$2,000 as 40/100 buy-ins of $200. The correct multiplication is $8,000/$20,000. No bankroll recommendation is needed for our no-money app.
6. Public claims about solver frequencies, near-zero loss from simplified charts, and population studies cannot be independently reproduced from the tutorial text alone. Treat them as the site's claims. Do not label our heuristic policy GTO, import unsupported solver numbers, or assume the source's simplified recommendations are universal.

## Current implementation audit

Inspected `packages/poker/src/table.ts` and `packages/poker/src/table-review.ts`.

Already supported: exact evaluation and legal actions; saved decision snapshots; action-likelihood range updates; blocked combinations; modeled response actions and side-pot payouts; ranges separate from actual-card hindsight; numerical odds; conditional exact closing river values; clearly disclosed simulation assumptions.

Remaining limitations:

- Bot policy uses rank/category scores, price, style, and live-player count. It does not explicitly evaluate draws, position, stack-to-pot ratio, or range interaction. Dealer position controls action order but is not a strategy-policy input.
- The comparison continues bot actions for one betting round, forces the learner to call further raises, then checks later streets through. It cannot establish a full multi-street strategy or the value of a realistic future fold.
- Reviews compare fold, check/call, and one raise size. They do not optimize sizing or show how response ranges differ between small/large bets.
- Current range summaries classify made-hand categories, not specific value targets, drawing hands, missed draws, or response-specific combinations.
- Multiway range sampling approximates the joint posterior. Sampling confidence intervals cover simulation noise, not model misspecification. More simulations do not fix an unrealistic policy.

The next useful feedback change is to explain specific response hands for each tested size, then report the purpose of a bet and a short conditional takeaway. Any improved bot policy should be accompanied by range-inference updates and fixtures, so the displayed assumptions continue to match the opponents being played.

## Reading inventory

Rules and fundamentals:

- [Texas Hold'em rules](https://pokertrainer.se/texas-holdem-rules/)
- [Poker hand ranking](https://pokertrainer.se/poker-hand-ranking/)
- [Best poker hand](https://pokertrainer.se/best-poker-hand/)
- [Learn to play poker](https://pokertrainer.se/learn-to-play-poker/)
- [Poker positions](https://pokertrainer.se/poker-positions/)

Preflop:

- [Poker starting hands](https://pokertrainer.se/poker-starting-hands/)
- [Preflop hand categories](https://pokertrainer.se/preflop-hand-categories/)
- [Opening poker hands](https://pokertrainer.se/opening-poker-hands/)
- [Preflop range charts](https://pokertrainer.se/preflop-range-charts/)
- [Facing a raise preflop](https://pokertrainer.se/facing-a-raise-preflop/)
- [Preflop calling ranges](https://pokertrainer.se/preflop-calling-ranges/)
- [Preflop 3-betting ranges](https://pokertrainer.se/preflop-3-betting-ranges/)
- [Preflop bet sizing](https://pokertrainer.se/preflop-bet-sizing/)
- [What is limping in poker](https://pokertrainer.se/what-is-limping-in-poker/)
- [Poker squeeze](https://pokertrainer.se/poker-squeeze/)

Math and strategy:

- [Poker odds explained](https://pokertrainer.se/poker-odds-explained/)
- [Introduction to poker equity](https://pokertrainer.se/introduction-to-poker-equity/)
- [Poker Odds Calculator](https://pokertrainer.se/poker-odds-calculator/)
- [Minimum defense frequency](https://pokertrainer.se/minimum-defense-frequency/)
- [The three reasons to bet](https://pokertrainer.se/the-three-reasons-to-bet/)
- [Bluffing in poker](https://pokertrainer.se/bluffing-in-poker/)
- [Poker hand reading](https://pokertrainer.se/poker-hand-reading/)
- [Range construction in poker](https://pokertrainer.se/range-construction-in-poker/)
- [How to play after the flop](https://pokertrainer.se/how-to-play-after-the-flop/)
- [Poker all-in](https://pokertrainer.se/poker-all-in/)
- [GTO poker vs exploitative play](https://pokertrainer.se/gto-poker-vs-exploitative-play/)

Learning and variance:

- [Poker downswing](https://pokertrainer.se/poker-downswing/)
- [Poker win rate](https://pokertrainer.se/poker-win-rate/)
- [Poker bankroll management](https://pokertrainer.se/poker-bankroll-management/)
- [Recommended poker books](https://pokertrainer.se/recommended-poker-books/)
- [How to get better at poker](https://pokertrainer.se/how-to-get-better-at-poker/)
