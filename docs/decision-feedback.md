# Decision feedback

The app separates three things: a starting-hand guide, a conditional model rating, and showdown odds. None is a universal answer to whether you should bet.

## Opening guides

The optional **Preflop guide** button opens a local chart beside your current decision. Your hand is highlighted. After acting, the review explains agreement or departure from that baseline and distinguishes changing the raise size from changing the action.

Only directly provided 2-, 6-, and 9-player opening definitions are included. No generic button chart is substituted for an unsupported situation. The MIT-licensed PreflopR data is pinned; [provenance and license](../packages/poker/data/preflop/README.md) are included locally. Imported hand sets and combination counts were independently checked against the source. That verifies the import, **not the strategic quality**: the ranges are not solver-derived or expert-verified, and upstream depth/rake/sizing assumptions are unspecified. The app-selected 100-BB, no-ante/no-rake context and 2.5-BB/3-BB sizes are disclosed assumptions.

## Model agreement score

Each decision review uses its before-action snapshot: your cards, dealt board, public betting history, and ranges inferred from public actions. Later revealed cards and whether you won are excluded. Alternatives use the existing bot-response and continuation model.

The score is an authored display scale:

`score = 100 / (1 + missed modeled expected value in big blinds)`

Missed value is the best tested action's average return minus your chosen action's average return, clamped at zero. A score of 100 matches the best **tested** choice in this model; 50 represents one big blind of estimated missed value; 25 represents three. This is not a winning percentage, expert grade, or measure of general poker skill. Different opponent ranges, responses, sizes or later player decisions can change it.

Paired sampling intervals compare alternatives on the same sampled deals and account for multiple tested alternatives. If the missed-value interval includes both zero and positive values, the rating is **Inconclusive** and has no numeric score. Otherwise the UI shows the conditional score and sampling range. Exact river enumeration is labeled exact **under the model**; it does not validate opponent assumptions. Malformed, old, incomplete or inadequately sampled comparisons are not rated.

Saved-game model agreement averages only rated decisions; omitted inconclusive and unavailable counts are shown. Legacy skill grades remain withheld. Profit is stored independently. Identical seeded reviews produce identical ratings, but that reproducibility does not make the strategy optimal.

## Draw density

On flop and turn reviews, each opponent's range can show:

`draw density = weight of hands with an included draw / total legal range weight × 100`

The initial definition includes ordinary four-card flush draws and open-ended straight draws. A hand with both counts once in the combined percentage; the breakdown shows the overlap. Made flushes/straights and draws to a weaker category are excluded. Gutshots, backdoor draws and straight-flush redraws are outside this initial measure. On the river there are no future cards, so no draw-density estimate is shown.

These are weights of exact legal combinations after your cards and the board block impossible hands; they are not counts of 169 starting-hand classes. A 35% density means 35% of this inferred range has an included draw. It does not mean a 35% chance of making that draw, winning, bluffing or calling. Draws may be dirty or lead to ties. Opponent ranges remain authored model estimates. In multiway play these are separate marginal ranges, not the collision-conditioned joint distribution used by showdown sampling.
