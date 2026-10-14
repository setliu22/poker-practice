# Randomized preflop practice and sizing

The Learn walkthrough keeps a seven-step teaching sequence while generating its examples from a seed. Starting hand classes, legal suits, the earlier position used for a comparison, and observed opposing raises vary. Replay and previous-step controls retain the current examples; a new randomized walkthrough replaces them. The same comparison hand appears in both positions, and the same opposing raise appears in the call-cost and re-raise questions.

Choose six or nine seated players, with nine as the default. Each hand uses the directly supplied chart for its table size and position. No eight-player chart is inferred from the six- or nine-player library. The generator conditions some examples on the learning goal: a position-contrast hand is outside an earlier opening range but inside the button range. These are varied teaching examples, not a natural frequency sample of every possible game situation.

## Why open, and why that amount?

The imported authored baseline determines whether a hand belongs in an unopened range at that position. Hand class and position matter to that reference decision. Its classification is illustrative rather than solver-derived.

For every non-blind hand it chooses to open, the app uses a **2.5-BB teaching size**: 25 chips with a 10-chip big blind. It does not calculate that size from the private hand's strength. The imported source does not specify an opening size; chart agreement therefore cannot prove 2.5 BB is optimal.

Real sizing choices concern the whole strategy and context. A larger opening risks more chips and changes opponents' incentives to fold, call or re-raise. Position, effective stacks, rake and opponent responses affect that tradeoff. Simply raising larger with stronger private hands can reveal information about the range. [GTO Wizard's preflop raise-sizing discussion](https://blog.gtowizard.com/preflop-raise-sizing-examining-2-key-factors/) explains these tradeoffs and why comparisons between fixed-size strategies do not justify selecting a size solely by one hand's strength. That source motivates the explanation; no solver ranges or recommended size frequencies are copied into this app.

## An observed raise is a different question

In the arithmetic steps, another player has already raised. The generator varies that observed total; it is not assigning an optimal opening size. The learner on the button has posted zero, so calling costs the full opposing total. With blinds 5/10:

```text
Opponent raises to 25: raise increment = 25 − 10 = 15.
Call cost = 25.
Minimum full re-raise total = 25 + 15 = 40.
Current pot before your decision = 5 + 10 + 25 = 40.
```

These questions check the betting rule. They do not decide whether calling or re-raising is best against a real opponent. That strategic choice needs the opponent's range, price, stacks and players still to act.

The walkthrough does not persist chart-agreement grades as poker skill. Existing practice history and games stay intact. Imported chart provenance and MIT notice remain in [the data directory](../packages/poker/data/preflop/README.md).
