# Online cash Decision Lab

The Decision Lab trains river decisions for online no-limit Hold’em cash games. Choose 2–9 seated players; nine is the starting setting. A full table can reach the river with only two or three active players. The displayed positions, action history, pot and remaining stacks reflect that distinction. These exercises do not supply an opening chart for every table size.

Each fresh exercise asks for an action, a reason, a percentage estimate and confidence before showing feedback. It records the first submission once. A hint used beforehand marks that answer assisted. After the first answer, a guided follow-up changes the supplied range weights while keeping the cards and price. Guided follow-ups are counted separately from independent answers. Fresh review generates a new situation instead of rescoring an already revealed answer.

Use a short study session to make several fresh decisions, inspect the reasoning behind a mistake, and finish the changed-range follow-up. Take the displayed next-session cue into your next review: record a relevant hand and the information available when you decided, then examine the range and price assumptions afterward. Confidence is useful for identifying beliefs that need checking. Exercise results measure performance on these supplied-range questions; they do not establish a poker win rate or overall mastery.

## What each family teaches

| Family         | Decision                                       | Percentage estimate                             | Reasoning target                                                              |
| -------------- | ---------------------------------------------- | ----------------------------------------------- | ----------------------------------------------------------------------------- |
| Bluff catching | Call or fold when the river call closes action | Minimum required pot share                      | Compare the whole betting range with the price; past investments are sunk     |
| Value betting  | Check back or make the offered bet             | Weaker hands as a fraction of the calling range | Compare checking with betting, including folds and the actual calling range   |
| Bluffing       | Check back or make a pure bluff                | Break-even fold frequency                       | Compare stipulated folds with the cost and reward of bluffing                 |
| Multiway calls | Call or fold after a bettor and another caller | Minimum required pot share                      | Evaluate legal joint ranges and split-pot shares against a closing-call price |

Range combinations and their weights are visible assumptions for the exercise. In bet/check questions, each combination also has a stipulated call or fold response. The feedback is exact **under those assumptions**. The app does not infer these frequencies from a real player or label the authored ranges optimal.

## Arithmetic and boundaries

Let `P` be the current gross pot, including visible opponent river wagers; `C` the additional call; `B` the offered bet; `R` the fixed study rake; and `s` the hero’s expected share of a settled pot. Earlier investments are excluded from the decision's incremental EV.

For a closing river call:

```text
call EV = s × (P + C − R) − C
fold EV = 0
required share = C / (P + C − R)
```

A tie with one opponent contributes `1/2` to share. A tie among three winners contributes `1/3`. In multiway questions the engine multiplies the supplied per-range weights, discards worlds that reuse a card, and renormalizes the remaining legal worlds. It then evaluates hero against both opponents together. Marginal heads-up equities cannot replace this joint calculation.

For a heads-up bet/check question:

```text
check EV = expected showdown share × (P − R)
bet payoff when opponent folds = P − R
bet payoff when opponent calls = showdown share × (P + 2B − R) − B
bet EV = weighted average of the fold and call branch payoffs
```

The weaker-caller percentage counts only strictly worse calling hands; tied hands are not weaker. That percentage is a reasoning checkpoint, not a universal criterion for betting. Checking must also be compared with betting across the full supplied range.

Pure-bluff questions require zero showdown share against every supplied combination:

```text
bluff EV = fold frequency × (P − R) − call frequency × B
break-even fold frequency = B / (P − R + B)
```

The generated questions use 100 BB starting stacks, legal street commitments, covered wagers and no side pots. Calls close the river action. Checking ends the hand. Offered bets receive only the shown call/fold responses, with no raises or later wagers. A fixed study deduction of 0 or 0.5 BB is stated explicitly; it is not a WSOP or other site's rake schedule. The generator's earlier action history supplies context, not a claim that every opponent would reach the river with these ranges.

These are river exercises because no future betting remains in the modeled branches. Direct equity-versus-price arithmetic cannot generally determine a flop, turn or preflop decision when later bets affect realization.

## Persistence and reproducibility

The server saves private version-1 specifications, including the generator seed and both phases. Unanswered responses expose only the current question: no seed, transfer question or answer feedback. Reloads use the saved snapshot. Initial and transfer submissions are idempotent first answers; viewing a hint after submission cannot retroactively change the saved assistance classification. Learning export and clear include the new records.

The semantic freshness fingerprint includes skill, table size, board template, sizes, rake, rank combinations, weights and responses. It ignores rendered labels and suit permutations. Recent fingerprints are excluded when creating fresh review. This limits exact repeats; it does not prove the next problem teaches a wholly new concept.

The existing lessons, saved-game replay and optional solver are separate and remain available. This lab needs no account, external solver, paid charts or runtime network service beyond the local API.

## Sources and original content

The scenarios, seeded range generator, reasoning choices and feedback are original project content. No paid charts or solver solutions are copied. The test-only independent evaluator is the existing `pokersolver` development dependency; it is not a runtime strategy service.

- [GTO Wizard: What Are Pot Odds in Poker?](https://blog.gtowizard.com/what-are-pot-odds-in-poker/) explains the closing-call price, rake and the distinction between equity and realized pot share when later betting remains. The formulas above apply those principles to this lab's stated river branches.
- [GTO Wizard: Equity Realization](https://blog.gtowizard.com/equity-realization/) motivates keeping future betting outside the exact river calculation. Changing assumptions can change realized value; the lab does not turn raw equity into a universal action rule.
- [GTO Wizard: Fixing a Poker Leak, Part 1](https://blog.gtowizard.com/fixing-a-poker-leak-part-1-spotting-and-correcting-errors/) motivates focusing review on specific decisions and errors. Separating first answers, assisted practice and guided follow-ups is this project's learning design; its real-world benefit has not been empirically measured here.

See [the project’s strategy research](poker-strategy-research.md) and [decision feedback limits](decision-feedback.md) for the broader app's source and model boundaries.
