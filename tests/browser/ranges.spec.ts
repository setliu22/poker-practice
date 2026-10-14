import { test, expect } from "@playwright/test";
import type {
  DecisionReview,
  RangeReview,
  TableView,
} from "../../packages/shared/src/table";

// Authored UI fixtures: no evaluator or bot model supplies expected values.
function reviewFixture(): DecisionReview {
  const ranks = "AKQJT98765432".split("");
  const suits = "cdhs".split("");
  const known = new Set(["As", "Ah", "Ad", "Ac", "2c", "3d", "4h"]);
  const matrix: NonNullable<RangeReview["matrix"]> = [];
  for (let row = 0; row < 13; row++) {
    for (let column = 0; column < 13; column++) {
      const high = ranks[Math.min(row, column)];
      const low = ranks[Math.max(row, column)];
      const hand =
        row === column
          ? `${high}${low}`
          : `${high}${low}${row < column ? "s" : "o"}`;
      let available = 0;
      for (let a = 0; a < 4; a++) {
        for (let b = 0; b < 4; b++) {
          if (row === column && a >= b) continue;
          if (row < column && a !== b) continue;
          if (row > column && a === b) continue;
          if (!known.has(high + suits[a]) && !known.has(low + suits[b]))
            available++;
        }
      }
      matrix.push({
        hand,
        available,
        combinations: hand === "KQo" ? 0 : available,
        percent: 0,
      });
    }
  }
  const total = matrix.reduce((sum, cell) => sum + cell.combinations, 0);
  for (const cell of matrix) cell.percent = (cell.combinations / total) * 100;
  const probability = {
    win: 100,
    tie: 0,
    lose: 0,
    share: 100,
    exact: true,
    samples: total,
    note: "Exact against this authored fixture range.",
  };
  return {
    id: 1,
    street: "river",
    board: ["Ad", "Ac", "2c", "3d", "4h"],
    hero: ["As", "Ah"],
    hand: "Four of a kind",
    action: "Check",
    pot: 100,
    call: 0,
    callThreshold: null,
    risk: 50,
    bluffThreshold: 100 / 3,
    opponents: [
      {
        seat: 1,
        name: "Theo",
        style: "Balanced",
        combinations: total,
        matrix,
        matchup: { ahead: 100, tied: 0, behind: 0 },
        groups: [{ name: "Pair or better", percent: 100 }],
        examples: [{ cards: ["Kh", "Kd"], weight: 100 / total }],
      },
    ],
    rangeProbability: probability,
    values: [
      {
        key: "check",
        label: "Check",
        chips: 100,
        margin: 0,
        exact: true,
        samples: 0,
        allFold: 0,
      },
      {
        key: "raise",
        label: "Bet 50",
        chips: 110,
        margin: 0,
        exact: true,
        samples: 0,
        allFold: 50,
      },
      {
        key: "raise-100",
        label: "Bet 100",
        chips: 120,
        margin: 0,
        exact: true,
        samples: 0,
        allFold: 65,
      },
    ],
    responsePreviews: [
      {
        key: "raise",
        label: "Bet 50",
        fold: 50,
        call: 35,
        raise: 15,
        foldExamples: [{ cards: ["Kh", "Kd"], percent: 2 }],
        callExamples: [{ cards: ["Qh", "Qd"], percent: 1.5 }],
        raiseExamples: [{ cards: ["Jh", "Jd"], percent: 0.5 }],
      },
      {
        key: "raise-100",
        label: "Bet 100",
        fold: 65,
        call: 25,
        raise: 10,
        foldExamples: [{ cards: ["Kh", "Kd"], percent: 3 }],
        callExamples: [{ cards: ["Qh", "Qd"], percent: 2 }],
        raiseExamples: [{ cards: ["Jh", "Jd"], percent: 1 }],
      },
    ],
    chosenKey: "check",
    verdict: "Model comparison only",
    explanation:
      "These assumed responses describe the bot model; they do not establish an optimal action against real players.",
    model: "Authored UI fixture.",
    rangeNote: "Only public actions and known-card blockers are used.",
    context: {
      position: "Hijack",
      opponents: 1,
      playersStillToAct: 1,
      stack: 950,
      effectiveStack: 900,
      raises: 2,
      closingCall: false,
      callReason:
        "No call is required; the opponent can still respond to a bet.",
      observations: [
        "Your four aces currently beat every legal opponent hand on this board.",
      ],
      bestFive: ["As", "Ah", "Ad", "Ac", "4h"],
      takeaway:
        "A value bet needs weaker hands that will call, not just a strong hand.",
    },
  };
}

test("range tables explain blockers and weights, support keyboard navigation, and contain mobile scrolling", async ({
  page,
  request,
}) => {
  await page.setViewportSize({
    width: test.info().project.name === "mobile" ? 320 : 1280,
    height: 850,
  });
  const response = await request.post("/api/tables", { data: { players: 2 } });
  expect(response.status()).toBe(201);
  const view = (await response.json()) as TableView;
  view.rounds = [reviewFixture()];
  await page.route("**/api/tables", async (route) => {
    if (route.request().method() !== "POST") return route.fallback();
    await route.fulfill({ status: 201, json: view });
  });
  await page.goto("/");
  await page.getByRole("button", { name: "Bot table", exact: true }).click();
  await page.getByRole("button", { name: "Start table", exact: true }).click();
  await page.getByRole("button", { name: /^Review decisions/ }).click();
  const facts = page.getByRole("region", { name: "Decision facts" });
  await expect(facts).toBeVisible();
  await expect(facts).toContainText("Hijack");
  await expect(facts).toContainText("1 opponent");
  await expect(facts).toContainText("950 chips");
  await expect(facts).toContainText("100 chips");
  await expect(facts).toContainText(
    "Your four aces currently beat every legal opponent hand",
  );
  await expect(facts).toContainText(
    "A value bet needs weaker hands that will call",
  );
  await expect(facts.locator(".move-best-five .card")).toHaveCount(5);
  const advanced = page.locator(".advanced-comparison");
  await expect(advanced).not.toHaveAttribute("open", "");
  await expect(
    page.getByRole("table", {
      name: "Modeled average net chips from this decision",
    }),
  ).toBeHidden();
  const ranges = page.locator(".range-details");
  await ranges
    .getByText("Opponent ranges · what could they have?", { exact: true })
    .click();
  const grid = page.getByRole("grid", { name: "Theo’s estimated range" });
  await expect(grid).toBeVisible();
  await expect(grid.getByRole("gridcell")).toHaveCount(169);
  await expect(grid.getByRole("row")).toHaveCount(13);
  await expect(
    ranges.getByText(
      /not a starting-hand strategy chart or a chance of winning/,
    ),
  ).toBeVisible();
  await expect(
    ranges.getByText(/not winning odds after future cards/),
  ).toBeVisible();
  const aa = grid.getByRole("button", { name: /^AA:/ });
  await aa.focus();
  await page.keyboard.press("ArrowRight");
  await expect(grid.getByRole("button", { name: /^AKs:/ })).toBeFocused();
  await page.keyboard.press("ArrowDown");
  await expect(grid.getByRole("button", { name: /^KK:/ })).toBeFocused();
  await expect(page.locator(".range-cell-detail")).toContainText(
    "6 positive-weight combinations out of 6 legal combinations",
  );
  await page.keyboard.press("Control+Home");
  await expect(aa).toBeFocused();
  await expect(page.locator(".range-cell-detail")).toContainText(
    "All combinations are blocked",
  );
  await grid.getByRole("button", { name: /^KQo:/ }).click();
  await expect(page.locator(".range-cell-detail")).toContainText(
    "0 positive-weight combinations out of 12 legal combinations",
  );
  await expect(page.locator(".range-cell-detail")).toContainText("zero weight");
  expect(await grid.locator("button[tabindex='0']").count()).toBe(1);
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
  await ranges.screenshot({ path: test.info().outputPath("range-matrix.png") });

  const selector = page.getByLabel("Compare bet sizes", { exact: true });
  await expect(
    page.getByRole("region", { name: "How the opponent may respond" }),
  ).toBeVisible();
  await expect(
    page.getByRole("region", { name: "Fold response" }),
  ).toContainText("50.0%");
  await expect(
    page.getByRole("region", { name: "Call response" }),
  ).toContainText("35.0%");
  await expect(
    page.getByRole("region", { name: "Re-raise response" }),
  ).toContainText("15.0%");
  await selector.selectOption("raise-100");
  await expect(
    page.getByRole("region", { name: "Fold response" }),
  ).toContainText("65.0%");
  await expect(
    page.getByRole("region", { name: "Call response" }),
  ).toContainText("25.0%");
  await expect(
    page.getByRole("region", { name: "Re-raise response" }),
  ).toContainText("10.0%");
  await expect(
    page.getByText(/exact hand and that response together/),
  ).toBeVisible();
  await expect(advanced).not.toHaveAttribute("open", "");
  await advanced
    .getByText("Advanced: modeled action comparison", { exact: true })
    .click();
  await expect(
    page.getByRole("table", {
      name: "Modeled average net chips from this decision",
    }),
  ).toBeVisible();
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
});
