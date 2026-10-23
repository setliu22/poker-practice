import { test, expect, type Page } from "@playwright/test";
import { readFile } from "node:fs/promises";
import type { UsageEvent, UsageExport } from "../../packages/shared/src/usage";

async function start(page: Page, players = 2) {
  await page.goto("/");
  await page.getByRole("button", { name: "Play", exact: true }).click();
  if (players !== 2)
    await page
      .getByLabel("Players, including you")
      .selectOption(String(players));
  await page.getByRole("button", { name: "Start table", exact: true }).click();
  await expect(
    page.getByRole("heading", { name: "Your turn", exact: true }),
  ).toBeVisible();
  const id = await page.evaluate(() =>
    localStorage.getItem("poker-practice-table"),
  );
  const quick = page.getByText("Quick assessment", { exact: true });
  await quick.focus();
  await page.keyboard.press("Enter");
  return id!;
}
async function usage(page: Page, tableId: string) {
  const response = await page.request.get("/api/v1/usage/export?limit=1000");
  return ((await response.json()) as UsageExport).events.filter(
    (event) => event.tableId === tableId,
  );
}
const assessment = (page: Page) =>
  page.locator('[aria-label="Quick assessment result"]');

test("local assessment preserves the decision and links actual display with the eventual choice", async ({
  page,
  request,
}) => {
  const id = await start(page);
  const before = await (await request.get(`/api/tables/${id}`)).json();
  await expect(assessment(page)).toHaveCount(0);
  await page.getByLabel("Action to assess").selectOption("call");
  await page.getByRole("button", { name: "Assess chosen action" }).click();
  await expect(assessment(page)).toBeVisible();
  await expect(assessment(page)).toContainText("authored bot model");
  await expect(assessment(page)).not.toContainText(
    "Outside this model’s scope",
  );
  expect(await (await request.get(`/api/tables/${id}`)).json()).toEqual(before);
  await expect
    .poll(
      async () =>
        (await usage(page, id)).filter(
          (event) => event.kind === "assessment-shown",
        ).length,
    )
    .toBe(1);
  await expect
    .poll(
      async () =>
        (await usage(page, id)).filter(
          (event) => event.kind === "decision-viewed",
        ).length,
    )
    .toBe(1);
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
  await page.screenshot({
    path: test.info().outputPath("quick-assessment.png"),
  });
  await page.getByRole("button", { name: "Fold", exact: true }).click();
  await expect(
    page.getByRole("heading", { name: "Hand complete", exact: true }),
  ).toBeVisible();
  const events = await usage(page, id);
  const decision = events.find((event) => event.kind === "decision-committed")!;
  const shown = events.find((event) => event.kind === "assessment-shown")!;
  expect(decision.sessionId).toBe(shown.sessionId);
  expect(decision.sessionId).not.toBeNull();
  expect(decision.revision).toBe(before.revision);
  expect(shown.payload.kind).toBe("fast");
  expect(shown.payload.action).toBe("call");
  expect(shown.cursor).toBeLessThan(decision.cursor);
  expect(JSON.stringify(events)).not.toMatch(/dealSeed|runout|opponentHole/);
});

test("quick assessment reports stale errors, retries, and discards a late response after playing", async ({
  page,
}) => {
  const id = await start(page);
  const path = `**/api/v1/tables/${id}/fast-assessment`;
  await page.route(path, (route) =>
    route.fulfill({
      status: 409,
      json: {
        error: "This decision changed. Assess the current action instead.",
      },
    }),
  );
  await page.getByRole("button", { name: "Assess chosen action" }).click();
  await expect(page.getByRole("alert")).toHaveText(
    "This decision changed. Assess the current action instead.",
  );
  await page.unroute(path);
  let release!: () => void, received!: () => void;
  const gate = new Promise<void>((resolve) => {
    release = resolve;
  });
  const captured = new Promise<void>((resolve) => {
    received = resolve;
  });
  await page.route(path, async (route) => {
    const response = await route.fetch();
    received();
    await gate;
    await route.fulfill({ response }).catch(() => {});
  });
  await page.getByRole("button", { name: "Retry quick assessment" }).click();
  await captured;
  await expect(page.getByRole("button", { name: "Assessing…" })).toBeDisabled();
  await page.getByRole("button", { name: "Fold", exact: true }).click();
  await expect(
    page.getByRole("heading", { name: "Hand complete", exact: true }),
  ).toBeVisible();
  release();
  await expect(assessment(page)).toHaveCount(0);
  expect(
    (await usage(page, id)).filter(
      (event) => event.kind === "assessment-shown",
    ),
  ).toHaveLength(0);
});

test("unsupported decisions keep the detailed hint available", async ({
  page,
}) => {
  await start(page, 3);
  await page.getByRole("button", { name: "Assess chosen action" }).click();
  await expect(assessment(page)).toContainText("Outside this model’s scope");
  await expect(assessment(page)).toContainText("Use Show move hint above");
  await expect(
    page.getByRole("button", { name: "Show move hint", exact: true }),
  ).toBeEnabled();
});

test("a result in a closed panel is recorded only after the learner opens it", async ({
  page,
}) => {
  const id = await start(page);
  let release!: () => void, received!: () => void;
  const gate = new Promise<void>((resolve) => {
    release = resolve;
  });
  const captured = new Promise<void>((resolve) => {
    received = resolve;
  });
  await page.route(`**/api/v1/tables/${id}/fast-assessment`, async (route) => {
    const response = await route.fetch();
    received();
    await gate;
    await route.fulfill({ response });
  });
  await page.getByRole("button", { name: "Assess chosen action" }).click();
  await captured;
  await page.getByText("Quick assessment", { exact: true }).click();
  release();
  await expect(assessment(page)).toBeAttached();
  await expect(assessment(page)).toBeHidden();
  expect(
    (await usage(page, id)).filter(
      (event) => event.kind === "assessment-shown",
    ),
  ).toHaveLength(0);
  await page.getByText("Quick assessment", { exact: true }).click();
  await expect(assessment(page)).toBeVisible();
  await expect
    .poll(
      async () =>
        (await usage(page, id)).filter(
          (event) => event.kind === "assessment-shown",
        ).length,
    )
    .toBe(1);
});

test("failed local recording can be retried without duplicating an exposure", async ({
  page,
}) => {
  const id = await start(page);
  await page.route("**/api/v1/usage/exposures", (route) =>
    route.fulfill({ status: 503, json: { error: "Unavailable" } }),
  );
  await page.getByRole("button", { name: "Assess chosen action" }).click();
  await expect(assessment(page)).toBeVisible();
  await expect(
    page.getByText(/Some local practice records could not be saved/),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Fold", exact: true }),
  ).toBeEnabled();
  await page.unroute("**/api/v1/usage/exposures");
  await page.getByRole("button", { name: "Retry local recording" }).click();
  await expect
    .poll(
      async () =>
        (await usage(page, id)).filter(
          (event) => event.kind === "assessment-shown",
        ).length,
    )
    .toBe(1);
  await expect(
    page.getByRole("button", { name: "Retry local recording" }),
  ).toHaveCount(0);
});

test("data controls freeze paged exports, download SQLite backup, and clear usage while preserving games", async ({
  page,
  request,
}) => {
  const id = await start(page);
  await page.getByRole("button", { name: "Assess chosen action" }).click();
  await expect(assessment(page)).toBeVisible();
  await expect
    .poll(
      async () =>
        (await usage(page, id)).filter(
          (event) => event.kind === "assessment-shown",
        ).length,
    )
    .toBe(1);
  await page.getByRole("button", { name: "Fold", exact: true }).click();
  await expect(
    page.getByRole("heading", { name: "Hand complete", exact: true }),
  ).toBeVisible();
  const before = await (await request.get(`/api/tables/${id}`)).json();
  await page.getByText("Local practice data", { exact: true }).click();
  await expect(
    page.getByText(
      "Export or delete your recorded decisions and study-aid history.",
      { exact: true },
    ),
  ).toBeVisible();
  await page
    .getByText("Local practice data", { exact: true })
    .locator("..")
    .screenshot({ path: test.info().outputPath("local-practice-data.png") });
  const pages: URL[] = [];
  await page.route("**/api/v1/usage/export?*", async (route) => {
    const url = new URL(route.request().url());
    pages.push(new URL(url));
    url.searchParams.set("limit", "1");
    await route.continue({ url: url.toString() });
  });
  const exported = page.waitForEvent("download");
  await page
    .getByRole("button", { name: "Export usage records (JSON)" })
    .click();
  const file = await exported;
  const parsed = JSON.parse(
    await readFile((await file.path())!, "utf8"),
  ) as UsageExport;
  const ours: UsageEvent[] = parsed.events.filter(
    (event) => event.tableId === id,
  );
  expect(ours.some((event) => event.kind === "decision-committed")).toBe(true);
  expect(pages.length).toBeGreaterThan(1);
  expect(
    pages
      .slice(1)
      .every(
        (url) => url.searchParams.get("through") === String(parsed.through),
      ),
  ).toBe(true);
  await page.unroute("**/api/v1/usage/export?*");
  const backupDownload = page.waitForEvent("download");
  await page.getByRole("button", { name: "Download full backup" }).click();
  const backup = await backupDownload;
  expect(
    (await readFile((await backup.path())!)).subarray(0, 16).toString(),
  ).toBe("SQLite format 3\u0000");
  page.once("dialog", (dialog) => dialog.accept());
  await page
    .getByRole("button", { name: "Clear usage records", exact: true })
    .click();
  await expect(
    page.getByText("Usage records cleared. Saved games were preserved.", {
      exact: true,
    }),
  ).toBeVisible();
  expect(
    (await (await request.get("/api/v1/usage/summary")).json()).events,
  ).toBe(0);
  expect(await (await request.get(`/api/tables/${id}`)).json()).toEqual(before);
  await page.getByRole("button", { name: "New table", exact: true }).click();
  await expect(
    page.getByRole("heading", { name: "Your turn", exact: true }),
  ).toBeVisible();
  await expect
    .poll(
      async () =>
        (await (await request.get("/api/v1/usage/summary")).json()).viewed,
    )
    .toBe(1);
});
