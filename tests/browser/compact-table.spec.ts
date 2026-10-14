import { test, expect } from "@playwright/test";
test("live table stays compact and optional panels restore keyboard focus", async ({
  page,
}) => {
  await page.goto("/");
  await page.getByRole("button", { name: "Bot table", exact: true }).click();
  await page.getByRole("button", { name: "Start table", exact: true }).click();
  await expect(
    page.getByRole("heading", { name: "Your turn", exact: true }),
  ).toBeVisible();
  await expect(
    page.getByRole("heading", { name: "Before you act" }),
  ).toHaveCount(0);
  await expect(
    page.getByRole("region", { name: "Decision reviews" }),
  ).toHaveCount(0);
  await expect(page.getByRole("grid")).toHaveCount(0);
  await expect(
    page.getByRole("button", { name: "Show move hint" }),
  ).toBeVisible();
  await expect(
    page.getByRole("region", { name: "Suggested move" }),
  ).toHaveCount(0);
  const height = await page.evaluate(
    () => document.documentElement.scrollHeight,
  );
  const button = page.getByRole("button", {
    name: "Decision assistant",
    exact: true,
  });
  await button.focus();
  await page.keyboard.press("Enter");
  const dialog = page.getByRole("dialog", {
    name: "Decision assistant",
    exact: true,
  });
  await expect(dialog).toBeVisible();
  await expect(
    dialog.getByRole("heading", { name: "Before you act" }),
  ).toBeVisible();
  await expect(dialog.locator(".opening-chart-details")).not.toHaveAttribute(
    "open",
    "",
  );
  await page.keyboard.press("Escape");
  await expect(dialog).toHaveCount(0);
  await expect(button).toBeFocused();
  expect(await page.evaluate(() => document.documentElement.scrollHeight)).toBe(
    height,
  );
  await page.getByRole("button", { name: "Hand history", exact: true }).click();
  await expect(
    page.getByRole("dialog", { name: "Hand history", exact: true }),
  ).toBeVisible();
  await page.keyboard.press("Escape");
  await page.getByRole("button", { name: "Fold", exact: true }).click();
  await expect(
    page.getByRole("button", { name: /^Deal next hand/ }),
  ).toBeVisible();
  await expect(
    page.getByRole("region", { name: "Decision reviews" }),
  ).toHaveCount(0);
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
  await page.screenshot({
    path: test.info().outputPath("compact-table.png"),
    fullPage: true,
  });
});
