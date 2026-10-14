import { it, expect } from "vitest";
import { openingCharts } from "../packages/poker/src/preflop-charts";
import {
  baselineAction,
  walkthroughChart,
  preflopTransfer,
  raisedPotExample,
} from "../packages/shared/src/preflop-walkthrough";
import { validateCards } from "../packages/poker/src/index";
it("uses the actual authored six-player opening contrast, not a solved strategy score", () => {
  const early = walkthroughChart(openingCharts, "Lojack")!,
    late = walkthroughChart(openingCharts, "Button")!;
  expect(baselineAction(late, "KQs")).toBe("raise");
  expect(baselineAction(early, "KTo")).toBe("fold");
  expect(baselineAction(late, "KTo")).toBe("raise");
  expect(late.status).toBe("illustrative");
  expect(late.source.name).toContain("authored");
});
it("fresh transfer hands stay within matching six-player unopened baselines", () => {
  const hands = new Set<string>(),
    positions = new Set<string>();
  for (let seed = 0; seed < 1600; seed++) {
    const spot = preflopTransfer(openingCharts, seed);
    expect(spot.chart.players).toBe(6);
    expect(spot.chart.position).toBe(spot.position);
    expect(baselineAction(spot.chart, spot.hand)).toBe(spot.action);
    validateCards(spot.hole, 2, 2);
    hands.add(spot.hand);
    positions.add(spot.position);
  }
  expect(hands.size).toBeGreaterThan(30);
  expect(positions.size).toBe(4);
  expect(raisedPotExample.minimumRaiseTo).toBe(
    raisedPotExample.raiseTo + (raisedPotExample.raiseTo - 10),
  );
  expect(raisedPotExample.callCost).toBe(25);
});
