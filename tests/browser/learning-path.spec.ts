import { test, expect } from "@playwright/test";

test.beforeEach(async ({ request }) => {
  await request.delete("/api/v1/learning-path/progress");
});

test("beginner lesson preserves a committed answer retry, resumes, reviews and clears only its path", async ({
  page,
  request,
}) => {
  await page.setViewportSize({ width: 320, height: 800 });
  const legacy = await (await request.get("/api/learning/progress")).json();
  await page.goto("/");
  await expect(
    page.getByRole("heading", { name: "Poker foundations", exact: true }),
  ).toBeVisible();
  await expect(page.getByText(/Legacy.*incomplete history/)).toBeVisible();
  await page
    .getByRole("button", { name: "Start Table flow and legal actions" })
    .focus();
  await page.keyboard.press("Enter");
  await expect(
    page.getByRole("heading", { name: "No bet to match", exact: true }),
  ).toBeFocused();
  await expect(page.getByRole("region", { name: "Path feedback" })).toHaveCount(
    0,
  );
  const progress = await (
    await request.get("/api/v1/learning-path/progress")
  ).json();
  const instance = await (
    await request.get(
      `/api/v1/learning-path/instances/${progress.activeInstanceId}`,
    )
  ).json();
  expect(instance.feedback).toBeNull();
  expect(JSON.stringify(instance.question)).not.toMatch(
    /correctAnswer|explanation|takeaway/,
  );
  await page.screenshot({
    path: test.info().outputPath("path-question.png"),
    fullPage: true,
  });
  const commands: unknown[] = [],
    receipts: string[] = [];
  await page.route(
    "**/api/v1/learning-path/instances/*/questions/*/answers",
    async (route) => {
      commands.push(route.request().postDataJSON());
      const response = await route.fetch();
      receipts.push(await response.text());
      if (commands.length === 1) await route.abort("failed");
      else await route.fulfill({ response });
    },
  );
  await page.getByRole("radio", { name: "Fold", exact: true }).focus();
  await page.keyboard.press("Space");
  await page
    .getByRole("button", { name: "Submit answer", exact: true })
    .focus();
  await page.keyboard.press("Enter");
  await expect(
    page.getByRole("button", { name: "Retry saved answer" }),
  ).toBeVisible();
  await page.reload();
  await expect(
    page.getByRole("button", { name: "Retry saved answer" }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Retry saved answer" }).click();
  await expect(
    page.getByRole("region", { name: "Path feedback" }),
  ).toContainText("Try this idea again");
  expect(commands).toHaveLength(2);
  expect(commands[1]).toEqual(commands[0]);
  expect(receipts[1]).toBe(receipts[0]);
  await page.getByRole("button", { name: "Continue lesson" }).click();
  await expect(
    page.getByRole("heading", { name: "Match a bet", exact: true }),
  ).toBeVisible();
  await page.evaluate(() => localStorage.removeItem("poker-learning-path-v1"));
  await page.reload();
  await expect(
    page.getByRole("heading", { name: "Match a bet", exact: true }),
  ).toBeFocused();
  for (const name of [
    "Call 10",
    "30 total",
    "Deal the three-card flop",
    "Check",
  ]) {
    await page.getByRole("radio", { name, exact: true }).check();
    await page
      .getByRole("button", { name: "Submit answer", exact: true })
      .click();
    await expect(
      page.getByRole("region", { name: "Path feedback" }),
    ).toBeVisible();
    await page.getByRole("button", { name: "Continue lesson" }).click();
  }
  await expect(
    page.getByRole("heading", { name: "Lesson complete", exact: true }),
  ).toBeVisible();
  await page.screenshot({
    path: test.info().outputPath("path-complete.png"),
    fullPage: true,
  });
  await expect(
    page.getByRole("button", { name: "Review missed ideas" }),
  ).toBeVisible();
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
  const events = await (
    await request.get("/api/v1/learning-path/export")
  ).json();
  const kinds = events.events.map((e: { kind: string }) => e.kind);
  expect(kinds.indexOf("question-presented")).toBeLessThan(
    kinds.indexOf("answer-submitted"),
  );
  expect(kinds.indexOf("feedback-generated")).toBeLessThan(
    kinds.indexOf("feedback-shown"),
  );
  expect(kinds.filter((k: string) => k === "lesson-completed")).toHaveLength(1);
  expect(kinds).toContain("lesson-resumed");
  await page.getByRole("button", { name: "Review missed ideas" }).click();
  await expect(
    page.getByRole("heading", { name: "No bet to match", exact: true }),
  ).toBeVisible();
  const trigger = page.getByRole("button", {
    name: "Clear path progress",
    exact: true,
  });
  await trigger.click();
  await expect(page.getByRole("dialog")).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(trigger).toBeFocused();
  expect(
    (await (await request.get("/api/v1/learning-path/progress")).json())
      .answerAttempts,
  ).toBe(5);
  await trigger.click();
  await page
    .getByRole("button", { name: "Confirm clear path progress" })
    .click();
  await expect(page.getByText("0 answers attempted")).toBeVisible();
  await expect(trigger).toBeFocused();
  expect(await (await request.get("/api/learning/progress")).json()).toEqual(
    legacy,
  );
});

test("acknowledgements retry their saved IDs and stale reload keeps the entered answer", async ({
  page,
}) => {
  await page.goto("/");
  const presentations: unknown[] = [];
  await page.route("**/questions/*/presented", async (route) => {
    presentations.push(route.request().postDataJSON());
    const response = await route.fetch();
    if (presentations.length === 1) await route.abort("failed");
    else await route.fulfill({ response });
  });
  await page
    .getByRole("button", { name: "Start Table flow and legal actions" })
    .click();
  await expect(page.getByRole("alert")).toBeVisible();
  await page.getByRole("button", { name: "Try again", exact: true }).click();
  await expect(
    page.getByRole("radio", { name: "Check", exact: true }),
  ).toBeEnabled();
  expect(presentations[1]).toEqual(presentations[0]);
  const answers: unknown[] = [];
  await page.route("**/questions/*/answers", async (route) => {
    answers.push(route.request().postDataJSON());
    if (answers.length === 1)
      await route.fulfill({
        status: 409,
        json: { error: "Stale content version." },
      });
    else await route.continue();
  });
  await page.getByRole("radio", { name: "Check", exact: true }).check();
  await page
    .getByRole("button", { name: "Submit answer", exact: true })
    .click();
  await expect(page.getByRole("alert")).toContainText(
    "Your saved answer is preserved",
  );
  await page.getByRole("button", { name: "Reload current lesson" }).click();
  await expect(
    page.getByRole("radio", { name: "Check", exact: true }),
  ).toBeChecked();
  const shown: unknown[] = [];
  await page.route("**/questions/*/feedback-shown", async (route) => {
    shown.push(route.request().postDataJSON());
    const response = await route.fetch();
    if (shown.length === 1) await route.abort("failed");
    else await route.fulfill({ response });
  });
  await page.getByRole("button", { name: "Retry saved answer" }).click();
  await expect(page.getByRole("alert")).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Continue lesson" }),
  ).toBeDisabled();
  await page.getByRole("button", { name: "Try again", exact: true }).click();
  await expect(
    page.getByRole("button", { name: "Continue lesson" }),
  ).toBeEnabled();
  expect(answers[1]).toEqual(answers[0]);
  expect(shown[1]).toEqual(shown[0]);
});

test("explicit JSON download follows all pages at a pinned export cursor", async ({
  page,
  request,
}) => {
  const catalog = await (await request.get("/api/v1/learning-path")).json();
  async function open() {
    return request.post("/api/v1/learning-path/instances", {
      data: {
        eventId: crypto.randomUUID(),
        instanceId: crypto.randomUUID(),
        sessionId: crypto.randomUUID(),
        contentId: catalog.units[0].lessons[0].contentId,
        contentVersion: catalog.contentVersion,
      },
    });
  }
  for (let i = 0; i < 103; i++) await open();
  await page.goto("/");
  await expect(
    page.getByRole("heading", { name: "No bet to match", exact: true }),
  ).toBeVisible();
  const pages: {
    url: string;
    data: { throughCursor: number; events: { cursor: number }[] };
  }[] = [];
  await page.route("**/api/v1/learning-path/export?*", async (route) => {
    const response = await route.fetch();
    pages.push({ url: route.request().url(), data: await response.json() });
    if (pages.length === 1) await open();
    await route.fulfill({ response });
  });
  const downloadPromise = page.waitForEvent("download");
  await page.getByRole("button", { name: "Download path data" }).click();
  const download = await downloadPromise;
  const { readFile } = await import("node:fs/promises");
  const exported = JSON.parse(await readFile((await download.path())!, "utf8"));
  expect(pages).toHaveLength(2);
  expect(new URL(pages[1].url).searchParams.get("throughCursor")).toBe(
    String(pages[0].data.throughCursor),
  );
  expect(exported.events).toEqual(pages.flatMap((p) => p.data.events));
  expect(
    exported.events.every(
      (event: { cursor: number }) => event.cursor <= exported.throughCursor,
    ),
  ).toBe(true);
  const latest = await (
    await request.get("/api/v1/learning-path/export")
  ).json();
  expect(latest.throughCursor).toBeGreaterThan(exported.throughCursor);
});

test("lesson and clear-dialog controls work with the keyboard alone", async ({
  page,
}) => {
  await page.goto("/");
  const start = page.getByRole("button", {
    name: "Start Table flow and legal actions",
  });
  await expect(start).toBeEnabled();
  async function tabTo(target: import("@playwright/test").Locator) {
    for (let i = 0; i < 35; i++) {
      if (
        await target.evaluate((element) => element === document.activeElement)
      )
        return;
      await page.keyboard.press("Tab");
    }
    await expect(target).toBeFocused();
  }
  await tabTo(start);
  await page.keyboard.press("Enter");
  await expect(
    page.getByRole("heading", { name: "No bet to match", exact: true }),
  ).toBeFocused();
  const check = page.getByRole("radio", { name: "Check", exact: true });
  await expect(check).toBeEnabled();
  await tabTo(check);
  await page.keyboard.press("Space");
  await tabTo(page.getByRole("button", { name: "Submit answer", exact: true }));
  await page.keyboard.press("Enter");
  await expect(
    page.getByRole("heading", { name: "Correct", exact: true }),
  ).toBeFocused();
  const next = page.getByRole("button", { name: "Continue lesson" });
  await expect(next).toBeEnabled();
  await tabTo(next);
  await page.keyboard.press("Enter");
  await expect(
    page.getByRole("heading", { name: "Match a bet", exact: true }),
  ).toBeFocused();
  const clear = page.getByRole("button", {
    name: "Clear path progress",
    exact: true,
  });
  await tabTo(clear);
  await page.keyboard.press("Enter");
  await expect(
    page.getByRole("button", { name: "Keep progress" }),
  ).toBeFocused();
  await page.keyboard.press("Escape");
  await expect(clear).toBeFocused();
});
