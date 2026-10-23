import { test, expect } from "@playwright/test";
import type { ModelDecisionRating } from "../../packages/shared/src/decision-rating";
import type { TableView } from "../../packages/shared/src/table";

// Authored display fixtures; numerical grading is verified independently in Vitest.
const fixtures: ModelDecisionRating[] = [
  {
    version: 1,
    status: "estimated",
    score: 50,
    scoreInterval: [45.5, 55.6],
    regretBb: 1,
    regretIntervalBb: [0.8, 1.2],
    explanation:
      "100 / (1 + missed modeled value in big blinds). This rates agreement with the tested choices in this model, not poker skill or optimal strategy.",
  },
  {
    version: 1,
    status: "inconclusive",
    score: null,
    scoreInterval: null,
    regretBb: 0.3,
    regretIntervalBb: [0, 1.3],
    explanation:
      "The sampling interval allows both no missed value and a better tested choice, so a decision score would imply more certainty than these simulations provide.",
  },
  {
    version: 1,
    status: "exact-under-model",
    score: 99.6,
    scoreInterval: [99.6, 99.6],
    regretBb: 0.004,
    regretIntervalBb: [0.004, 0.004],
    explanation:
      "The best tested action returns 0.004 big blinds more in this model. This is not proof of optimal poker strategy.",
  },
  {
    version: 1,
    status: "unavailable",
    score: null,
    scoreInterval: null,
    regretBb: null,
    regretIntervalBb: null,
    explanation:
      "The paired comparison is unavailable. No decision score can be inferred.",
  },
];

for (const rating of fixtures) {
  test(`decision rating ${rating.status} is qualified, accessible and usable on mobile`, async ({
    page,
    request,
  }) => {
    await page.setViewportSize({
      width: test.info().project.name === "mobile" ? 320 : 1280,
      height: 850,
    });
    const response = await request.post("/api/tables", {
      data: { players: 2 },
    });
    const start = (await response.json()) as TableView;
    const result = await request.post(`/api/tables/${start.id}/actions`, {
      data: {
        revision: start.revision,
        actionId: crypto.randomUUID(),
        action: "fold",
      },
    });
    expect(result.status()).toBe(200);
    const completed = (await result.json()) as TableView;
    expect(completed.rounds![0].modelRating?.version).toBe(1);
    completed.rounds![0].modelRating = rating;
    await page.route("**/api/tables", async (route) => {
      if (route.request().method() !== "POST") return route.fallback();
      await route.fulfill({ status: 201, json: completed });
    });
    await page.goto("/");
    await page.getByRole("button", { name: "Play", exact: true }).click();
    await page
      .getByRole("button", { name: "Start table", exact: true })
      .click();
    await page.getByRole("button", { name: /^Review decisions/ }).click();
    const estimate = page.locator(".bot-estimate-details");
    await expect(estimate).not.toHaveAttribute("open", "");
    await expect(page.locator(".model-rating")).toBeHidden();
    await estimate.locator(":scope > summary").focus();
    await page.keyboard.press("Enter");
    const panel = page.getByRole("region", {
      name: "Model agreement score",
      exact: true,
    });
    await expect(panel).toBeVisible();
    await expect(
      panel.getByText("Bot model estimate. A 100 does not mean perfect play.", {
        exact: true,
      }),
    ).toBeVisible();
    const explanation = panel.getByText("How the score works", { exact: true });
    await expect(panel.locator("details")).not.toHaveAttribute("open", "");
    await explanation.focus();
    await page.keyboard.press("Enter");
    await expect(panel).toContainText(
      "cards revealed afterward do not affect it",
    );
    await expect(panel).toContainText("not a general poker-skill grade");
    await expect(panel).toContainText("A 100 does not mean perfect play");
    if (rating.score === null) {
      await expect(panel).toContainText(
        rating.status === "inconclusive" ? "Inconclusive" : "Not rated",
      );
      await expect(panel.locator(".model-rating-number")).not.toContainText(
        "/ 100",
      );
    } else {
      await expect(panel.locator(".model-rating-number")).toHaveText(
        `≈ ${rating.score.toFixed(1)} / 100`,
      );
      if (rating.status === "estimated") {
        await expect(panel).toContainText("1.00 big blinds of missed value");
        await expect(panel).toContainText("45.5–55.6 / 100");
      } else {
        await expect(panel).toContainText(
          "less than 0.01 big blinds of missed value",
        );
        await expect(panel).not.toContainText(
          "matches the highest estimated return",
        );
      }
    }
    await expect(panel).toContainText("not a winning percentage");
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    ).toBe(true);
    await panel.screenshot({
      path: test.info().outputPath("decision-rating.png"),
    });
  });
}
