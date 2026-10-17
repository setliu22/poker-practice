import { test, expect } from "@playwright/test";

test.beforeEach(async ({ request }) => {
  await request.delete("/api/v1/learning-path/progress");
});

test("today's practice starts a lesson, resumes it, and keeps completion through reload", async ({
  page,
  request,
}) => {
  await page.goto("/");
  const daily = page.getByRole("region", {
    name: "Today's practice",
    exact: true,
  });
  await expect(daily).toContainText("Not completed today");
  await expect(daily).toContainText("0-day practice streak");
  await expect(daily).toContainText("does not measure poker skill");
  await daily
    .getByRole("button", { name: "Start today's practice", exact: true })
    .focus();
  await page.keyboard.press("Enter");
  await expect(
    page.getByRole("heading", { name: "No bet to match", exact: true }),
  ).toBeFocused();
  await page.reload();
  await expect(
    page.getByRole("heading", { name: "No bet to match", exact: true }),
  ).toBeFocused();
  await expect(
    daily.getByRole("button", { name: "Resume today's practice", exact: true }),
  ).toBeEnabled();
  await daily
    .getByRole("button", { name: "Resume today's practice", exact: true })
    .click();
  for (const name of [
    "Check",
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
    await page
      .getByRole("button", { name: "Continue lesson", exact: true })
      .click();
  }
  await expect(
    page.getByRole("heading", { name: "Lesson complete", exact: true }),
  ).toBeVisible();
  await expect(daily).toContainText("Completed today");
  await expect(daily).toContainText("1-day practice streak");
  await page.getByRole("button", { name: "Back to path", exact: true }).click();
  const progressRead = page.waitForRequest(
    (req) =>
      req.method() === "GET" && req.url().includes("/learning-path/progress?"),
  );
  await page.reload();
  const read = await progressRead;
  const zone = await page.evaluate(
    () => Intl.DateTimeFormat().resolvedOptions().timeZone,
  );
  expect(new URL(read.url()).searchParams.get("timeZone")).toBe(zone);
  await expect(daily).toContainText("Completed today");
  await expect(daily).toContainText("1-day practice streak");
  await expect(daily).toContainText("Build the best five-card hand");
  expect(
    (await (await request.get("/api/v1/learning-path/progress")).json())
      .completedLessons,
  ).toBe(1);
});

test.describe("daily status freshness", () => {
  test.use({ timezoneId: "America/New_York" });
  for (const newerResult of ["failure", "success"] as const) {
    test(`delayed initial progress remains usable after a newer ${newerResult}`, async ({
      page,
    }) => {
      let releaseInitial!: () => void;
      const released = new Promise<void>((resolve) => {
        releaseInitial = resolve;
      });
      let holdInitial!: () => void;
      const held = new Promise<void>((resolve) => {
        holdInitial = resolve;
      });
      let reads = 0;
      await page.route(
        /\/api\/v1\/learning-path\/progress\?/,
        async (route) => {
          const read = ++reads;
          if (read === 1) {
            const response = await route.fetch();
            const summary = await response.json();
            holdInitial();
            await released;
            await route.fulfill({
              response,
              json: { ...summary, completedToday: true, currentStreakDays: 2 },
            });
          } else if (newerResult === "failure") {
            await route.fulfill({
              status: 503,
              json: { error: "Temporary focus refresh failure" },
            });
          } else {
            const response = await route.fetch();
            await route.fulfill({
              response,
              json: {
                ...(await response.json()),
                completedToday: false,
                currentStreakDays: 5,
                answerAttempts: 9,
              },
            });
          }
        },
      );
      await page.goto("/");
      await held;
      const focusResponse = page.waitForResponse((response) =>
        response.url().includes("/learning-path/progress?"),
      );
      await page.evaluate(() => window.dispatchEvent(new Event("focus")));
      expect((await focusResponse).status()).toBe(
        newerResult === "failure" ? 503 : 200,
      );
      if (newerResult === "success")
        await expect(page.getByText(/9 answers attempted/)).toBeVisible();
      releaseInitial();
      const daily = page.getByRole("region", {
        name: "Today's practice",
        exact: true,
      });
      await expect(daily).toBeVisible();
      await expect(daily).toContainText(
        newerResult === "failure" ? "Completed today" : "Not completed today",
      );
      await expect(daily).toContainText(
        newerResult === "failure"
          ? "2-day practice streak"
          : "5-day practice streak",
      );
      await expect(
        page.getByRole("button", {
          name: "Start Table flow and legal actions",
          exact: true,
        }),
      ).toBeEnabled();
      if (newerResult === "success")
        await expect(page.getByText(/9 answers attempted/)).toBeVisible();
    });
  }
  test("refreshes at local midnight across DST and on return to the tab", async ({
    page,
  }) => {
    await page.clock.install({ time: new Date("2026-10-31T23:59:50-04:00") });
    await page.clock.pauseAt(new Date("2026-10-31T23:59:50-04:00"));
    let dailyState = { completedToday: true, currentStreakDays: 3 };
    let failRefresh = false;
    const progressReads: string[] = [];
    await page.route(/\/api\/v1\/learning-path\/progress\?/, async (route) => {
      progressReads.push(route.request().url());
      if (failRefresh) {
        await route.fulfill({
          status: 503,
          json: { error: "Temporary status failure" },
        });
        return;
      }
      const response = await route.fetch();
      await route.fulfill({
        response,
        json: { ...(await response.json()), ...dailyState },
      });
    });
    await page.goto("/");
    const daily = page.getByRole("region", {
      name: "Today's practice",
      exact: true,
    });
    await expect(daily).toContainText("Completed today");
    await expect(daily).toContainText("3-day practice streak");
    const start = page.getByRole("button", {
      name: "Start Table flow and legal actions",
      exact: true,
    });
    await start.focus();
    dailyState = { completedToday: false, currentStreakDays: 3 };
    await page.clock.runFor(10_000);
    await expect(daily).toContainText("Not completed today");
    await expect(daily).toContainText("3-day practice streak");
    await expect(start).toBeFocused();
    // November 1 has 25 local hours. A fixed 24-hour timer fires too early.
    const afterMidnight = progressReads.length;
    dailyState = { completedToday: false, currentStreakDays: 0 };
    await page.clock.fastForward(24 * 60 * 60 * 1000);
    expect(progressReads).toHaveLength(afterMidnight);
    await page.clock.runFor(60 * 60 * 1000);
    await expect(daily).toContainText("0-day practice streak");
    dailyState = { completedToday: true, currentStreakDays: 1 };
    await page.evaluate(() => window.dispatchEvent(new Event("focus")));
    await expect(daily).toContainText("Completed today");
    await expect(daily).toContainText("1-day practice streak");
    dailyState = { completedToday: false, currentStreakDays: 1 };
    await page.evaluate(() =>
      document.dispatchEvent(new Event("visibilitychange")),
    );
    await expect(daily).toContainText("Not completed today");
    await expect(start).toBeFocused();
    failRefresh = true;
    await page.evaluate(() => window.dispatchEvent(new Event("focus")));
    await expect(daily.getByRole("alert")).toContainText("may be out of date");
    failRefresh = false;
    dailyState = { completedToday: true, currentStreakDays: 1 };
    await daily
      .getByRole("button", { name: "Refresh daily status", exact: true })
      .click();
    await expect(daily.getByRole("alert")).toHaveCount(0);
    await expect(daily).toContainText("Completed today");
    expect(
      progressReads.every(
        (url) =>
          new URL(url).searchParams.get("timeZone") === "America/New_York",
      ),
    ).toBe(true);
  });
});

test("course home preserves completed lessons and recommends the next unfinished lesson after repeats and reload", async ({
  page,
  request,
}) => {
  await page.goto("/");
  const recommendation = page.getByRole("region", {
    name: "Recommended next lesson",
    exact: true,
  });
  await expect(recommendation).toContainText("Table flow and legal actions");
  const instances: string[] = [];
  for (let attempt = 0; attempt < 2; attempt++) {
    await page
      .getByRole("button", {
        name: "Start Table flow and legal actions",
        exact: true,
      })
      .click();
    const progress = await (
      await request.get("/api/v1/learning-path/progress")
    ).json();
    instances.push(progress.activeInstanceId);
    for (const name of [
      "Check",
      "Call 10",
      "30 total",
      "Deal the three-card flop",
      attempt === 0 ? "Check" : "Fold, call, or make a legal raise",
    ]) {
      await page.getByRole("radio", { name, exact: true }).check();
      await page
        .getByRole("button", { name: "Submit answer", exact: true })
        .click();
      await expect(
        page.getByRole("region", { name: "Path feedback" }),
      ).toBeVisible();
      await page
        .getByRole("button", { name: "Continue lesson", exact: true })
        .click();
    }
    await expect(
      page.getByRole("heading", { name: "Lesson complete", exact: true }),
    ).toBeVisible();
    await page
      .getByRole("button", { name: "Back to path", exact: true })
      .click();
    await page.reload();
    await expect(
      page.getByRole("note", {
        name: "Completed Table flow and legal actions",
        exact: true,
      }),
    ).toBeVisible();
    await expect(recommendation).toContainText("Build the best five-card hand");
    await expect(
      page.getByText("1 of 5 lessons completed", { exact: true }),
    ).toBeVisible();
    const after = await (
      await request.get("/api/v1/learning-path/progress")
    ).json();
    expect(after).toMatchObject({
      completedLessons: attempt + 1,
      completedContentIds: ["table-flow"],
      nextLessonContentId: "hand-rankings",
    });
  }
  expect(new Set(instances).size).toBe(2);
  await page
    .getByRole("button", {
      name: "Continue with Build the best five-card hand",
      exact: true,
    })
    .click();
  await expect(
    page.getByRole("heading", { name: "Count both pairs", exact: true }),
  ).toBeFocused();
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
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
  const completedCheckpoint = await page.evaluate(() =>
    localStorage.getItem("poker-learning-path-v1"),
  );
  await page.getByRole("button", { name: "Back to path", exact: true }).focus();
  await page.keyboard.press("Enter");
  await expect(
    page.getByRole("heading", { name: "Poker foundations", exact: true }),
  ).toBeFocused();
  await page.evaluate(
    (value) => localStorage.setItem("poker-learning-path-v1", value!),
    completedCheckpoint,
  );
  await page.reload();
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

for (const acknowledgement of ["presented", "feedback-shown"]) {
  test(`failed ${acknowledgement} remains retryable after a successful download`, async ({
    page,
  }) => {
    await page.goto("/");
    const acks: unknown[] = [];
    await page.route(`**/questions/*/${acknowledgement}`, async (route) => {
      acks.push(route.request().postDataJSON());
      if (acks.length === 1)
        await route.fulfill({
          status: 503,
          json: { error: "Acknowledgement temporarily unavailable" },
        });
      else await route.continue();
    });
    await page
      .getByRole("button", { name: "Start Table flow and legal actions" })
      .click();
    if (acknowledgement === "feedback-shown") {
      await page.getByRole("radio", { name: "Check", exact: true }).check();
      await page
        .getByRole("button", { name: "Submit answer", exact: true })
        .click();
    }
    await expect(page.getByRole("alert")).toContainText(
      "Acknowledgement temporarily unavailable",
    );
    const downloaded = page.waitForEvent("download");
    await page.getByRole("button", { name: "Download path data" }).click();
    await downloaded;
    await expect(page.getByRole("alert")).toContainText(
      "Acknowledgement temporarily unavailable",
    );
    await page.getByRole("button", { name: "Try again", exact: true }).click();
    if (acknowledgement === "presented")
      await expect(
        page.getByRole("radio", { name: "Check", exact: true }),
      ).toBeEnabled();
    else
      await expect(
        page.getByRole("button", { name: "Continue lesson" }),
      ).toBeEnabled();
    expect(acks).toHaveLength(2);
    expect(acks[1]).toEqual(acks[0]);
  });
}

for (const failedStep of ["delete", "refresh"]) {
  test(`clear ${failedStep} failure has an accessible retry inside the modal`, async ({
    page,
  }) => {
    await page.goto("/");
    await expect(
      page.getByRole("button", { name: "Start Table flow and legal actions" }),
    ).toBeEnabled();
    let failed = false;
    await page.route(
      /\/api\/v1\/learning-path\/progress(?:\?.*)?$/,
      async (route) => {
        if (
          !failed &&
          route.request().method() ===
            (failedStep === "delete" ? "DELETE" : "GET")
        ) {
          failed = true;
          await route.fulfill({
            status: 503,
            json: { error: "Clear operation temporarily unavailable" },
          });
        } else await route.continue();
      },
    );
    const clear = page.getByRole("button", {
      name: "Clear path progress",
      exact: true,
    });
    await clear.click();
    await page
      .getByRole("button", { name: "Confirm clear path progress" })
      .click();
    const modal = page.getByRole("dialog");
    await expect(modal.getByRole("alert")).toContainText(
      "Clear operation temporarily unavailable",
    );
    await modal.getByRole("button", { name: "Retry clear progress" }).click();
    await expect(modal).toHaveCount(0);
    await expect(clear).toBeFocused();
    await expect(page.getByText("0 answers attempted")).toBeVisible();
  });
}

test("fresh-transfer results start at zero separately from engagement", async ({
  page,
}) => {
  await page.goto("/");
  await expect(
    page.getByRole("region", { name: "Fresh transfer results", exact: true }),
  ).toContainText("0/0 correct on first presentations");
  await expect(
    page.getByText(/0 lessons completed.*0 answers attempted/),
  ).toBeVisible();
  await expect(page.getByText(/not a mastery or speed score/)).toBeVisible();
});

test("four units teach visible assumptions and preserve review, repeat and fresh-transfer histories", async ({
  page,
  request,
}) => {
  test.setTimeout(90000);
  const base = "/api/v1/learning-path";
  const course = await (await request.get(base)).json();
  await page.goto("/");
  for (const unit of course.units)
    await expect(
      page.getByRole("heading", { name: unit.title, exact: true }),
    ).toBeVisible();
  const answers: Record<string, string | number> = {
    "free-check": "Check",
    "facing-bet": "Call 10",
    "minimum-raise": "30 total",
    "next-street": "Deal the three-card flop",
    "transfer-free": "Check",
    "two-pair": "Two pair",
    "flush-straight": "Flush",
    "board-tie": "Tie: both play the board",
    "transfer-full-house": "Full house",
    "button-position": "Last",
    "baseline-aces": "Raise according to the baseline",
    "baseline-seven-two": "Fold according to the baseline",
    "chart-limits": "It proves optimal poker play",
    "transfer-kings": "Raise according to the baseline",
    "call-price": 25,
    "river-range": 50,
    "conditional-call": "Call under the supplied assumptions",
    "transfer-price": 33.333,
    "flush-draw": "No, a four-heart flush draw",
    "flush-outs": "9 hearts",
    "next-card": 19.149,
    "future-betting": "Yes, equity alone settles it",
    "transfer-board-pair": "No, a full house or four of a kind can beat it",
    "transfer-straight": 17.021,
  };
  const attempts: string[] = [];
  const transfers: { id: string; fresh: boolean }[] = [];
  let resumed = false;
  async function finishCurrent(repeat = false) {
    let state = await (
      await request.get(
        `${base}/instances/${(await (await request.get(`${base}/progress`)).json()).activeInstanceId}`,
      )
    ).json();
    attempts.push(state.instanceId);
    while (state.question) {
      const question = state.question;
      const heading = page.getByRole("heading", {
        name: question.title,
        exact: true,
      });
      await expect(heading).toBeVisible();
      await expect(
        page.getByRole("region", { name: "Path feedback" }),
      ).toHaveCount(0);
      expect(JSON.stringify(question)).not.toMatch(
        /correctAnswer|gradingRule|explanation|takeaway/,
      );
      // Native details keeps its open state when React reuses the question view.
      if (
        !(await page
          .getByText(question.assumptions[0], { exact: true })
          .isVisible())
      )
        await page.getByText("Assumptions", { exact: true }).click();
      for (const assumption of question.assumptions)
        await expect(page.getByText(assumption, { exact: true })).toBeVisible();
      if (state.contentId === "postflop-reasoning" && state.questionIndex === 0)
        await expect(
          page.getByText(
            /After these foundations, try Bot table or Cash Decision Lab/,
          ),
        ).toBeVisible();
      const transferNote = page.getByRole("note", {
        name: "Transfer question",
        exact: true,
      });
      if (question.isTransfer) {
        transfers.push({ id: question.id, fresh: state.isFreshTransfer });
        await expect(transferNote).toContainText(
          state.isFreshTransfer
            ? "Fresh transfer: first presentation"
            : "Reused transfer: previously seen",
        );
        if (!state.isFreshTransfer) {
          await expect(transferNote).toContainText(
            "Reused variants do not change your fresh-transfer result.",
          );
          await page.screenshot({
            path: test.info().outputPath(`reused-${question.id}.png`),
            fullPage: true,
          });
        }
      } else await expect(transferNote).toHaveCount(0);
      if (repeat && question.id === "future-betting")
        answers[question.id] =
          "No, future betting and the opponent range matter";
      const value = answers[question.id];
      expect(value, `authored answer for ${question.id}`).toBeDefined();
      if (typeof value === "number") {
        await page.getByRole("spinbutton").fill(String(value));
        if (!resumed) {
          await page.reload();
          await expect(heading).toBeFocused();
          await expect(page.getByRole("spinbutton")).toHaveValue(String(value));
          resumed = true;
        }
      } else
        await page.getByRole("radio", { name: value, exact: true }).check();
      await page
        .getByRole("button", { name: "Submit answer", exact: true })
        .click();
      await expect(
        page.getByRole("region", { name: "Path feedback" }),
      ).toBeVisible();
      await page.getByRole("button", { name: "Continue lesson" }).click();
      await expect(heading).toHaveCount(0);
      state = await (
        await request.get(`${base}/instances/${state.instanceId}`)
      ).json();
    }
    await expect(
      page.getByRole("heading", { name: "Lesson complete", exact: true }),
    ).toBeVisible();
    return state;
  }
  for (const lesson of course.units.flatMap(
    (unit: { lessons: { contentId: string; title: string }[] }) => unit.lessons,
  )) {
    await page
      .getByRole("button", { name: `Start ${lesson.title}`, exact: true })
      .click();
    await finishCurrent();
    const progress = await (await request.get(`${base}/progress`)).json();
    if (lesson.contentId === "position-opening")
      expect(progress.reviewSuggestion).toMatchObject({
        contentId: "position-opening",
        skillId: "position-opening",
      });
    if (lesson.contentId !== "postflop-reasoning")
      await page
        .getByRole("button", { name: "Back to path", exact: true })
        .click();
  }
  for (let repeat = 0; repeat < 3; repeat++) {
    const progress = await (await request.get(`${base}/progress`)).json();
    expect(progress.reviewSuggestion).toMatchObject({
      contentId: "postflop-reasoning",
      skillId: "postflop-reasoning",
    });
    await expect(
      page.getByText(
        "Review the skill from your most recent incorrect answer.",
        { exact: true },
      ),
    ).toBeVisible();
    await page
      .getByRole("button", { name: "Review missed ideas", exact: true })
      .click();
    const state = await finishCurrent(true);
    expect(state.selectionReason).toMatch(repeat === 0 ? /unseen/i : /reused/i);
  }
  expect(new Set(attempts).size).toBe(8);
  expect(transfers.slice(-3)).toEqual([
    { id: "transfer-straight", fresh: true },
    { id: "transfer-board-pair", fresh: false },
    { id: "transfer-straight", fresh: false },
  ]);
  const progress = await (await request.get(`${base}/progress`)).json();
  expect(progress).toMatchObject({
    startedLessons: 8,
    completedLessons: 8,
    answerAttempts: 38,
    transferAttempts: 6,
    transferCorrect: 6,
    resumedLessons: 1,
  });
  await expect(
    page.getByText(/8 lessons completed.*38 answers attempted/),
  ).toBeVisible();
  await expect(
    page.getByRole("region", { name: "Fresh transfer results", exact: true }),
  ).toContainText(
    `${progress.transferCorrect}/${progress.transferAttempts} correct on first presentations`,
  );
  await expect(page.getByText(/not a mastery or speed score/)).toBeVisible();
  const exported = await (await request.get(`${base}/export`)).json();
  expect(
    exported.events.filter(
      (event: { kind: string }) => event.kind === "lesson-opened",
    ),
  ).toHaveLength(8);
  expect(
    exported.events.filter(
      (event: { kind: string }) => event.kind === "answer-submitted",
    ),
  ).toHaveLength(38);
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
  await page.screenshot({
    path: test.info().outputPath("four-unit-review.png"),
    fullPage: true,
  });
});

test("experienced players can enter bot and cash practice before completing a lesson", async ({
  page,
  request,
}) => {
  await page.goto("/");
  await page
    .getByRole("navigation", { name: "Main navigation" })
    .getByRole("button", { name: "Bot table", exact: true })
    .click();
  await expect(
    page.getByRole("heading", { name: "Bot table", exact: true }),
  ).toBeVisible();
  await page
    .getByRole("navigation", { name: "Main navigation" })
    .getByRole("button", { name: "Learn", exact: true })
    .click();
  await page
    .getByRole("button", { name: "Open online cash Decision Lab", exact: true })
    .click();
  await expect(
    page.getByRole("heading", {
      name: "Online cash Decision Lab",
      exact: true,
    }),
  ).toBeVisible();
  expect(
    (await (await request.get("/api/v1/learning-path/progress")).json())
      .startedLessons,
  ).toBe(0);
});
