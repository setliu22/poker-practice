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
test("named opponents have optional playstyle dialogs with keyboard dismissal and focus return", async ({
  page,
}) => {
  await page.goto("/");
  await page.getByRole("button", { name: "Bot table", exact: true }).click();
  await page.getByLabel("Players, including you").selectOption("9");
  await page.getByRole("button", { name: "Start table", exact: true }).click();
  await expect(page.getByRole("button", { name: /playstyle$/ })).toHaveCount(8);
  const opener = page.getByRole("button", { name: "Mara playstyle" });
  await opener.focus();
  await page.keyboard.press("Enter");
  const dialog = page.getByRole("dialog", { name: "Mara" });
  await expect(dialog).toBeVisible();
  await expect(
    dialog.getByText("Patient trapper", { exact: true }),
  ).toBeVisible();
  await expect(dialog.getByRole("listitem")).toHaveCount(3);
  expect(
    await dialog.evaluate((el) => {
      const r = el.getBoundingClientRect();
      return (
        r.left >= 0 &&
        r.right <= innerWidth &&
        r.top >= 0 &&
        r.bottom <= innerHeight
      );
    }),
  ).toBe(true);
  await page.keyboard.press("Escape");
  await expect(dialog).toHaveCount(0);
  await expect(opener).toBeFocused();
  await page.getByRole("button", { name: "Remy playstyle" }).click();
  await expect(
    page
      .getByRole("dialog", { name: "Remy" })
      .getByText(/remembers public actions/i),
  ).toBeVisible();
  await page
    .getByRole("dialog")
    .getByRole("button", { name: "Close", exact: true })
    .click();
  await expect(page.getByRole("dialog")).toHaveCount(0);
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
});

test("saved games retain profit, show charts and can be reopened", async ({
  page,
}) => {
  await page.goto("/");
  await page.getByRole("button", { name: "Bot table", exact: true }).click();
  await page.getByRole("button", { name: "Start table", exact: true }).click();
  const name = await page.locator(".active-game-strip strong").innerText();
  await page.getByRole("button", { name: "Fold", exact: true }).click();
  await page.getByRole("button", { name: "View stats", exact: true }).click();
  const detail = page.locator(".game-detail");
  await expect(
    detail.locator(".game-metrics").getByText("-5 chips", { exact: true }),
  ).toBeVisible();
  const chart = page.getByRole("group", {
    name: "Profit over time, 1 recorded hands",
  });
  await expect(chart).toBeVisible();
  await chart.getByRole("button").focus();
  await page.keyboard.press("Enter");
  await expect(page.locator(".chart-readout")).toHaveText(
    /Hand 1.*cumulative profit/,
  );
  await expect(
    page.getByText("No scored decisions yet", { exact: true }),
  ).toBeVisible();
  await detail.getByText("About the decision score", { exact: true }).click();
  await expect(
    detail.getByText(/Winning or losing the hand does not change/),
  ).toBeVisible();
  await detail.getByText("Hand results (1)", { exact: true }).click();
  await expect(
    detail.getByRole("cell", { name: "-5", exact: true }),
  ).toBeVisible();
  await page.getByRole("button", { name: "New game", exact: true }).click();
  await expect(
    page.getByRole("button", { name: "Start table", exact: true }),
  ).toBeFocused();
  await page.getByRole("button", { name: "Start table", exact: true }).click();
  await page.getByRole("button", { name: "Games", exact: true }).click();
  await page
    .getByRole("button", { name: `View ${name} stats`, exact: true })
    .click();
  await detail
    .getByRole("button", { name: "Back to table", exact: true })
    .click();
  await expect(
    page.getByRole("heading", { name: "Hand complete", exact: true }),
  ).toBeVisible();
  await page.reload();
  await page.getByRole("button", { name: "Bot table", exact: true }).click();
  await expect(page.getByRole("region", { name: "Poker table" })).toBeVisible();
  await page.getByRole("button", { name: "View stats", exact: true }).click();
  await expect(
    detail.locator(".game-metrics").getByText("-5 chips", { exact: true }),
  ).toBeVisible();
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
  await page.getByText("About the decision score", { exact: true }).click();
  await page
    .getByRole("region", { name: "Games and stats" })
    .screenshot({ path: test.info().outputPath("game-library.png") });
});

test("game deletion supports cancel, retry, deleting another game and deleting the active game", async ({
  page,
  request,
}) => {
  await page.goto("/");
  await page.getByRole("button", { name: "Bot table", exact: true }).click();
  await page.getByRole("button", { name: "Start table", exact: true }).click();
  await expect(page.locator(".active-game-strip strong")).toBeVisible();
  const first = await page.evaluate(() =>
    localStorage.getItem("poker-practice-table"),
  );
  const firstName = await page.locator(".active-game-strip strong").innerText();
  await page.getByRole("button", { name: "Games", exact: true }).click();
  await page.getByRole("button", { name: "New game", exact: true }).click();
  await page.getByRole("button", { name: "Start table", exact: true }).click();
  await expect(page.locator(".active-game-strip strong")).toBeVisible();
  const second = await page.evaluate(() =>
    localStorage.getItem("poker-practice-table"),
  );
  const secondName = await page
    .locator(".active-game-strip strong")
    .innerText();
  await page.getByRole("button", { name: "Games", exact: true }).click();
  await page
    .getByRole("button", { name: `View ${firstName} stats`, exact: true })
    .click();
  await page.getByRole("button", { name: "Delete game", exact: true }).click();
  let dialog = page.getByRole("dialog", {
    name: `Delete ${firstName}?`,
    exact: true,
  });
  await expect(
    dialog.getByRole("button", { name: "Cancel", exact: true }),
  ).toBeFocused();
  await page.keyboard.press("Escape");
  await expect(dialog).toHaveCount(0);
  await expect(
    page.getByRole("button", { name: "Delete game", exact: true }),
  ).toBeFocused();
  await page.getByRole("button", { name: "Delete game", exact: true }).click();
  await dialog
    .getByRole("button", { name: "Delete game", exact: true })
    .click();
  await expect(dialog).toHaveCount(0);
  await expect(
    page.getByRole("button", { name: `View ${firstName} stats`, exact: true }),
  ).toHaveCount(0);
  expect((await request.get(`/api/tables/${first}`)).status()).toBe(404);
  expect(
    await page.evaluate(() => localStorage.getItem("poker-practice-table")),
  ).toBe(second);
  await page
    .getByRole("button", { name: `View ${secondName} stats`, exact: true })
    .click();
  await page.getByRole("button", { name: "Delete game", exact: true }).click();
  dialog = page.getByRole("dialog", {
    name: `Delete ${secondName}?`,
    exact: true,
  });
  await dialog.getByRole("button", { name: "Cancel", exact: true }).click();
  await page.getByRole("button", { name: "Delete game", exact: true }).click();
  await page.route(`**/api/games/${second}`, (route) =>
    route.fulfill({
      status: 503,
      contentType: "application/json",
      body: JSON.stringify({ error: "Could not delete this game." }),
    }),
  );
  await dialog
    .getByRole("button", { name: "Delete game", exact: true })
    .click();
  await expect(dialog.getByRole("alert")).toHaveText(
    "Could not delete this game.",
  );
  await expect(dialog).toBeVisible();
  await page.unroute(`**/api/games/${second}`);
  await dialog
    .getByRole("button", { name: "Delete game", exact: true })
    .click();
  await expect(dialog).toHaveCount(0);
  await expect(
    page.getByRole("button", { name: "Games", exact: true }),
  ).toBeFocused();
  expect(
    await page.evaluate(() => localStorage.getItem("poker-practice-table")),
  ).toBeNull();
  expect((await request.get(`/api/tables/${second}`)).status()).toBe(404);
  await page.reload();
  await page.getByRole("button", { name: "Bot table", exact: true }).click();
  await expect(
    page.getByRole("button", { name: "Start table", exact: true }),
  ).toBeVisible();
});
