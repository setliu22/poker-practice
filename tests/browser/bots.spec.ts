import { test, expect, type Page } from "@playwright/test";
test("live odds are optional, read-only and usable by keyboard on desktop and mobile", async ({
  page,
  request,
}) => {
  await page.goto("/");
  await page.getByRole("button", { name: "Bot table", exact: true }).click();
  await page.getByRole("button", { name: "Start table", exact: true }).click();
  const button = page.getByRole("button", {
    name: "Check My Odds",
    exact: true,
  });
  await expect(button).toBeVisible();
  await expect(
    page.locator(".position-badge").filter({ hasText: "Button · Small blind" }),
  ).toBeVisible();
  await expect(page.getByText("Big blind", { exact: true })).toBeVisible();
  const id = await page.evaluate(() =>
    localStorage.getItem("poker-practice-table"),
  );
  const before = await (await request.get(`/api/tables/${id}`)).json();
  const hiddenBefore = await page.locator(".hidden-cards").count();
  const pending = page.waitForResponse((response) =>
    response.url().endsWith(`/${id}/odds`),
  );
  await button.focus();
  await page.keyboard.press("Enter");
  const response = await pending;
  expect(response.status()).toBe(200);
  const odds = await response.json();
  const panel = page.getByRole("region", {
    name: "Your live odds",
    exact: true,
  });
  const dialog = page.getByRole("dialog", { name: "Your showdown odds" });
  await expect(dialog).toBeVisible();
  await expect(
    panel.getByRole("heading", { name: "Your showdown odds" }),
  ).toBeVisible();
  await expect(panel.getByText("Win outright", { exact: true })).toBeVisible();
  await expect(panel.getByText("Tie for first", { exact: true })).toBeVisible();
  await expect(
    panel.getByText("Expected pot share", { exact: true }),
  ).toBeVisible();
  await expect(panel.getByText(/1 opponent still competing/)).toBeVisible();
  await expect(
    panel.getByText(
      /Ranges inferred from public actions|Random legal opponent hands/,
    ),
  ).toBeVisible();
  await expect(
    panel.getByText(/does not predict folds or recommend calling or raising/),
  ).toBeVisible();
  expect(odds.win + odds.tie + odds.lose).toBeCloseTo(100, 6);
  expect(odds.revision).toBe(before.revision);
  const after = await (await request.get(`/api/tables/${id}`)).json();
  for (const field of [
    "revision",
    "handNumber",
    "street",
    "board",
    "pot",
    "actor",
    "players",
    "history",
  ])
    expect(after[field]).toEqual(before[field]);
  await expect(page.locator(".hidden-cards")).toHaveCount(hiddenBefore);
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
  const bounds = await dialog.boundingBox();
  expect(bounds).not.toBeNull();
  const viewport = page.viewportSize()!;
  expect(bounds!.x).toBeGreaterThanOrEqual(0);
  expect(bounds!.x + bounds!.width).toBeLessThanOrEqual(viewport.width);
  expect(bounds!.y).toBeGreaterThanOrEqual(0);
  expect(bounds!.y + bounds!.height).toBeLessThanOrEqual(viewport.height);
  expect(bounds!.y + bounds!.height / 2).toBeCloseTo(viewport.height / 2, 0);
  await dialog.screenshot({ path: test.info().outputPath("live-odds.png") });
  await page.keyboard.press("Escape");
  await expect(dialog).toHaveCount(0);
  await expect(button).toBeFocused();
  let additionalRequests = 0;
  page.on("request", (request) => {
    if (request.url().endsWith(`/${id}/odds`)) additionalRequests++;
  });
  await page.keyboard.press("Enter");
  await expect(dialog).toBeVisible();
  expect(additionalRequests).toBe(0);
  await page.keyboard.press("Escape");
  await expect(button).toBeFocused();
  await page.getByRole("button", { name: "Fold", exact: true }).click();
  await expect(
    page.getByRole("heading", { name: "Hand complete", exact: true }),
  ).toBeVisible();
  await expect(
    page.getByRole("heading", { name: "Your showdown odds" }),
  ).toHaveCount(0);
  await page.getByRole("button", { name: /^Deal next hand/ }).click();
  await expect(
    page.locator(".position-badge").filter({ hasText: "Button · Small blind" }),
  ).toBeVisible();
  await expect(page.locator(".hero-seat .position-badge")).toHaveText(
    "Big blind",
  );
});

test("odds loading does not block play and a stale response cannot appear after an action", async ({
  page,
}) => {
  await page.goto("/");
  await page.getByRole("button", { name: "Bot table", exact: true }).click();
  await page.getByRole("button", { name: "Start table", exact: true }).click();
  let release!: () => void;
  let captured!: () => void;
  const gate = new Promise<void>((resolve) => {
    release = resolve;
  });
  const received = new Promise<void>((resolve) => {
    captured = resolve;
  });
  await page.route("**/api/tables/*/odds", async (route) => {
    const response = await route.fetch();
    captured();
    await gate;
    await route.fulfill({ response }).catch(() => {
      /* The app aborts stale requests. */
    });
  });
  await page
    .getByRole("button", { name: "Check My Odds", exact: true })
    .click();
  await received;
  await expect(page.getByRole("status")).toHaveText(
    "Estimating your showdown odds…",
  );
  await expect(
    page.getByRole("button", { name: "Calculating odds…" }),
  ).toBeDisabled();
  const fold = page.getByRole("button", { name: "Fold", exact: true });
  await expect(fold).toBeEnabled();
  await fold.click();
  release();
  await expect(
    page.getByRole("heading", { name: "Hand complete", exact: true }),
  ).toBeVisible();
  await expect(
    page.getByRole("heading", { name: "Your showdown odds" }),
  ).toHaveCount(0);
  await expect(
    page.getByRole("button", { name: "Check My Odds", exact: true }),
  ).toHaveCount(0);
});

test("odds errors are readable and can be retried without changing the hand", async ({
  page,
}) => {
  await page.goto("/");
  await page.getByRole("button", { name: "Bot table", exact: true }).click();
  await page.getByRole("button", { name: "Start table", exact: true }).click();
  await page.route("**/api/tables/*/odds", (route) =>
    route.fulfill({
      status: 503,
      contentType: "application/json",
      body: JSON.stringify({
        error: "Could not estimate your odds. Try again.",
      }),
    }),
  );
  const button = page.getByRole("button", {
    name: "Check My Odds",
    exact: true,
  });
  await button.click();
  await expect(page.getByRole("alert")).toHaveText(
    "Could not estimate your odds. Try again.",
  );
  const dialog = page.getByRole("dialog", { name: "Your showdown odds" });
  await expect(dialog).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Fold", exact: true }),
  ).toBeEnabled();
  await page.unroute("**/api/tables/*/odds");
  await dialog.getByRole("button", { name: "Try again", exact: true }).click();
  await expect(
    page.getByRole("heading", { name: "Your showdown odds" }),
  ).toBeVisible();
  await expect(page.getByRole("alert")).toHaveCount(0);
});

async function expectCircularTable(page: Page, players: number) {
  await expect(page.locator(".bot-seat")).toHaveCount(players);
  const table = page.locator(".poker-table");
  await expect(table).toBeVisible();
  const geometry = await table.evaluate((element) => {
    const rect = (node: Element) => {
      const r = node.getBoundingClientRect();
      return { x: r.x, y: r.y, width: r.width, height: r.height };
    };
    return {
      table: rect(element),
      hero: rect(element.querySelector(".hero-seat")!),
      board: rect(element.querySelector(".bot-board")!),
      seats: Array.from(element.querySelectorAll(".bot-seat"), rect),
      viewport: innerWidth,
      documentWidth: document.documentElement.scrollWidth,
    };
  });
  await test.info().attach("table-geometry", {
    body: JSON.stringify(geometry, null, 2),
    contentType: "application/json",
  });
  await table.screenshot({
    path: test.info().outputPath(`table-${players}-players.png`),
  });
  const centerX = geometry.table.x + geometry.table.width / 2;
  const centerY = geometry.table.y + geometry.table.height / 2;
  expect(
    Math.abs(geometry.hero.x + geometry.hero.width / 2 - centerX),
  ).toBeLessThan(2);
  expect(geometry.hero.y).toBeGreaterThan(centerY);
  expect(geometry.documentWidth).toBeLessThanOrEqual(geometry.viewport);
  const intersects = (
    a: (typeof geometry)["table"],
    b: (typeof geometry)["table"],
  ) =>
    Math.min(a.x + a.width, b.x + b.width) - Math.max(a.x, b.x) > 1 &&
    Math.min(a.y + a.height, b.y + b.height) - Math.max(a.y, b.y) > 1;
  for (const [index, seat] of geometry.seats.entries()) {
    expect(seat.x, `seat ${index} left bound`).toBeGreaterThanOrEqual(0);
    expect(
      seat.x + seat.width,
      `seat ${index} right bound`,
    ).toBeLessThanOrEqual(geometry.viewport);
    expect(
      intersects(seat, geometry.board),
      `seat ${index} must leave the board clear`,
    ).toBe(false);
    for (const [offset, other] of geometry.seats.slice(index + 1).entries())
      expect(
        intersects(seat, other),
        `seat ${index} ${JSON.stringify(seat)} must not overlap seat ${index + offset + 1} ${JSON.stringify(other)}`,
      ).toBe(false);
  }
  if (players > 2) {
    expect(
      geometry.seats.some((seat) => seat.x + seat.width / 2 < centerX - 20),
    ).toBe(true);
    expect(
      geometry.seats.some((seat) => seat.x + seat.width / 2 > centerX + 20),
    ).toBe(true);
  }
}

for (const players of [2, 3, 4, 5, 6, 7, 8, 9]) {
  test(`${players}-player table places the learner at the bottom of the oval without overlapping seats`, async ({
    page,
  }) => {
    await page.goto("/");
    await page.getByRole("button", { name: "Bot table", exact: true }).click();
    await page
      .getByLabel("Players, including you")
      .selectOption(String(players));
    await page
      .getByRole("button", { name: "Start table", exact: true })
      .click();
    await expectCircularTable(page, players);
  });
}

for (const players of [2, 3, 4, 5, 6, 7, 8, 9]) {
  test(`${players}-player river board stays clear of the seats on a 320px screen`, async ({
    page,
  }) => {
    await page.setViewportSize({ width: 320, height: 800 });
    // Only the public view is substituted: this test exercises the dense layout,
    // not gameplay or equity. All visible cards remain distinct.
    await page.route("**/api/tables", async (route) => {
      if (route.request().method() !== "POST") return route.continue();
      const response = await route.fetch();
      const view = await response.json();
      const ownCards: string[] = view.players[0].hole;
      const candidates = ["As", "Kh", "Qd", "Jc", "Ts", "9h", "8d"];
      view.board = candidates
        .filter((card) => !ownCards.includes(card))
        .slice(0, 5);
      view.street = "river";
      await route.fulfill({ response, json: view });
    });
    await page.goto("/");
    await page.getByRole("button", { name: "Bot table", exact: true }).click();
    await page
      .getByLabel("Players, including you")
      .selectOption(String(players));
    await page
      .getByRole("button", { name: "Start table", exact: true })
      .click();
    await expect(page.locator(".bot-board .card")).toHaveCount(5);
    await expectCircularTable(page, players);
  });
}

test("completed nine-player table keeps revealed hands and split payouts separated on mobile", async ({
  page,
}) => {
  await page.setViewportSize({ width: 320, height: 800 });
  await page.route("**/api/tables", async (route) => {
    if (route.request().method() !== "POST") return route.continue();
    const response = await route.fetch();
    const view = await response.json();
    const ownCards: string[] = view.players[0].hole;
    const suit = ["s", "h", "d", "c"].find(
      (suit) => !ownCards.some((card) => card.endsWith(suit)),
    )!;
    const board = ["A", "K", "Q", "J", "T"].map((rank) => rank + suit);
    const remainingCards = ["s", "h", "d", "c"].flatMap((suit) =>
      ["2", "3", "4", "5", "6", "7", "8", "9", "T", "J", "Q", "K", "A"]
        .map((rank) => rank + suit)
        .filter((card) => !board.includes(card) && !ownCards.includes(card)),
    );
    // A public completed-hand fixture: everyone plays the royal-flush board
    // and receives an equal payout. This tests the tallest seat content.
    view.board = board;
    view.street = "river";
    view.complete = true;
    view.actor = null;
    view.legal = null;
    view.pot = 900;
    view.rounds = [];
    view.review = [];
    for (const player of view.players) {
      player.hole = player.seat === 0 ? ownCards : remainingCards.splice(0, 2);
      player.folded = false;
      player.allIn = false;
      player.stack = 1000;
      player.contributed = 100;
      player.streetBet = 0;
      player.payout = 100;
      player.handName = "Straight flush";
      player.bestFive = board;
    }
    await route.fulfill({ response, json: view });
  });
  await page.goto("/");
  await page.getByRole("button", { name: "Bot table", exact: true }).click();
  await page.getByLabel("Players, including you").selectOption("9");
  await page.getByRole("button", { name: "Start table", exact: true }).click();
  await expect(page.locator(".bot-seat .card")).toHaveCount(18);
  await expect(page.locator(".hero-seat .payout")).toBeVisible();
  await expect(
    page
      .locator(".bot-seat:not(.hero-seat) .seat-status")
      .filter({ hasText: /^Net / }),
  ).toHaveCount(8);
  await expectCircularTable(page, 9);
});

test("replay starts the same deal in a separate game without changing the original", async ({
  page,
  request,
}) => {
  await page.goto("/");
  await page.getByRole("button", { name: "Bot table", exact: true }).click();
  await page.getByRole("button", { name: "Start table", exact: true }).click();
  await expect(page.getByRole("region", { name: "Poker table" })).toBeVisible();
  const sourceId = await page.evaluate(() =>
    localStorage.getItem("poker-practice-table"),
  );
  const initial = await (await request.get(`/api/tables/${sourceId}`)).json();
  await expect(
    page.getByRole("button", { name: "Replay this hand", exact: true }),
  ).toHaveCount(0);
  await page.getByRole("button", { name: "Fold", exact: true }).click();
  await expect(
    page.getByRole("heading", { name: "Hand complete", exact: true }),
  ).toBeVisible();
  const original = await (await request.get(`/api/tables/${sourceId}`)).json();
  const responsePromise = page.waitForResponse((response) =>
    response.url().endsWith(`/${sourceId}/replay`),
  );
  await page
    .getByRole("button", { name: "Replay this hand", exact: true })
    .click();
  const response = await responsePromise;
  expect(response.status()).toBe(201);
  const replay = await response.json();
  expect(replay.id).not.toBe(sourceId);
  expect(replay.replayOf).toEqual({
    tableId: sourceId,
    handNumber: initial.handNumber,
  });
  for (const key of [
    "handNumber",
    "dealer",
    "street",
    "board",
    "pot",
    "currentBet",
    "actor",
    "complete",
    "players",
    "history",
    "legal",
  ])
    expect(replay[key], `replay restores ${key}`).toEqual(initial[key]);
  await expect(
    page
      .locator(".active-game-strip")
      .getByText(`Replay · Hand ${initial.handNumber}`, { exact: true }),
  ).toBeVisible();
  await expect(page.locator(".hidden-cards")).toHaveCount(1);
  expect(
    await page.evaluate(() => localStorage.getItem("poker-practice-table")),
  ).toBe(replay.id);
  await page.getByRole("button", { name: "Fold", exact: true }).click();
  await expect(
    page.getByRole("heading", { name: "Hand complete", exact: true }),
  ).toBeVisible();
  const replayFinished = await (
    await request.get(`/api/tables/${replay.id}`)
  ).json();
  const sourceAfter = await (
    await request.get(`/api/tables/${sourceId}`)
  ).json();
  for (const key of [
    "revision",
    "handNumber",
    "dealer",
    "street",
    "board",
    "pot",
    "actor",
    "complete",
    "players",
    "history",
  ])
    expect(sourceAfter[key], `original retains ${key}`).toEqual(original[key]);
  expect(replayFinished.players).toEqual(original.players);
  expect(replayFinished.history).toEqual(original.history);
});

test("select a multiway table, play a hand, read feedback, and resume it", async ({
  page,
}) => {
  test.setTimeout(90000);
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
    const actionResponse = page.waitForResponse((response) =>
      response.url().endsWith("/actions"),
    );
    if (await check.count()) await check.click();
    else await page.getByRole("button", { name: /^Call \d+$/ }).click();
    expect((await actionResponse).status()).toBe(200);
    await expect(page.getByRole("status")).toHaveCount(0);
  }
  await expect(
    page.getByRole("region", { name: "Hand feedback" }),
  ).toBeVisible();
  await page.getByRole("button", { name: /^Review decisions/ }).click();
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
  await expect(page.getByLabel("Players, including you")).toBeEnabled();
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
    page.getByText("Poker skill is not scored.", { exact: true }),
  ).toBeVisible();
  await detail.getByText("About the estimates", { exact: true }).click();
  await expect(
    detail.getByText(/Winning one hand does not prove/),
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
  await page.getByText("About the estimates", { exact: true }).click();
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
