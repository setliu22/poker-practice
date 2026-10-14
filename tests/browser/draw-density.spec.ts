import { test, expect } from "@playwright/test";
import type {
  DecisionReview,
  TableView,
} from "../../packages/shared/src/table";
import type { RangeDrawDensity } from "../../packages/shared/src/range-draws";

// Independent authored display fixture on 9h 8h 2c:
// Ah3h (20%) has a flush draw; Tc7d (10%) is open-ended;
// Th7h (5%) has both; Qc4d (65%) has neither. Union = 35%, not 40%.
const density: RangeDrawDensity = {
  percent: 35,
  flushDraw: 25,
  openEndedStraightDraw: 15,
  both: 5,
  note: "These draws describe the legal hands in this authored range on the visible board.",
};

function review(street: string, id: number): DecisionReview {
  const board =
    street === "preflop"
      ? []
      : street === "flop"
        ? ["9h", "8h", "2c"]
        : street === "turn"
          ? ["9h", "8h", "2c", "4s"]
          : ["9h", "8h", "2c", "4s", "5d"];
  return {
    id,
    street,
    board,
    hero: ["As", "Kd"],
    hand: "High card",
    action: "Check",
    pot: 100,
    call: 0,
    callThreshold: null,
    risk: 0,
    bluffThreshold: null,
    opponents: [
      {
        seat: 1,
        name: "Nico",
        style: "Aggressive",
        combinations: 4,
        groups: [{ name: "Authored combinations", percent: 100 }],
        examples: [
          { cards: ["Ah", "3h"], weight: 20 },
          { cards: ["Tc", "7d"], weight: 10 },
          { cards: ["Th", "7h"], weight: 5 },
          { cards: ["Qc", "4d"], weight: 65 },
        ],
        ...(["flop", "turn"].includes(street) ? { drawDensity: density } : {}),
      },
    ],
    rangeProbability: {
      win: 40,
      tie: 0,
      lose: 60,
      share: 40,
      exact: false,
      samples: 400,
      note: "Authored display-only odds fixture.",
    },
    values: [
      {
        key: "check",
        label: "Check",
        chips: 0,
        margin: 5,
        exact: false,
        samples: 400,
        allFold: 0,
      },
    ],
    chosenKey: "check",
    verdict: "Model comparison only",
    explanation: "Authored UI fixture; no strategic recommendation.",
    model: "Authored display fixture.",
    rangeNote: "Range weights come from the authored fixture.",
  };
}

test("draw density shows a weighted union without double counting and explains it by keyboard on mobile", async ({
  page,
  request,
}) => {
  await page.setViewportSize({
    width: test.info().project.name === "mobile" ? 320 : 1280,
    height: 850,
  });
  const response = await request.post("/api/tables", { data: { players: 2 } });
  const view = (await response.json()) as TableView;
  view.rounds = [
    review("preflop", 1),
    review("flop", 2),
    review("turn", 3),
    review("river", 4),
  ];
  await page.route("**/api/tables", (route) =>
    route.request().method() === "POST"
      ? route.fulfill({ status: 201, json: view })
      : route.fallback(),
  );
  await page.goto("/");
  await page.getByRole("button", { name: "Bot table", exact: true }).click();
  await page.getByRole("button", { name: "Start table", exact: true }).click();
  await page.getByRole("button", { name: /^Review decisions/ }).click();
  const reviews = page.locator(".decision-review");
  await expect(reviews).toHaveCount(4);
  await expect(reviews.nth(0).locator(".draw-density")).toHaveCount(0);
  await expect(reviews.nth(3).locator(".draw-density")).toHaveCount(0);
  for (const index of [1, 2]) {
    const round = reviews.nth(index);
    await round.locator(":scope > summary").click();
    await expect(round.locator(".range-details > summary")).toBeHidden();
    await round.locator(".bot-estimate-details > summary").click();
    await round.locator(".range-details > summary").click();
    const panel = round.getByRole("region", {
      name: "Draw density: 35.0% of Nico’s estimated range",
    });
    await expect(panel).toBeVisible();
    await expect(panel.locator(".draw-density-total")).toHaveText(
      "Draw density: 35.0% of Nico’s estimated range",
    );
    await expect(panel.locator(".draw-density-total")).not.toContainText(
      "40.0%",
    );
    const summary = panel.getByText("What counts as a draw?", { exact: true });
    await summary.focus();
    await page.keyboard.press("Enter");
    await expect(panel.locator("dd")).toHaveText(["25.0%", "15.0%", "5.0%"]);
    await expect(panel.getByText(/both draws are counted once/)).toBeVisible();
    await expect(
      panel.getByText(/other draws, such as gutshots, are excluded/),
    ).toBeVisible();
    await expect(
      panel.getByText(
        /not a winning probability or a count of guaranteed winning outs/,
      ),
    ).toBeVisible();
    await expect(
      panel.getByText(/hand weights, not a simple count/),
    ).toBeVisible();
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    ).toBe(true);
    await panel.screenshot({
      path: test.info().outputPath(`draw-density-${index}.png`),
    });
    await summary.focus();
    await page.keyboard.press("Enter");
    await expect(panel.locator(".draw-density-details")).not.toHaveAttribute(
      "open",
      "",
    );
    await expect(panel.locator(".draw-density-total")).toBeVisible();
  }
});
