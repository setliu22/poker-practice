import { test, expect } from "@playwright/test";
import type { PreflopGuide } from "../../packages/shared/src/preflop";
import type { TableView } from "../../packages/shared/src/table";

test("live opening guide is read-only, highlights your hand, and supports keyboard and mobile", async ({
  page,
  request,
}) => {
  await page.setViewportSize({
    width: test.info().project.name === "mobile" ? 320 : 1280,
    height: 850,
  });
  await page.goto("/");
  await page.getByRole("button", { name: "Bot table", exact: true }).click();
  await page.getByRole("button", { name: "Start table", exact: true }).click();
  const button = page.getByRole("button", {
    name: "Preflop guide",
    exact: true,
  });
  await expect(button).toBeVisible();
  const id = await page.evaluate(() =>
    localStorage.getItem("poker-practice-table"),
  );
  const before = (await (
    await request.get(`/api/tables/${id}`)
  ).json()) as TableView;
  const pending = page.waitForResponse((response) =>
    response.url().endsWith(`/${id}/guide`),
  );
  await button.focus();
  await page.keyboard.press("Enter");
  const response = await pending;
  expect(response.status()).toBe(200);
  const guide = (await response.json()) as PreflopGuide;
  expect(guide.status).toBe("available");
  const dialog = page.getByRole("dialog", {
    name: "Preflop guide",
    exact: true,
  });
  await expect(dialog).toBeVisible();
  const grid = dialog.getByRole("grid", { name: "Illustrative opening chart" });
  await expect(grid.getByRole("gridcell")).toHaveCount(169);
  await expect(grid.getByRole("row")).toHaveCount(13);
  await expect(
    grid.locator("button[aria-current='true']"),
  ).toHaveAccessibleName(
    new RegExp(`^${guide.hand}: (raise|fold), your hand$`),
  );
  await expect(grid.locator(".opening-cell-hero")).toHaveCount(1);
  await expect(dialog.getByText(/not your chance of winning/)).toBeVisible();
  await expect(dialog.getByText(/not a solved recommendation/)).toBeVisible();
  await dialog.screenshot({
    path: test.info().outputPath("preflop-guide-initial.png"),
  });
  const aa = grid.getByRole("button", { name: /^AA:/ });
  await aa.focus();
  await page.keyboard.press("ArrowRight");
  await expect(grid.getByRole("button", { name: /^AKs:/ })).toBeFocused();
  await page.keyboard.press("ArrowDown");
  await expect(grid.getByRole("button", { name: /^KK:/ })).toBeFocused();
  await page.keyboard.press("Control+End");
  await expect(grid.getByRole("button", { name: /^22:/ })).toBeFocused();
  await expect(dialog.locator(".opening-cell-detail")).toContainText("22");
  await expect(grid.locator("button[tabindex='0']")).toHaveCount(1);
  await dialog
    .getByText("Source, assumptions, and limitations", { exact: true })
    .click();
  await expect(
    dialog.getByText(/not solver-derived or expert-verified/),
  ).toBeVisible();
  await expect(
    dialog.getByText(
      /Source stack depth, rake, antes and bet sizes are unspecified/,
    ),
  ).toBeVisible();
  await expect(dialog.getByRole("link", { name: /PreflopR/ })).toHaveAttribute(
    "href",
    /^https:\/\/github.com\/bmorrow10\/preflopR/,
  );
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
  const bounds = await dialog.boundingBox();
  expect(bounds!.x).toBeGreaterThanOrEqual(0);
  expect(bounds!.x + bounds!.width).toBeLessThanOrEqual(
    page.viewportSize()!.width,
  );
  await dialog.screenshot({
    path: test.info().outputPath("preflop-guide.png"),
  });
  const after = await (await request.get(`/api/tables/${id}`)).json();
  expect(after).toEqual(before);
  await page.keyboard.press("Escape");
  await expect(dialog).toHaveCount(0);
  await expect(button).toBeFocused();
  let additionalRequests = 0;
  page.on("request", (event) => {
    if (event.url().endsWith(`/${id}/guide`)) additionalRequests++;
  });
  await page.keyboard.press("Enter");
  await expect(dialog).toBeVisible();
  expect(additionalRequests).toBe(0);
  await page.keyboard.press("Escape");
  await page.getByRole("button", { name: "Fold", exact: true }).click();
  await expect(
    page.getByRole("heading", { name: "Hand complete", exact: true }),
  ).toBeVisible();
  await page.getByRole("button",{name:/^Review decisions/}).click();
  const review = page.getByRole("region", {
    name: "Illustrative opening guide",
  });
  await expect(review).toBeVisible();
  await expect(
    review.getByText("Your action: fold", { exact: true }),
  ).toBeVisible();
  await expect(
    review.getByText(
      /not proof of the best action|not a calculated mistake or skill grade/,
    ),
  ).toBeVisible();
  await page.reload();
  await page.getByRole("button", { name: "Bot table", exact: true }).click();
  await page.getByRole("button",{name:/^Review decisions/}).click();
  await expect(
    page.getByRole("region", { name: "Illustrative opening guide" }),
  ).toBeVisible();
});

test("guide loading can be cancelled, stale responses stay hidden, and errors can be retried", async ({
  page,
}) => {
  await page.goto("/");
  await page.getByRole("button", { name: "Bot table", exact: true }).click();
  await page.getByRole("button", { name: "Start table", exact: true }).click();
  let release!: () => void;
  let received!: () => void;
  const gate = new Promise<void>((resolve) => {
    release = resolve;
  });
  const captured = new Promise<void>((resolve) => {
    received = resolve;
  });
  await page.route("**/api/tables/*/guide", async (route) => {
    const response = await route.fetch();
    received();
    await gate;
    await route.fulfill({ response }).catch(() => {
      /* Request has been aborted. */
    });
  });
  const button = page.getByRole("button", {
    name: "Preflop guide",
    exact: true,
  });
  await button.click();
  await captured;
  await expect(page.getByRole("status")).toHaveText(
    "Loading the opening guide…",
  );
  await page.keyboard.press("Escape");
  await expect(page.getByRole("dialog", { name: "Preflop guide" })).toHaveCount(
    0,
  );
  await expect(button).toBeEnabled();
  await expect(button).toBeFocused();
  release();
  await page.unroute("**/api/tables/*/guide");
  await page.route("**/api/tables/*/guide", (route) =>
    route.fulfill({
      status: 503,
      json: { error: "Opening guide unavailable. Try again." },
    }),
  );
  await button.click();
  const dialog = page.getByRole("dialog", { name: "Preflop guide" });
  await expect(dialog.getByRole("alert")).toHaveText(
    "Opening guide unavailable. Try again.",
  );
  await page.unroute("**/api/tables/*/guide");
  await dialog.getByRole("button", { name: "Try again" }).click();
  await expect(
    dialog.getByRole("grid", { name: "Illustrative opening chart" }),
  ).toBeVisible();
  await page.keyboard.press("Escape");
  await page.getByRole("button", { name: "Fold", exact: true }).click();
  await expect(
    page.getByRole("heading", { name: "Hand complete", exact: true }),
  ).toBeVisible();
  await expect(page.getByRole("dialog", { name: "Preflop guide" })).toHaveCount(
    0,
  );
});

test("a raised pot has no opening chart and retains its actual betting situation", async ({
  page,
  request,
}) => {
  let view: TableView | undefined;
  for (let attempt = 0; attempt < 15; attempt++) {
    const result = await request.post("/api/tables", { data: { players: 6 } });
    const candidate = (await result.json()) as TableView;
    if (
      candidate.currentBet > 10 &&
      !candidate.complete &&
      candidate.actor === 0
    ) {
      view = candidate;
      break;
    }
  }
  expect(view, "Found an actual bot-raised preflop pot").toBeDefined();
  await page.addInitScript(
    (id) => localStorage.setItem("poker-practice-table", id),
    view!.id,
  );
  await page.goto("/");
  await page.getByRole("button", { name: "Bot table", exact: true }).click();
  await page
    .getByRole("button", { name: "Preflop guide", exact: true })
    .click();
  const dialog = page.getByRole("dialog", { name: "Preflop guide" });
  await expect(
    dialog.getByRole("heading", { name: "This situation needs different guidance" }),
  ).toBeVisible();
  await expect(dialog.getByText(/someone has already raised/)).toBeVisible();
  await expect(dialog.getByRole("grid")).toHaveCount(0);
  await dialog.getByRole("button",{name:"Think through this decision",exact:true}).click();
  await expect(page.getByRole("dialog",{name:"Decision assistant",exact:true})).toBeVisible();
  await expect(page.getByRole("region",{name:"How to make this decision"})).toBeVisible();
  await page.keyboard.press("Escape");
  const after = await (await request.get(`/api/tables/${view!.id}`)).json();
  expect(after.currentBet).toBe(view!.currentBet);
  expect(after.history).toEqual(view!.history);
  expect(after.revision).toBe(view!.revision);
});

test("the reference library browses only supported charts and contains mobile scrolling", async ({
  page,
}) => {
  await page.setViewportSize({
    width: test.info().project.name === "mobile" ? 320 : 1280,
    height: 850,
  });
  await page.goto("/");
  await page.getByRole("button", { name: "Reference", exact: true }).click();
  await page.getByLabel("Find a concept").fill("opening");
  const library = page.getByRole("region", { name: "Opening chart library" });
  await expect(library).toBeVisible();
  const size = library.getByLabel("Table size", { exact: true });
  await expect(size.getByRole("option")).toHaveText([
    "2 players",
    "6 players",
    "9 players",
  ]);
  await size.selectOption("6");
  await library
    .getByLabel("Position", { exact: true })
    .selectOption({ label: "Button" });
  await expect(library.getByRole("gridcell")).toHaveCount(169);
  await expect(
    library.getByText(/6 players · Button · Open to 2.5 big blinds/),
  ).toBeVisible();
  await expect(library.getByText(/not a winning probability/)).toBeVisible();
  await size.selectOption("9");
  await library
    .getByLabel("Position", { exact: true })
    .selectOption({ label: "Small blind" });
  await expect(
    library.getByText(/9 players · Small blind · Open to 3 big blinds/),
  ).toBeVisible();
  await library.getByRole("button", { name: /^AA:/ }).focus();
  await page.keyboard.press("End");
  await expect(library.getByRole("button", { name: /^A2s:/ })).toBeFocused();
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
});
