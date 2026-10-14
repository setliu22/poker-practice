import { test, expect } from "@playwright/test";
test("practices an all-in decision and price contrast without mandatory card classification", async ({
  page,
}) => {
  await page.goto("/");
  await page
    .getByText("More practice and earlier lessons", { exact: true })
    .click();
  await page.getByRole("button", { name: "Open earlier exercises" }).click();

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
  await page
    .getByText("Help estimate: exact matchup shares", { exact: true })
    .click();
  await expect(page.getByText(/Weighted share:/)).toBeVisible();
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
  await expect(feedback).toContainText("Your hand's equity stays the same");
  await page.getByRole("button", { name: "Repeat this situation" }).click();
  await expect(
    page.getByLabel("Required pot share", { exact: true }),
  ).toHaveValue("");
  await page.getByRole("button", { name: "Back to lessons" }).click();
  await expect(
    page.getByRole("button", { name: "Open all-in decision practice" }),
  ).toBeVisible();
});
