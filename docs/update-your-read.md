# Update your read: correctness and limits

Original educational example. This module teaches inference and chip-EV decisions with supplied probabilities; it does not claim to infer real players' tendencies accurately.

## What matches poker

- The prior is conditional on the learner's own hole cards, public flop and previous public history. Hole-card alternatives are not revealed actual cards.
- Action likelihood is P(this precise shove | candidate hand, current public situation), not P(hand | shove). Bayes multiplies prior by likelihood and normalizes. The same bet can arise from a made hand or draw; it does not prove either.
- After a hypothetical heart, the learner can be ahead against AQ and behind against QhJh. Qh cannot be dealt in the QhJh branch. The previews do not alter the original flop or feed extra information into its call decision.
- An actual dealt Qh would remove QhJh and require another update; the lesson explains this rather than silently carrying blocked weights forward.
- Given a matched heads-up all-in, no further contributions, no rake and no payout utility, expected pot share can be compared directly with call price. Pot before shove 100 + shove 100 + call 100 = 300. Required equity = 100/300. Calling EV = equity × 300 − 100, folding EV = 0 from this decision. No uncalled chips or side pots exist in this example.
- For each candidate hand independently, seven known cards leave 45 legal cards and 990 unordered turn–river pairs. Enumeration includes redraws, wins without completing a flush, and ties. Heads-up ties get half the pot. Runout probabilities are conditional on each candidate hand's blockers, then weighted with its posterior probability.
- Positions influence the assumptions behind the prior/action likelihood; they do not modify the evaluator or the showdown equity of an unchanged hand matchup.

## Exact fixtures

9h8h on AhKh2c:
- Against AcQd: 367 wins, 0 ties of 990; equity 37.070707%.
- Against QhJh: 153 wins, 13 ties of 990; equity 16.111111%.
- Priors 80/20, likelihoods 50/100: draw posterior 1/3; range equity 30.084175%; calling EV −9.747475 chips.
- Same priors, likelihoods 100/10: draw posterior 1/41; range equity 36.559497%; calling EV +9.678492 chips.

Tests compare every legal runout against the independent test-only MIT-licensed pokersolver, check posterior fixtures, exact pot price, blockers, ties, legal inputs, step gating, idempotence and persistence. Correctness of calculations does not establish realism of the supplied probabilities.

## Real-world limitations

Two exact combinations and fixed action tendencies isolate a concept. Actual ranges include many combinations, and tendencies vary with sizing, position, stacks, earlier actions and adaptation. The app labels those inputs as teaching assumptions, not measured frequencies or solver recommendations. Real inference should allow uncertainty and sensitivity checks; a slider explores how changing the assumed draw weight changes this particular all-in decision.

The rule of 2/4 approximates hitting counted outs. It is not used as a substitute for hand-vs-range equity. An ordinary flop call with future betting requires equity realization, implied/reverse implied odds and possible future folds; this module explicitly uses an all-in to avoid pretending the call-price test settles those broader cases. Tournament payout effects are excluded.

## Sources checked

- [GTO Wizard: Equity Realization](https://blog.gtowizard.com/equity-realization/): all-in equity tracks chip EV because no further betting is possible; otherwise raw equity can misrepresent action value.
- [GTO Wizard: What are Pot Odds in Poker?](https://blog.gtowizard.com/what-are-pot-odds-in-poker/): break-even calling threshold and the EV derivation.
- [Statlect: Prior probability](https://www.statlect.com/glossary/prior-probability): conditional probability and Bayesian posterior updating.

The sources support the principles, not these authored range weights or betting frequencies. No source strategy tables are copied.

## Current default: generated all-in decision practice

The default UI no longer uses a fixed deal library. Each new attempt uses a server-selected random seed and constructs fresh legal ranks, suits, boards and two explicit opponent combinations in one of four skill families: flush dominance, conditional overcards, straight draws against redraws, or pair plus flush draw. Pot size and supplied range weights also vary. Direct construction keeps generation bounded; there is no fixed-example fallback or solver service.

The exact evaluator enumerates every legal turn–river pair for each combination. Equity includes half of ties. The optional visible guide supplies matchup shares and their weighted sum; equity estimates are optional and omitted estimates do not count as zero-error answers. Learners calculate the required pot share and choose actions at two prices. Price contrasts may preserve or change the correct action; hands above 50% equity can profitably call both symmetric heads-up prices.

Only recorded first-attempt results adapt selection. The most recent 24 generated decisions give a skill extra selection weight for a missed first/counter decision, price error above 5 percentage points, or optional equity error above 8 points. Every skill retains a base selection weight. The UI explains when a recent error made this skill more likely; these are review signals, not a diagnosis of real poker ability. Range weights are artificial exercise assumptions, never learned from this history.

Full generated specifications (generator version, seed, cards, supplied weights and prices) are persisted separately by lesson ID. Reloads, grading and repeat attempts use that snapshot, so future algorithm changes do not rewrite history. Historical variants 0–1001 retain their existing interpretation; generated lessons use variant 1002 with a stored specification.

The changed-price comparison deliberately holds cards, range and starting pot fixed and changes both matching stacks. Real bet-size changes can also change the inferred range. This is a conditional no-rake heads-up all-in chip-EV exercise, not a population strategy claim or general solver.
