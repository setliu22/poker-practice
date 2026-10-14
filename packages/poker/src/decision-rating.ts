import type { ModelDecisionRating } from "../../shared/src/decision-rating";
import type { DecisionReview } from "../../shared/src/table";

const EPSILON = 1e-8;
const MIN_SAMPLES = 200;
const MODEL_LIMITATION =
  "The opponent ranges and later betting assumptions are not validated against real players. This rates agreement with the tested choices in this model, not poker skill or optimal strategy.";

function unavailable(reason: string): ModelDecisionRating {
  return {
    version: 1,
    status: "unavailable",
    score: null,
    scoreInterval: null,
    regretBb: null,
    regretIntervalBb: null,
    explanation: `${reason} ${MODEL_LIMITATION}`,
  };
}

const finite = (n: unknown): n is number =>
  typeof n === "number" && Number.isFinite(n);
const nonnegative = (n: unknown): n is number => finite(n) && n >= 0;
const samples = (n: unknown): n is number =>
  nonnegative(n) && Number.isInteger(n);
const rounded = (n: number, precision: number) => {
  const factor = 10 ** precision;
  return Math.round(n * factor) / factor;
};

/**
 * A transparent, authored display scale: 100 / (1 + missed modeled EV in BB).
 * A 50 means one big blind of estimated missed EV, not a 50% winning chance.
 * The paired intervals already account for the tested alternatives upstream.
 * Only the canonical public-information analysis and its comparisons are read;
 * outcomes and revealed opponent cards must never affect this rating.
 */
export function decisionRating(
  round: DecisionReview,
  bigBlind = 10,
): ModelDecisionRating {
  if (!finite(bigBlind) || bigBlind <= 0)
    return unavailable(
      "A positive big blind is required to compare chip values.",
    );
  // Version 7 is the current canonical public-information decision analysis.
  // Do not score persisted older reviews with assumptions that were superseded.
  if (round.analysisVersion !== 7)
    return unavailable(
      "This decision needs a current public-information analysis.",
    );

  const { values, chosenKey, comparisons } = round;
  if (!Array.isArray(values) || !values.length || typeof chosenKey !== "string")
    return unavailable("The tested actions are missing or invalid.");

  const keys = new Set<string>();
  for (const value of values) {
    if (
      !value ||
      typeof value.key !== "string" ||
      !value.key ||
      keys.has(value.key) ||
      !finite(value.chips) ||
      !nonnegative(value.margin) ||
      typeof value.exact !== "boolean" ||
      !samples(value.samples) ||
      (value.exact
        ? value.samples !== 0 || value.margin !== 0
        : value.samples < MIN_SAMPLES)
    )
      return unavailable("The action estimates are incomplete or invalid.");
    keys.add(value.key);
  }
  const chosen = values.find((value) => value.key === chosenKey);
  if (!chosen)
    return unavailable("Your selected action is missing from the comparison.");
  if (values.length < 2)
    return unavailable("There is no alternative tested action to compare.");
  if (!Array.isArray(comparisons) || comparisons.length !== values.length - 1)
    return unavailable("Every tested alternative needs a paired comparison.");

  const compared = new Set<string>();
  for (const comparison of comparisons) {
    if (
      !comparison ||
      typeof comparison.key !== "string" ||
      comparison.key === chosenKey ||
      compared.has(comparison.key) ||
      !finite(comparison.difference) ||
      !nonnegative(comparison.margin) ||
      !samples(comparison.samples) ||
      typeof comparison.clear !== "boolean"
    )
      return unavailable("The paired comparisons are incomplete or invalid.");
    const alternative = values.find((value) => value.key === comparison.key);
    if (!alternative)
      return unavailable("A paired comparison refers to an untested action.");
    const exactPair = chosen.exact && alternative.exact;
    if (
      exactPair
        ? comparison.samples !== 0 || comparison.margin !== 0
        : comparison.samples < MIN_SAMPLES ||
          (!chosen.exact && comparison.samples !== chosen.samples) ||
          (!alternative.exact && comparison.samples !== alternative.samples)
    )
      return unavailable(
        "The paired comparisons do not have adequate sampling.",
      );
    const difference = alternative.chips - chosen.chips;
    const tolerance = EPSILON * Math.max(1, Math.abs(difference));
    if (
      !finite(difference) ||
      !finite(comparison.difference - comparison.margin) ||
      !finite(comparison.difference + comparison.margin) ||
      Math.abs(difference - comparison.difference) > tolerance
    )
      return unavailable(
        "The paired differences disagree with the action estimates.",
      );
    const clear = exactPair
      ? comparison.difference > EPSILON
      : comparison.difference > comparison.margin;
    if (comparison.clear !== clear)
      return unavailable(
        "A comparison's certainty label is inconsistent with its interval.",
      );
    compared.add(comparison.key);
  }

  const regret = Math.max(
    0,
    ...comparisons.map((comparison) => comparison.difference),
  );
  const lower = Math.max(
    0,
    ...comparisons.map(
      (comparison) => comparison.difference - comparison.margin,
    ),
  );
  const upper = Math.max(
    0,
    ...comparisons.map(
      (comparison) => comparison.difference + comparison.margin,
    ),
  );
  const regretBb = regret / bigBlind;
  const regretIntervalBb: [number, number] = [
    lower / bigBlind,
    upper / bigBlind,
  ];
  if (![regretBb, ...regretIntervalBb].every(finite))
    return unavailable(
      "The estimates cannot be represented safely in big blinds.",
    );

  if (lower <= EPSILON && upper > EPSILON)
    return {
      version: 1,
      status: "inconclusive",
      score: null,
      scoreInterval: null,
      regretBb,
      regretIntervalBb,
      explanation: `The sampling interval allows both no missed value and a better tested choice, so a decision score would imply more certainty than these simulations provide. ${MODEL_LIMITATION}`,
    };

  const score = (loss: number) => 100 / (1 + loss / bigBlind);
  const exact = values.every((value) => value.exact);
  return {
    version: 1,
    status: exact ? "exact-under-model" : "estimated",
    score: rounded(score(regret), 1),
    scoreInterval: [rounded(score(upper), 1), rounded(score(lower), 1)],
    regretBb,
    regretIntervalBb,
    explanation: `${exact ? "Exactly calculated under the stated model" : "Estimated from the paired simulations"}. The scale is 100 / (1 + missed modeled value in big blinds): 100 matches the best tested choice; 50 represents one big blind of missed modeled value. It is not a winning probability. ${MODEL_LIMITATION}`,
  };
}
