import { test, expect } from "@playwright/test";
test.beforeEach(async ({ request }) => {
  await request.delete("/api/progress");
});
test("complete exercise, show feedback, update progress and start next", async ({
  page,
}) => {
  await page.goto("/");
  await page.getByRole("button", { name: "Practice", exact: true }).click();
  await expect(
    page.getByRole("heading", { name: "Who wins at showdown?" }),
  ).toBeVisible();
  await expect(
    page.getByRole("region", { name: "Answer feedback" }),
  ).toHaveCount(0);
  await page.getByRole("radio", { name: "Player 1 wins", exact: true }).check();
  await page.getByRole("button", { name: "Check my answer" }).click();
  await expect(
    page.getByRole("region", { name: "Answer feedback" }),
  ).toBeVisible();
  await expect(page.getByRole("heading", { name: /Player 1 ·/ })).toBeVisible();
  await expect(page.locator(".showdown-comparison .card")).toHaveCount(10);
  await expect(page.locator(".hand-outcome")).toHaveCount(2);
  await expect(page.locator(".hand-outcome").first()).toContainText(
    /Stronger hand|Weaker hand|Equal hand/,
  );
  await page.screenshot({
    path: test.info().outputPath("showdown-feedback.png"),
    fullPage: true,
  });
  await expect(
    page.getByRole("button", { name: "Check my answer" }),
  ).toHaveCount(0);
  await page.getByRole("button", { name: "Next exercise" }).click();
  await expect(
    page.getByRole("button", { name: "Check my answer" }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Progress", exact: true }).click();
  await expect(page.getByText("EXERCISES COMPLETED")).toBeVisible();
  const stats = page.getByText("Detailed practice stats", { exact: true });
  await expect(
    page.getByRole("heading", { name: "Answer accuracy" }),
  ).not.toBeVisible();
  await stats.focus();
  await page.keyboard.press("Enter");
  await expect(
    page.getByRole("heading", { name: "Answer accuracy" }),
  ).toBeVisible();
  await expect(
    page.getByText("1 attempts", { exact: true }).first(),
  ).toBeVisible();
});
test("keyboard answers and focus moves to feedback", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("button", { name: "Practice", exact: true }).click();
  const radio = page.getByRole("radio", { name: "Tie", exact: true });
  await radio.focus();
  await page.keyboard.press("Space");
  await expect(radio).toBeChecked();
  await page.keyboard.press("Tab");
  await page.keyboard.press("Enter");
  await expect(
    page.getByRole("region", { name: "Answer feedback" }),
  ).toBeFocused();
});
test("all modes work and mobile layout stays within viewport", async ({
  page,
}) => {
  await page.goto("/");
  await page.getByRole("button", { name: "Practice", exact: true }).click();
  await page.getByRole("button", { name: "Pot odds", exact: true }).click();
  await page.getByLabel("Required equity", { exact: true }).fill("25");
  await page.getByRole("button", { name: "Check my answer" }).click();
  await expect(
    page.getByRole("region", { name: "Answer feedback" }),
  ).toContainText("threshold");
  await page
    .getByRole("button", { name: "Equity vs. range", exact: true })
    .click();
  await page.getByLabel("Street", { exact: true }).selectOption("turn");
  await page.getByLabel("Estimated equity").fill("30");
  await page.getByRole("button", { name: "Check my answer" }).click();
  await expect(page.getByRole("table")).not.toBeVisible();
  await page.getByText("Results for each hand", { exact: true }).click();
  await expect(page.getByRole("table")).toBeVisible();
  await page
    .getByRole("button", { name: "What beats me?", exact: true })
    .click();
  const selects = page.getByRole("combobox");
  for (let i = 0; i < 4; i++) await selects.nth(i).selectOption("beats");
  await page.getByRole("button", { name: "Check my answer" }).click();
  await page.getByText("Reveal possible stronger hand categories").click();
  await expect(
    page.getByText(/Possible does not mean likely\. Better kickers/),
  ).toBeVisible();
  await page
    .getByRole("button", { name: "Make a decision", exact: true })
    .click();
  await page.getByRole("radio").first().check();
  await page.getByRole("button", { name: "Check my answer" }).click();
  await expect(
    page.getByRole("region", { name: "Answer feedback" }),
  ).toBeVisible();
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth,
    ),
  ).toBe(true);
  await page.getByRole("button", { name: "Reference", exact: true }).click();
  await page.getByLabel("Find a concept").fill("Rule of 2");
  await expect(
    page.getByRole("heading", { name: "Rule of 2 and 4" }),
  ).toBeVisible();
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth,
    ),
  ).toBe(true);
});
test("clearing progress requires confirmation and can be cancelled", async ({
  page,
}) => {
  await page.goto("/");
  await page.getByRole("button", { name: "Practice", exact: true }).click();
  await page.getByRole("radio").first().check();
  await page.getByRole("button", { name: "Check my answer" }).click();
  await expect(
    page.getByRole("region", { name: "Answer feedback" }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Progress", exact: true }).click();
  await page
    .getByRole("button", { name: "Clear progress", exact: true })
    .click();
  await expect(page.getByRole("dialog")).toBeVisible();
  await page.getByRole("button", { name: "Keep progress" }).click();
  await expect(page.getByRole("dialog")).not.toBeVisible();
  await page
    .getByRole("button", { name: "Clear progress", exact: true })
    .click();
  await page.getByRole("button", { name: "Clear all progress" }).click();
  await page.getByText("Detailed practice stats", { exact: true }).click();
  await expect(
    page.getByText("Your completed exercises will appear here."),
  ).toBeVisible();
});
test("cash-only progress can be cleared with confirmation", async ({
  page,
  request,
}) => {
  const created = await request.post("/api/cash-practice/drills", {
    data: { players: 9, skill: "bluff-catch" },
  });
  expect(created.status()).toBe(201);
  const drill = await created.json();
  const saved = await request.post(
    `/api/cash-practice/drills/${drill.id}/answer`,
    {
      data: {
        phase: "initial",
        action: drill.initial.options[0].action,
        reasonId: drill.initial.reasons[0].id,
        estimatePercent: 0,
        confidence: "unsure",
      },
    },
  );
  expect(saved.ok()).toBe(true);
  expect((await (await request.get("/api/progress")).json()).total).toBe(0);
  expect(
    (await (await request.get("/api/cash-practice/progress")).json()).attempts,
  ).toBe(1);
  await page.goto("/");
  await page.getByRole("button", { name: "Progress", exact: true }).click();
  const clear = page.getByRole("button", {
    name: "Clear progress",
    exact: true,
  });
  await expect(clear).toBeEnabled();
  await clear.click();
  await expect(page.getByRole("dialog")).toBeVisible();
  await page
    .getByRole("button", { name: "Clear all progress", exact: true })
    .click();
  await expect(page.getByRole("dialog")).not.toBeVisible();
  expect(
    (await (await request.get("/api/cash-practice/progress")).json()).attempts,
  ).toBe(0);
});
test("reference starts with short definitions and keeps optional detail accessible", async ({
  page,
}) => {
  await page.goto("/");
  await page.getByRole("button", { name: "Reference", exact: true }).click();
  const card = page.locator(".reference-grid .panel").filter({
    has: page.getByRole("heading", {
      name: "Value bets and bluffs",
      exact: true,
    }),
  });
  await expect(card).toContainText("Bet for value when weaker hands can call.");
  const detail = card.locator("details");
  await expect(detail).not.toHaveAttribute("open", "");
  await expect(
    card.getByText(/To compare betting expected values/),
  ).not.toBeVisible();
  await card.getByText("More details", { exact: true }).focus();
  await page.keyboard.press("Enter");
  await expect(
    card.getByText(/To compare betting expected values/),
  ).toBeVisible();
  const library = page.getByRole("region", { name: "Opening chart library" });
  await expect(library).not.toBeVisible();
  await page.getByText("Opening charts", { exact: true }).click();
  await expect(library).toBeVisible();
});
test("practice needs no external network and cards remain visible", async ({
  page,
}, testInfo) => {
  const external: string[] = [];
  await page.route("**/*", (route) => {
    const url = new URL(route.request().url());
    if (url.hostname === "127.0.0.1") return route.continue();
    external.push(url.href);
    return route.abort();
  });
  await page.goto("/");
  await page.getByRole("button", { name: "Practice", exact: true }).click();
  await expect(
    page.getByRole("heading", { name: "Who wins at showdown?" }),
  ).toBeVisible();
  await expect(page.locator(".board .card")).toHaveCount(5);
  const card = page.locator(".board .card").first();
  const box = await card.boundingBox();
  expect(box?.width).toBeGreaterThanOrEqual(40);
  expect(box?.height).toBeGreaterThanOrEqual(60);
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth,
    ),
  ).toBe(true);
  await page.screenshot({
    path: `test-results/practice-${testInfo.project.name}.png`,
    fullPage: true,
  });
  await page.getByRole("radio").first().check();
  await page.getByRole("button", { name: "Check my answer" }).click();
  await expect(
    page.getByRole("region", { name: "Answer feedback" }),
  ).toBeVisible();
  expect(external).toEqual([]);
});
