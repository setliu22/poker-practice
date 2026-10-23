import { test, expect } from "@playwright/test";
test("practices an all-in decision and price contrast without mandatory card classification", async ({
  page,
}) => {
  await page.goto("/");
  await page
    .getByRole("navigation", { name: "Main navigation" })
    .getByRole("button", { name: "Reference", exact: true })
    .click();
  await page
    .getByRole("button", { name: "Open legacy lessons", exact: true })
    .click();

  await page
    .getByRole("button", { name: "Open all-in decision practice" })
    .click();
  const loading = page.waitForResponse(
    (response) =>
      response.url().endsWith("/api/learning/read/") &&
      response.request().method() === "POST",
  );
  await page.getByRole("button", { name: "Start decision practice" }).click();
  const q = await (await loading).json();
  await expect(page.getByRole("heading", { name: q.title })).toBeVisible();
  await expect(
    page.getByText("Supplied range after the shove", { exact: true }),
  ).toBeVisible();
  await expect(page.getByLabel("Optional equity estimate")).toBeVisible();
  await expect(
    page.locator(".learning-opponents .learning-opponent"),
  ).toHaveCount(q.opponents.length);
  for (const opponent of q.opponents)
    await expect(
      page
        .getByText(`${(opponent.prior * 100).toFixed(0)}% of the range`, {
          exact: true,
        })
        .first(),
    ).toBeVisible();
  const help = page.locator("details").filter({
    has: page.getByText("Help estimate: exact matchup shares", { exact: true }),
  });
  await expect(help).not.toHaveAttribute("open", "");
  await expect(help.getByText(/Weighted share:/)).not.toBeVisible();
  await page
    .getByText("Help estimate: exact matchup shares", { exact: true })
    .click();
  await expect(page.getByText(/Weighted share:/)).toBeVisible();
  await help.locator("summary").click();
  const priceHelp = page.locator("details").filter({
    has: page.getByText("Call price help", { exact: true }),
  });
  await expect(priceHelp.locator("p")).not.toBeVisible();
  await priceHelp.locator("summary").focus();
  await page.keyboard.press("Enter");
  await expect(priceHelp.locator("p")).toContainText(
    `Final pot = ${q.potBefore} + ${q.bet} + your ${q.bet} call`,
  );
  await expect(priceHelp.locator("p")).toBeVisible();
  await page.getByLabel("Required pot share", { exact: true }).fill("20");
  const equity = q.guide.reduce(
    (sum: number, row: { weight: number; equity: number }) =>
      sum + row.weight * row.equity,
    0,
  );
  const choice = (equity / 100) * (q.potBefore + 2 * q.bet) - q.bet > 0 ? 0 : 1;
  const counter =
    (equity / 100) * (q.potBefore + 2 * q.counterBet) - q.counterBet > 0
      ? 0
      : 1;
  await page.locator('input[name="decision-action"]').nth(choice).check();
  await page.locator('input[name="counter-action"]').nth(counter).check();
  await page.getByRole("button", { name: "Check both decisions" }).click();
  const feedback = page.getByRole("region", { name: "Decision feedback" });
  await expect(feedback).toContainText("Changed price: correct");
  await expect(feedback.locator(":scope > p")).toContainText([
    "Changed price: correct",
    "under this range",
    "your hand's equity stays the same",
  ]);
  await expect(feedback.locator(":scope > p").nth(1)).toContainText(
    equity.toFixed(1),
  );
  const primary = await feedback.locator(":scope > p").allTextContents();
  expect(primary.join(" ").trim().split(/\s+/).length).toBeLessThanOrEqual(60);
  const calculation = feedback.locator("details");
  await expect(calculation).not.toHaveAttribute("open", "");
  await expect(calculation.locator("p").first()).not.toBeVisible();
  await calculation.locator("summary").click();
  await expect(calculation.locator("p").first()).toBeVisible();
  await expect(calculation).toContainText(
    "Required pot share = cost to call ÷ final pot",
  );
  await page.getByRole("button", { name: "Repeat this situation" }).click();
  await expect(
    page.getByLabel("Required pot share", { exact: true }),
  ).toHaveValue("");
  await page.getByRole("button", { name: "Back to lessons" }).click();
  await expect(
    page.getByRole("button", { name: "Open all-in decision practice" }),
  ).toBeVisible();
});
