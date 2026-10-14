# Beginner poker concepts

These notes explain the distinctions Poker Practice teaches. The app's local opening guides are illustrative baselines, not solved strategies.

## Reading a starting-hand chart

A preflop chart suggests an action for your two hole cards in a particular situation. Choose the chart for your position and the action before you, then find your hand. An opening chart applies when everyone before you has folded; it does not apply unchanged after a raise and a re-raise. Charts also depend on table size, effective stacks, bet sizes, rake or antes, and the strategies used to construct them. A chart is a baseline under its stated assumptions. [Poker Trainer: preflop range charts](https://pokertrainer.se/preflop-range-charts/)

**HJ** means Hijack: the seat immediately before the Cutoff, which is immediately before the Button. **BTN** is the dealer button, **SB** the small blind, and **BB** the big blind. Position labels move when the button moves. At tables with more than two players, preflop action starts left of the big blind. Postflop action starts with the first remaining player left of the button. Heads-up, the button posts the small blind, acts first preflop, and acts last postflop. [PokerStars: Texas Hold'em rules](https://www.pokerstars.com/poker/games/texas-holdem/)

The usual chart has a 13 × 13 grid: pairs on the diagonal, suited hands on one side, and offsuit hands on the other. **AKo** means ace-king of different suits; **AKs** means ace-king of the same suit; **TT** means two tens. Read the labels and legend because colors and orientation can vary. If a chart's legend says red = raise, gray = fold, and green = call, those are actions, not hand-strength percentages. [Poker Trainer: reading the grid](https://pokertrainer.se/preflop-range-charts/)

If a chart says to open to **2.5 BB**, that means a total preflop contribution of 25 chips with 5/10 blinds. It does not mean add 25 on top of the big blind. If its AKo cell says raise and its J4s cell says fold, those instructions apply to that chart's situation; they are not universal rules for those hands.

**In this app:** use **Preflop guide** beside the betting controls or browse **Reference → Opening chart library**. The 14 local guides cover direct 2-, 6-, and 9-player opening definitions from MIT-licensed PreflopR. They require your first preflop action in a pot with only blinds and everyone before you folding. Raised, limped, big-blind, later-street and other table-size situations show **No matching opening chart**. Source stack depth, rake, antes and opening sizes are unspecified; the app's 100-BB/no-rake setting and suggested 25/30-chip sizes are explicit educational assumptions, not a verified solver match. See the [source and license notes](../packages/poker/data/preflop/README.md).

The grid contains 169 hand classes, but the deck has **1,326 distinct two-card combinations**. Cells do not all represent equally many combinations:

| Hand class                    | Exact combinations before any known-card blockers |
| ----------------------------- | ------------------------------------------------: |
| One pocket pair, such as AA   |                                                 6 |
| One suited hand, such as AKs  |                                                 4 |
| One offsuit hand, such as AKo |                                                12 |

These counts follow directly from choosing suits: a pair chooses two of four suits, suited AK chooses one shared suit, and offsuit AK has four ace suits times three different king suits. The total is `13 × 6 + 78 × 4 + 78 × 12 = 1,326`.

On an unopened-pot chart, a label such as **“Raise 21.3%”** normally means the strategy raises with about 21.3% of starting combinations, counting any mixed action frequencies. It does not mean your hand wins 21.3% of the time. Raising AKo half the time contributes six combinations to that calculation, not twelve. After earlier actions or known-card blockers, a chart may instead report a frequency conditional on the range that reached that situation; check its definition.

## Position, winning probability, and action are different

The button is useful because you usually see opponents act before making your postflop decision. That can help you control betting and decide when to continue. It does not make your cards win more often by itself. If your cards, opponent ranges, number of opponents, and possible boards stay identical, showdown equity is identical regardless of the seat label.

In actual play, position changes which hands opponents enter with, what actions you observe, how many opponents continue, and the future betting available. Those changes can affect both your estimated equity and the profitability of an action. A random-hand equity number must not acquire an unexplained “button bonus.”

A 40% chance of winning does not automatically mean call, and a 20% chance does not automatically mean fold. The price, ties, opponents still to act, future betting, and possible folds all matter.

## What are a 3-bet, 4-bet, and 5-bet?

Before the flop, the big blind counts as the first betting level. The opening raise is the second, the first re-raise is a **3-bet**, and further re-raises are **4-bets** and **5-bets**. Calls do not increase that count. [PokerStars: 3-betting terminology](https://www.pokerstars.com/poker/learn/lesson/3-betting/)

With blinds of 5/10, this is one legal example. Amounts are totals committed on the street, not extra chips added each time.

| Betting level | Example action            |
| ------------- | ------------------------- |
| First         | Big blind posts 10        |
| Second        | Player A raises to 30     |
| Third         | Player B re-raises to 90  |
| Fourth        | Player A re-raises to 220 |
| Fifth         | Player B re-raises to 500 |

“5-bet jam” means the fifth level is an all-in. With 1,000-chip starting stacks and no earlier-street spending, Player B's jam in this example would be **to 1,000**, adding 910 after already contributing 90. Raising to 500 is not an all-in in that situation.

The label counts aggression, not a fixed bet size or proof of a particular hand. Deciding whether to call depends on the all-in price and the opponent's range; no single list of calling hands applies to every 5-bet.

## Winning, tying, and equity

**Win outright** means you alone have the best hand at showdown. **Tie for first** means you share the best hand with at least one opponent. **Equity** is your expected fraction of the pot, including those shared wins. Heads-up, with one equally eligible pot:

`equity = outright win probability + ½ × tie probability`

Consider this completed board and these exact hands:

| Cards                  | Best five-card hand      |
| ---------------------- | ------------------------ |
| Board: J♠ 10♠ 9♠ 8♠ 7♠ | Jack-high straight flush |
| You: 5♠ 6♠             | J♠ 10♠ 9♠ 8♠ 7♠          |
| Opponent: 4♥ 5♥        | J♠ 10♠ 9♠ 8♠ 7♠          |

Both players use the entire board. Neither improves it. You win outright **0%**, your opponent wins outright **0%**, and you tie **100%**. Each player's equity is **50%**. That is a certain split, not a coin flip. Hold'em allows zero, one, or two hole cards in the best five-card hand. [PokerStars: Hold'em showdown rules](https://www.pokerstars.com/poker/games/texas-holdem/)

This board is **not an automatic tie against every possible hand**. An opponent holding Q♠ can make a queen-high straight flush with 8♠ 9♠ 10♠ J♠ Q♠. Holding Q♠ K♠ makes a king-high straight flush. Those beat the board's jack-high straight flush. The exact matchup above ties because neither player holds those improvements. Higher straight flushes beat lower ones. [PokerStars: straight-flush rankings](https://www.pokerstars.com/poker/games/rules/hand-rankings/)

In a multiway pot, tie probability alone is insufficient to calculate equity. If exactly three players tie for first, each gets approximately one third; if only two tie for first and everyone else loses, each gets half. Divide by the number of tied winners, not the number seated. Side-pot eligibility and indivisible odd chips can require separate payout calculations.

## Outs: winning cards and chopping cards

An **out** is an unseen card that helps a draw. For decisions, specify whether it gives you a winning hand, merely improves your hand, or creates a tie. Completing a flush is not a winning out if an opponent still has a full house or a higher flush.

| Term              | Meaning under the stated opponent hand or range                                 |
| ----------------- | ------------------------------------------------------------------------------- |
| Clean winning out | A card that makes you win; on earlier streets, opponents may still have redraws |
| Dirty out         | A card that improves your hand but may still leave you losing                   |
| Chop out          | A card that makes you tie for first and share the pot                           |

Count each card once even when it completes two draws. An opponent's possible cards can block draws, and a card can win against some range combinations while losing against others. Outs are conditional on those assumptions. [PokerStars: calculating outs](https://www.pokerstars.com/poker/learn/lesson/calculating-outs/)

With **one card to come**, suppose four equally likely legal cards win outright, two other cards guarantee a heads-up tie, and every other card loses. For expected pot share, the two chop cards contribute half as much as winning cards:

`4 + 2 × ½ = 5 equity-equivalent outs`

This is five units of pot share, not five cards that win outright. If the model has N equally likely legal river cards, outright win probability is `4/N`, tie probability is `2/N`, and equity is `5/N`. For example, with both exact hole-card hands and four board cards known, N = 44: win ≈ 9.1%, tie ≈ 4.5%, equity ≈ 11.4%.

A card producing a guaranteed three-way tie contributes one third instead of one half. If a card sometimes wins, sometimes ties, and sometimes loses against an opponent range, use its average payout across that range. This shortcut assumes the other outcomes lose; it is not a general replacement for equity enumeration. On the river there are no future cards and therefore no remaining draw outs.

The **rule of 2 and 4** is a rough shortcut: outs × 2 estimates improvement on the next card, and flop outs × 4 estimates improvement by the river when you see both remaining cards. It becomes less accurate with many outs. Improving does not necessarily mean winning, and a turn improvement may be beaten on the river. Paying only a flop call does not guarantee you will see both cards. [PokerStars: outs and approximations](https://www.pokerstars.com/poker/learn/lesson/calculating-outs/)

## Learn pot odds before modeled EV

After chart basics, learn the price of a call. In a simple heads-up river or closing all-in decision without rake or side pots:

`required equity = call amount / (current pot including the opponent's bet + call amount)`

If the pot was 100 and your opponent bets 50, you call 50 for a final pot of 200. The threshold is `50/200 = 25%`. Previously committed chips are already in the pot; do not subtract them again from the cost of this decision. [PokerStars: pot odds](https://www.pokerstars.com/poker/learn/lesson/pot-odds/)

That threshold settles a simple closing-call calculation only under its assumptions. On earlier streets, or with other players able to raise, future payments and folds can change the result.

**Expected value (EV)** is average future chip profit or loss for an action under a specified model. An EV comparison needs opponent ranges, responses to each size, possible re-raises, the learner's later responses, and payouts. Equity alone cannot tell you a bet's EV: a strong hand may get no calls from worse hands, while a weak hand may profit if enough better hands fold.

Poker Practice's **Check My Odds** estimates showdown outcomes using public information and inferred opponent ranges. It assumes the remaining players reach showdown; it does not predict folds or recommend calling or raising. Modeled action comparisons also depend on the authored bot behavior and simulated continuation. They are conditional estimates, not proven optimal moves or solver outputs. A narrow sampling interval does not prove that the opponent model is realistic.

Use chart basics first, pot odds next, and explicitly modeled EV as an advanced topic. When opponents act, update the range assumptions and reconsider the next decision. A profitable decision can lose an individual hand; a winning hand alone does not prove the decision was good.
