import { test, expect } from "@playwright/test";
import type { TableView } from "../../packages/shared/src/table";
import type { Exercise } from "../../packages/shared/src";

// Independently checks the documented easy-deal rule against actual dealt cards.
function isEasyStartingHand(cards: string[]): boolean {
  if (cards.length !== 2) return false;
  const ranks = "23456789TJQKA";
  const a = ranks.indexOf(cards[0][0]);
  const b = ranks.indexOf(cards[1][0]);
  const suited = cards[0][1] === cards[1][1];
  return (
    a === b ||
    (a >= ranks.indexOf("T") && b >= ranks.indexOf("T")) ||
    (suited && (cards[0][0] === "A" || cards[1][0] === "A")) ||
    (suited && Math.abs(a - b) === 1 && Math.min(a, b) >= ranks.indexOf("5"))
  );
}

test("easy bot deals use the selected starting-hand rule and keep the button and dealer positions visible", async ({
  page,
  request,
}) => {
  await page.goto("/");
  await page.getByRole("button", { name: "Bot table", exact: true }).click();
  const players = page.getByLabel("Players, including you", { exact: true });
  const startingHands = page.getByLabel("Starting hands", { exact: true });
  await startingHands.selectOption("easy");
  const create = page.waitForResponse(
    (response) =>
      response.url().endsWith("/api/tables") &&
      response.request().method() === "POST",
  );
  await page.getByRole("button", { name: "Start table", exact: true }).click();
  const created = await create;
  expect(created.status()).toBe(201);
  expect(created.request().postDataJSON()).toMatchObject({
    players: 2,
    dealMode: "easy",
  });
  const initial = (await created.json()) as TableView;
  expect(initial.dealMode).toBe("easy");
  expect(isEasyStartingHand(initial.players[0].hole!)).toBe(true);
  expect(initial.players[1].hole).toBeUndefined();
  await expect(startingHands).toHaveValue("easy");
  await expect(startingHands).toBeEnabled();
  await expect(page.locator(".hero-seat .card")).toHaveCount(2);
  await expect(
    page.locator(".hero-seat").getByRole("img", { name: /dealer button/i }),
  ).toBeVisible();
  await expect(page.getByRole("img", { name: /dealer button/i })).toHaveCount(
    1,
  );

  // Setup choices apply to a new game, not the active game's deal rules.
  await players.selectOption("6");
  await startingHands.selectOption("random");
  const unchanged = await request.get(`/api/tables/${initial.id}`);
  expect(unchanged.status()).toBe(200);
  expect(await unchanged.json()).toEqual(initial);

  const action = page.waitForResponse((response) =>
    response.url().endsWith("/actions"),
  );
  await page.getByRole("button", { name: "Fold", exact: true }).click();
  expect((await action).status()).toBe(200);
  await expect(
    page.getByRole("heading", { name: "Hand complete", exact: true }),
  ).toBeVisible();
  await expect(startingHands).toBeEnabled();
  await expect(startingHands).toHaveValue("random");
  await expect(players).toHaveValue("6");
  const next = page.waitForResponse((response) =>
    response.url().endsWith("/next"),
  );
  await page.getByRole("button", { name: /^Deal next hand/ }).click();
  const nextView = (await (await next).json()) as TableView;
  expect(nextView.dealMode).toBe("easy");
  expect(nextView.dealer).toBe(1);
  expect(nextView.players).toHaveLength(2);
  expect(isEasyStartingHand(nextView.players[0].hole!)).toBe(true);
  await expect(startingHands).toHaveValue("random");
  await expect(players).toHaveValue("6");
  await expect(
    page.locator(".hero-seat").getByRole("img", { name: /dealer button/i }),
  ).toHaveCount(0);
  await expect(
    page
      .locator(".bot-seat:not(.hero-seat)")
      .getByRole("img", { name: /dealer button/i }),
  ).toBeVisible();
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
});

test("player-count choices can start a larger table without losing the saved active hand", async ({
  page,
  request,
}) => {
  await page.goto("/");
  await page.getByRole("button", { name: "Bot table", exact: true }).click();
  const players = page.getByLabel("Players, including you", { exact: true });
  const startingHands = page.getByLabel("Starting hands", { exact: true });
  await players.selectOption("2");
  await startingHands.selectOption("random");
  const initialResponse = page.waitForResponse(
    (response) =>
      response.url().endsWith("/api/tables") &&
      response.request().method() === "POST",
  );
  await page.getByRole("button", { name: "Start table", exact: true }).click();
  const initial = (await (await initialResponse).json()) as TableView;
  expect(initial.complete).toBe(false);
  expect(initial.players).toHaveLength(2);
  await expect(page.locator(".bot-seat")).toHaveCount(2);

  await expect(players).toBeEnabled();
  await expect(startingHands).toBeEnabled();
  const newTable = page.getByRole("button", { name: "New table", exact: true });
  await expect(newTable).toBeEnabled();
  await players.selectOption("6");
  await startingHands.selectOption("easy");
  await expect(players).toHaveValue("6");
  await expect(startingHands).toHaveValue("easy");
  await expect(page.locator(".bot-seat")).toHaveCount(2);
  const pending = await request.get(`/api/tables/${initial.id}`);
  expect(pending.status()).toBe(200);
  expect(await pending.json()).toEqual(initial);
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);

  const createResponse = page.waitForResponse(
    (response) =>
      response.url().endsWith("/api/tables") &&
      response.request().method() === "POST",
  );
  await newTable.click();
  const created = await createResponse;
  expect(created.status()).toBe(201);
  expect(created.request().postDataJSON()).toMatchObject({
    players: 6,
    dealMode: "easy",
  });
  const larger = (await created.json()) as TableView;
  expect(larger.id).not.toBe(initial.id);
  expect(larger.players).toHaveLength(6);
  expect(larger.dealMode).toBe("easy");
  expect(isEasyStartingHand(larger.players[0].hole!)).toBe(true);
  await expect(page.locator(".bot-seat")).toHaveCount(6);
  const preserved = await request.get(`/api/tables/${initial.id}`);
  expect(preserved.status()).toBe(200);
  expect(await preserved.json()).toEqual(initial);
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);

  const gamesResponse = await request.get("/api/games");
  expect(gamesResponse.status()).toBe(200);
  const games: { id: string; gameNumber: number }[] =
    await gamesResponse.json();
  const originalGame = games.find((game) => game.id === initial.id)!;
  expect(originalGame).toBeDefined();
  await page.getByRole("button", { name: "Games", exact: true }).click();
  await page
    .getByRole("button", {
      name: `View Game ${originalGame.gameNumber} stats`,
      exact: true,
    })
    .click();
  const resumeResponse = page.waitForResponse(
    (response) =>
      response.url().endsWith(`/api/tables/${initial.id}`) &&
      response.request().method() === "GET",
  );
  await page.getByRole("button", { name: "Resume game", exact: true }).click();
  expect(await (await resumeResponse).json()).toEqual(initial);
  await expect(page.locator(".bot-seat")).toHaveCount(2);
  await expect(players).toHaveValue("2");
  await expect(startingHands).toHaveValue("random");
  await expect(players).toBeEnabled();
  expect(
    await page.evaluate(() => localStorage.getItem("poker-practice-table")),
  ).toBe(initial.id);
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
});

test("balanced showdown practice keeps its deal style after answering without revealing the answer early", async ({
  page,
}) => {
  await page.goto("/");
  await page.getByRole("button", { name: "Practice", exact: true }).click();
  await expect(
    page.getByRole("heading", { name: "Who wins at showdown?" }),
  ).toBeVisible();
  const deals = page.getByLabel("Showdown deals", { exact: true });
  const changed = page.waitForResponse(
    (response) =>
      response.url().endsWith("/api/exercises") &&
      response.request().postDataJSON()?.showdownStyle === "balanced",
  );
  await deals.selectOption("balanced");
  const exerciseResponse = await changed;
  expect(exerciseResponse.status()).toBe(201);
  expect(exerciseResponse.request().postDataJSON()).toMatchObject({
    mode: "who-wins",
    showdownStyle: "balanced",
  });
  const first = (await exerciseResponse.json()) as Exercise;
  expect(first.mode).toBe("who-wins");
  expect(
    new Set([...first.hero!, ...first.villain!, ...first.board!]).size,
  ).toBe(9);
  for (const hidden of [
    "winner",
    "answer",
    "feedback",
    "hands",
    "canonicalAnswer",
  ])
    expect(first).not.toHaveProperty(hidden);
  await expect(
    page.getByRole("region", { name: "Answer feedback" }),
  ).toHaveCount(0);
  await expect(page.locator(".hand-outcome")).toHaveCount(0);
  await expect(deals).toHaveValue("balanced");
  await expect(page.locator(".board .card")).toHaveCount(5);
  await page.getByRole("radio", { name: "Tie", exact: true }).check();
  await page.getByRole("button", { name: "Check my answer" }).click();
  await expect(
    page.getByRole("region", { name: "Answer feedback" }),
  ).toBeVisible();
  const next = page.waitForResponse(
    (response) =>
      response.url().endsWith("/api/exercises") &&
      response.request().method() === "POST",
  );
  await page.getByRole("button", { name: "Next exercise" }).click();
  const nextResponse = await next;
  expect(nextResponse.request().postDataJSON()).toMatchObject({
    mode: "who-wins",
    showdownStyle: "balanced",
  });
  const second = (await nextResponse.json()) as Exercise;
  expect(second.id).not.toBe(first.id);
  expect(
    new Set([...second.hero!, ...second.villain!, ...second.board!]).size,
  ).toBe(9);
  await expect(deals).toHaveValue("balanced");
  await expect(
    page.getByRole("region", { name: "Answer feedback" }),
  ).toHaveCount(0);
  await expect(page.locator(".hand-outcome")).toHaveCount(0);
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
});
