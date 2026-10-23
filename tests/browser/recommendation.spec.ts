import { test, expect } from "@playwright/test";
for (const suggestion of ["fold", "call", "raise"] as const) {
  test(`highlights ${suggestion} without betting and does not highlight a different raise size`, async ({
    page,
    request,
  }) => {
    await page.route("**/api/tables/*/assistant", async (route) => {
      const input = route.request().postDataJSON();
      if (input.layer !== "advice") return route.fallback();
      await route.fulfill({
        json: {
          revision: input.revision,
          samples: 1600,
          opponents: [],
          values: [],
          recommendation: {
            key: suggestion,
            action: suggestion,
            ...(suggestion === "raise" ? { amount: 25 } : {}),
            label:
              suggestion === "raise"
                ? "Raise to 25"
                : suggestion === "call"
                  ? "Call 5"
                  : "Fold",
            chips: 5,
            status: "close",
            alternatives: ["fold"],
            explanation: "A tentative bot-model preference.",
          },
        },
      });
    });
    await page.goto("/");
    await page.getByRole("button", { name: "Play", exact: true }).click();
    await page
      .getByRole("button", { name: "Start table", exact: true })
      .click();
    await page
      .getByRole("button", { name: "Show move hint", exact: true })
      .click();
    const advice = page.getByRole("region", {
      name: "Suggested move",
      exact: true,
    });
    await expect(advice).toContainText("Tentative suggestion");
    await expect(
      advice.getByText("Bot estimate", { exact: true }),
    ).toBeVisible();
    const detail = advice.locator("details");
    await expect(detail).not.toHaveAttribute("open", "");
    await expect(
      advice.getByText("A tentative bot-model preference.", { exact: true }),
    ).toBeHidden();
    await detail.locator(":scope > summary").focus();
    await page.keyboard.press("Enter");
    await expect(
      advice.getByText("A tentative bot-model preference.", { exact: true }),
    ).toBeVisible();
    const id = await page.evaluate(() =>
      localStorage.getItem("poker-practice-table"),
    );
    const before = await (await request.get(`/api/tables/${id}`)).json();
    const button = page.getByRole("button", {
      name:
        suggestion === "raise"
          ? "Raise"
          : suggestion === "call"
            ? "Call 5"
            : "Fold",
      exact: true,
    });
    if (suggestion === "raise") {
      await expect(button).not.toHaveClass(/recommended-action/);
      await page
        .getByRole("button", { name: "Use suggested size (25)", exact: true })
        .click();
      await expect(
        page.getByLabel("Raise to (total chips this street)", { exact: true }),
      ).toHaveValue("25");
    }
    await expect(button).toHaveClass(/recommended-action/);
    expect(await (await request.get(`/api/tables/${id}`)).json()).toEqual(
      before,
    );
    await page.screenshot({
      path: test.info().outputPath("highlighted-move.png"),
      fullPage: true,
    });
  });
}
test("solver chart shows mixed actions, keyboard access, mobile scrolling and read-only state", async ({
  page,
  request,
}) => {
  const ranks = "AKQJT98765432",
    cells = ranks.split("").flatMap((r, i) =>
      ranks.split("").map((c, j) => ({
        hand: i === j ? r + c : i < j ? r + c + "s" : c + r + "o",
        frequencies: [10, 30, 60],
        reach: 1,
      })),
    );
  let calls = 0;
  await page.route("**/api/tables/*/solver-chart", async (route) => {
    const { revision } = route.request().postDataJSON();
    calls++;
    await route.fulfill({
      status: calls === 1 ? 202 : 200,
      json:
        calls === 1
          ? {
              status: "solving",
              revision,
              message: "Computing locally",
              source: "GTOpen",
              engineRevision: "test",
            }
          : {
              status: "ready",
              revision,
              message: "Solved within this model",
              source: "GTOpen",
              engineRevision: "test",
              iteration: 25,
              gap: 0.01,
              targetGap: 0.05,
              converged: true,
              actions: [
                { kind: "fold", label: "Fold" },
                { kind: "call", label: "Call 5" },
                { kind: "raise", label: "Raise to 25", amount: 25 },
              ],
              cells,
              limitations: [
                "Approximate continuation; not the named practice bots.",
              ],
            },
    });
  });
  await page.goto("/");
  await page.getByRole("button", { name: "Play", exact: true }).click();
  await page.getByRole("button", { name: "Start table", exact: true }).click();
  await page
    .getByRole("button", { name: "Show move hint", exact: true })
    .click();
  const open = page.getByRole("button", {
    name: "Solver range chart",
    exact: true,
  });
  await expect(open).toBeVisible();
  const id = await page.evaluate(() =>
      localStorage.getItem("poker-practice-table"),
    ),
    before = await (await request.get(`/api/tables/${id}`)).json();
  await open.click();
  const dialog = page.getByRole("dialog", {
    name: "Solver range chart",
    exact: true,
  });
  const grid = dialog.getByRole("grid", {
    name: "GTOpen starting-hand strategy",
  });
  await expect(grid.getByRole("gridcell")).toHaveCount(169, { timeout: 30000 });
  const own = grid.locator("button[aria-current=true]");
  await own.focus();
  await page.keyboard.press("Home");
  await expect(grid.locator("button[tabindex='0']")).toHaveCount(1);
  await expect(dialog.getByText(/Solver’s most-used action/)).toBeVisible();
  await expect(dialog).toContainText("not your chance of winning");
  expect(await (await request.get(`/api/tables/${id}`)).json()).toEqual(before);
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
  await dialog.screenshot({ path: test.info().outputPath("solver-chart.png") });
  await page.keyboard.press("Escape");
  await expect(open).toBeFocused();
});
