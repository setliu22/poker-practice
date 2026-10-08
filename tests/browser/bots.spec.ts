import { test, expect } from "@playwright/test";
test("select a multiway table, play a hand, read feedback, and resume it", async ({
  page,
}) => {
  await page.goto("/");
  await page.getByRole("button", { name: "Bot table", exact: true }).click();
  await page.getByLabel("Players, including you").selectOption("6");
  await page.getByRole("button", { name: "Start table", exact: true }).click();
  await expect(page.getByRole("region", { name: "Poker table" })).toBeVisible();
  await expect(page.locator(".bot-seat")).toHaveCount(6);
  // Bots play only between learner decisions; checking/calling must finish a hand.
  for (let i = 0; i < 80; i++) {
    if (
      await page
        .getByRole("heading", { name: "Hand complete", exact: true })
        .count()
    )
      break;
    const check = page.getByRole("button", { name: "Check", exact: true });
    if (await check.count()) await check.click();
    else await page.getByRole("button", { name: /^Call \d+$/ }).click();
    await expect(page.getByRole("status")).toHaveCount(0);
  }
  await expect(
    page.getByRole("region", { name: "Hand feedback" }),
  ).toBeVisible();
  await expect(page.getByText("Bot policy", { exact: true })).toBeVisible();
  await expect(
    page.getByRole("region", { name: "Decision reviews" }),
  ).toBeVisible();
  await expect(
    page.getByRole("heading", { name: "Against the estimated ranges" }).last(),
  ).toBeVisible();
  await expect(
    page.getByRole("heading", { name: "Against the actual cards" }).last(),
  ).toBeVisible();
  await page
    .getByText("Opponent ranges · what could they have?", { exact: true })
    .last()
    .click();
  await expect(
    page.getByText("Examples with the highest weights", { exact: true }).last(),
  ).toBeVisible();
  await expect(page.locator(".hidden-cards")).toHaveCount(0);
  await expect(page.getByLabel("Players, including you")).toBeEnabled();
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
  await page.screenshot({
    path: test.info().outputPath("bot-table.png"),
    fullPage: true,
  });
  await page.reload();
  await page.getByRole("button", { name: "Bot table", exact: true }).click();
  await expect(
    page.getByRole("region", { name: "Hand feedback" }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Deal next hand" }).click();
  await expect(page.getByText(/Hand 2 ·/)).toBeVisible();
  await expect(page.locator(".bot-seat")).toHaveCount(6);
});
test("heads-up controls work by keyboard and table size can change between hands", async ({
  page,
}) => {
  await page.goto("/");
  await page.getByRole("button", { name: "Bot table", exact: true }).click();
  await page.getByRole("button", { name: "Start table", exact: true }).focus();
  await page.keyboard.press("Enter");
  await expect(page.locator(".bot-seat")).toHaveCount(2);
  await expect(page.getByLabel("Players, including you")).toBeDisabled();
  await page.getByRole("button", { name: "Fold", exact: true }).focus();
  await page.keyboard.press("Enter");
  await expect(
    page.getByRole("region", { name: "Hand feedback" }),
  ).toBeFocused();
  await page.getByLabel("Players, including you").selectOption("9");
  await page.getByRole("button", { name: "New table", exact: true }).click();
  await expect(page.locator(".bot-seat")).toHaveCount(9);
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
});
