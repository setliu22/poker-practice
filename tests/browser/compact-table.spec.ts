import { test, expect } from "@playwright/test";
test("live table stays compact and optional panels restore keyboard focus", async ({
  page,
  request,
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
  const id = await page.evaluate(() =>
    localStorage.getItem("poker-practice-table"),
  );
  const initial = await (await request.get(`/api/tables/${id}`)).json();
  const actions = page.getByRole("region", {
    name: "Your actions",
    exact: true,
  });
  await expect(
    actions.getByText(
      `Call ${initial.legal.toCall} chips to stay in. Current bet: ${initial.currentBet} chips.`,
      { exact: true },
    ),
  ).toBeVisible();
  const amount = page.getByLabel("Raise to (total chips this street)", {
    exact: true,
  });
  await expect(amount).toHaveAttribute("min", String(initial.legal.minRaiseTo));
  await expect(amount).toHaveAttribute("max", String(initial.legal.maxRaiseTo));
  await expect(amount).toHaveAccessibleDescription(
    `Minimum ${initial.legal.minRaiseTo} · Maximum ${initial.legal.maxRaiseTo} chips total. Set all-in fills the amount; press Raise to play.`,
  );
  await amount.fill(String(initial.legal.minRaiseTo - 1));
  await expect(
    actions.getByRole("button", { name: "Raise", exact: true }),
  ).toBeDisabled();
  await actions
    .getByRole("button", { name: "Set all-in", exact: true })
    .click();
  await expect(amount).toHaveValue(String(initial.legal.maxRaiseTo));
  await expect(
    actions.getByRole("button", { name: "Raise", exact: true }),
  ).toBeEnabled();
  expect(await (await request.get(`/api/tables/${id}`)).json()).toEqual(
    initial,
  );
  const history = page.locator(".hand-history > details");
  await expect(history).not.toHaveAttribute("open", "");
  await expect(history.locator("ol")).toBeHidden();
  // Narrow screens use the Hand history dialog below instead of this sidebar.
  if (test.info().project.name === "desktop") {
    await history.locator(":scope > summary").focus();
    await page.keyboard.press("Enter");
    await expect(history.locator("ol")).toBeVisible();
    await page.keyboard.press("Enter");
    await expect(history.locator("ol")).toBeHidden();
  }
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
