import { test, expect, type Page } from "@playwright/test";

async function startAndFold(page: Page) {
  await page.goto("/");
  await page.getByRole("button", { name: "Play", exact: true }).click();
  await page.getByRole("button", { name: "Start table", exact: true }).click();
  await expect(
    page.getByRole("button", { name: "Fold", exact: true }),
  ).toBeVisible();
  const id = await page.evaluate(() =>
    localStorage.getItem("poker-practice-table"),
  );
  await page.getByRole("button", { name: "Fold", exact: true }).click();
  await expect(
    page.getByRole("heading", { name: "Hand complete", exact: true }),
  ).toBeVisible();
  return id!;
}

async function inspectFold(page: Page) {
  await page.getByRole("button", { name: "Hand history", exact: true }).click();
  const dialog = page.getByRole("dialog", {
    name: "Hand history",
    exact: true,
  });
  const fold = dialog
    .getByRole("button", {
      name: /^Inspect your fold decision/,
      includeHidden: true,
    })
    .first();
  await expect(fold).toBeAttached();
  if (!(await fold.isVisible()))
    await fold
      .locator("xpath=ancestor::details[1]")
      .locator(":scope > summary")
      .click();
  await fold.click();
  const decision = dialog.getByRole("region", { name: "Historical decision" });
  await expect(
    decision.getByRole("button", { name: "Try another action" }),
  ).toBeEnabled();
  return { dialog, decision };
}

test("recorded decisions restore only their public state and branch without replacing the source", async ({
  page,
  request,
}) => {
  const id = await startAndFold(page);
  const source = await (await request.get(`/api/tables/${id}`)).json();
  const history = await (
    await request.get(`/api/v1/tables/${id}/events`)
  ).json();
  const action = history.events.find(
    (event: { heroDecision: boolean }) => event.heroDecision,
  );
  const historical = await (
    await request.get(`/api/v1/tables/${id}/events/${action.sequence}`)
  ).json();
  expect(
    historical.players
      .slice(1)
      .every((player: { hole?: string[] }) => !player.hole),
  ).toBe(true);
  expect(historical.rounds).toEqual([]);
  expect(historical.review).toEqual([]);
  const { dialog, decision } = await inspectFold(page);
  await expect(decision.locator(".card")).toHaveCount(2);
  await expect(
    decision.getByText("No community cards yet", { exact: true }),
  ).toBeVisible();
  await expect(decision.getByRole("heading")).toBeFocused();
  const bounds = await dialog.boundingBox();
  expect(bounds!.x).toBeGreaterThanOrEqual(0);
  expect(bounds!.x + bounds!.width).toBeLessThanOrEqual(
    page.viewportSize()!.width,
  );
  await dialog.screenshot({
    path: test.info().outputPath("historical-decision.png"),
  });
  await decision.getByRole("button", { name: "Try another action" }).click();
  await expect(dialog).toHaveCount(0);
  await expect(
    page.locator(".active-game-strip").getByText(/Practice branch · Hand 1/),
  ).toBeVisible();
  await expect(page.locator(".hidden-cards")).toHaveCount(1);
  const branchId = await page.evaluate(() =>
    localStorage.getItem("poker-practice-table"),
  );
  expect(branchId).not.toBe(id);
  const branch = await (await request.get(`/api/tables/${branchId}`)).json();
  expect(branch.branchOf).toEqual({
    tableId: id,
    sequence: action.sequence,
    handNumber: 1,
  });
  expect(branch.players[0].hole).toEqual(historical.players[0].hole);
  expect(branch.board).toEqual(historical.board);
  await page.getByRole("button", { name: /^Call \d+$/ }).click();
  const branchHistory = await (
    await request.get(`/api/v1/tables/${branchId}/events`)
  ).json();
  expect(
    branchHistory.events.some(
      (event: { heroDecision: boolean; action?: string }) =>
        event.heroDecision && event.action === "call",
    ),
  ).toBe(true);
  expect(await (await request.get(`/api/tables/${id}`)).json()).toEqual(source);
  await page.getByRole("button", { name: "View stats", exact: true }).click();
  await expect(
    page
      .locator(".game-detail")
      .getByText(
        `Practice branch of hand 1, decision ${action.sequence} · original result kept separately`,
        { exact: true },
      ),
  ).toBeVisible();
  await expect(
    page
      .getByRole("complementary", { name: "Saved games" })
      .getByText(new RegExp(`Branch of hand 1, decision ${action.sequence}`)),
  ).toBeVisible();
  await expect(
    page.getByText(/Earlier hands from before tracking/),
  ).toHaveCount(0);
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
});

test("next hands and restarted attempts retain earlier decisions and export the public dataset", async ({
  page,
  request,
}) => {
  const id = await startAndFold(page);
  await page.getByRole("button", { name: /^Deal next hand/ }).click();
  await expect(page.getByText(/Hand 2 ·/).first()).toBeVisible();
  page.once("dialog", (dialog) => dialog.accept());
  await page.getByRole("button", { name: "Restart hand", exact: true }).click();
  const { dialog, decision } = await inspectFold(page);
  await expect(dialog.getByText(/Hand 2 · Restarted attempt/)).toBeVisible();
  await expect(decision.getByRole("heading", { name: /Hand 1/ })).toBeVisible();
  await dialog
    .getByText("Practice suggestions and decision data", { exact: true })
    .click();
  await expect(
    dialog.getByText(/Bot-model comparison, not a trained learner model/),
  ).toBeVisible();
  const download = page.waitForEvent("download");
  await dialog
    .getByRole("button", { name: "Export decision data (JSON)" })
    .click();
  expect((await download).suggestedFilename()).toBe(
    `poker-decisions-${id}.json`,
  );
  const dataset = await (
    await request.get(`/api/v1/tables/${id}/decisions`)
  ).json();
  expect(
    dataset.examples.some(
      (example: { handNumber: number; chosen: { action: string } }) =>
        example.handNumber === 1 && example.chosen.action === "fold",
    ),
  ).toBe(true);
  const opener = page.getByRole("button", {
    name: "Hand history",
    exact: true,
  });
  await page.keyboard.press("Escape");
  await expect(dialog).toHaveCount(0);
  await expect(opener).toBeFocused();
});

test("an uncertain branch response reuses its action id after closing and reopening history", async ({
  page,
  request,
}) => {
  const id = await startAndFold(page);
  const beforeGames = await (await request.get("/api/games")).json();
  const intents: unknown[] = [];
  let committedId = "";
  await page.route(`**/api/v1/tables/${id}/branch`, async (route) => {
    intents.push(route.request().postDataJSON());
    const response = await route.fetch();
    if (!committedId) {
      committedId = (await response.json()).id;
      await route.abort("failed");
    } else await route.fulfill({ response });
  });
  let opened = await inspectFold(page);
  await opened.decision
    .getByRole("button", { name: "Try another action" })
    .click();
  await expect(opened.decision.getByRole("alert")).toBeVisible();
  await page.keyboard.press("Escape");
  opened = await inspectFold(page);
  await opened.decision
    .getByRole("button", { name: "Try another action" })
    .click();
  await expect(opened.dialog).toHaveCount(0);
  expect(intents).toHaveLength(2);
  expect(intents[1]).toEqual(intents[0]);
  expect(
    await page.evaluate(() => localStorage.getItem("poker-practice-table")),
  ).toBe(committedId);
  const afterGames = await (await request.get("/api/games")).json();
  expect(afterGames).toHaveLength(beforeGames.length + 1);
});

test("history fetch errors can be retried and stale branch conflicts offer a current-game reload", async ({
  page,
  request,
}) => {
  const id = await startAndFold(page);
  await page.route(`**/api/v1/tables/${id}/events`, (route) =>
    route.fulfill({
      status: 503,
      json: { error: "History temporarily unavailable." },
    }),
  );
  await page.getByRole("button", { name: "Hand history", exact: true }).click();
  const dialog = page.getByRole("dialog", {
    name: "Hand history",
    exact: true,
  });
  await expect(dialog.getByRole("alert")).toHaveText(
    "History temporarily unavailable.",
  );
  await page.unroute(`**/api/v1/tables/${id}/events`);
  await dialog.getByRole("button", { name: "Retry history" }).click();
  await dialog
    .getByRole("button", { name: /^Inspect your fold decision/ })
    .click();
  const decision = dialog.getByRole("region", { name: "Historical decision" });
  await expect(
    decision.getByRole("button", { name: "Try another action" }),
  ).toBeEnabled();
  const current = await (await request.get(`/api/tables/${id}`)).json();
  const reset = await request.post(`/api/tables/${id}/reset-hand`, {
    data: { revision: current.revision, actionId: crypto.randomUUID() },
  });
  expect(reset.ok()).toBe(true);
  await decision.getByRole("button", { name: "Try another action" }).click();
  await expect(
    dialog.getByText("This game has changed. Reload it before branching."),
  ).toBeVisible();
  await expect(
    decision.getByRole("button", { name: "Try another action" }),
  ).toBeDisabled();
  await dialog.getByRole("button", { name: "Reload current game" }).click();
  await expect(dialog).toHaveCount(0);
  await expect(
    page.getByRole("heading", { name: "Your turn", exact: true }),
  ).toBeVisible();
});

test("closing a loading decision cancels its late result when the game changes", async ({
  page,
}) => {
  const id = await startAndFold(page);
  let release!: () => void;
  let captured!: () => void;
  const gate = new Promise<void>((resolve) => {
    release = resolve;
  });
  const received = new Promise<void>((resolve) => {
    captured = resolve;
  });
  await page.route(`**/api/v1/tables/${id}/events/*`, async (route) => {
    const response = await route.fetch();
    captured();
    await gate;
    await route.fulfill({ response }).catch(() => {});
  });
  await page.getByRole("button", { name: "Hand history", exact: true }).click();
  const dialog = page.getByRole("dialog", {
    name: "Hand history",
    exact: true,
  });
  await dialog
    .getByRole("button", { name: /^Inspect your fold decision/ })
    .click();
  await received;
  await expect(dialog.getByRole("status")).toHaveText("Loading this decision…");
  await page.keyboard.press("Escape");
  await expect(dialog).toHaveCount(0);
  await expect(
    page.getByRole("button", { name: "Hand history", exact: true }),
  ).toBeFocused();
  page.once("dialog", (confirmation) => confirmation.accept());
  await page.getByRole("button", { name: "Restart hand", exact: true }).click();
  await expect(
    page.getByRole("heading", { name: "Your turn", exact: true }),
  ).toBeVisible();
  release();
  await page.getByRole("button", { name: "Hand history", exact: true }).click();
  await expect(dialog.getByText(/Restarted attempt/)).toBeVisible();
  await expect(
    dialog.getByRole("region", { name: "Historical decision" }),
  ).toHaveCount(0);
  await expect(
    dialog.getByRole("button", { name: "Try another action" }),
  ).toHaveCount(0);
});
