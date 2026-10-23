import {
  test,
  expect,
  type Page,
  type APIRequestContext,
} from "@playwright/test";

type Lesson = { contentId: string; title: string; skillId: string };
type Catalog = {
  pathId: string;
  contentVersion: string;
  title: string;
  units: { id: string; title: string; lessons: Lesson[] }[];
};

async function getCatalog(request: APIRequestContext): Promise<Catalog> {
  return (await (await request.get("/api/v1/learning-path")).json()) as Catalog;
}
function allLessons(catalog: Catalog): Lesson[] {
  return catalog.units.flatMap((unit) => unit.lessons);
}
function startName(lesson: Lesson) {
  return "Start " + lesson.title;
}
function resumeName(lesson: Lesson) {
  return "Resume " + lesson.title;
}
function repeatName(lesson: Lesson) {
  return "Repeat " + lesson.title + " (completed)";
}
async function pathData(page: Page) {
  await page
    .getByRole("navigation", { name: "Main navigation" })
    .getByRole("button", { name: "Progress", exact: true })
    .click();
  await page.getByText("Learning path data", { exact: true }).click();
}
async function showLearn(page: Page) {
  await page
    .getByRole("navigation", { name: "Main navigation" })
    .getByRole("button", { name: "Learn", exact: true })
    .click();
}
async function readProgress(request: APIRequestContext) {
  return (await (
    await request.get("/api/v1/learning-path/progress")
  ).json()) as {
    activeInstanceId: string | null;
    startedLessons: number;
    completedContentIds: string[];
    completedLessons: number;
    answerAttempts: number;
    completedToday: boolean;
    currentStreakDays: number;
    nextLessonContentId: string | null;
  };
}
async function readInstance(request: APIRequestContext, id: string) {
  return (await (
    await request.get("/api/v1/learning-path/instances/" + id)
  ).json()) as {
    instanceId: string;
    contentId: string;
    contentVersion: string;
    question: {
      id: string;
      title: string;
      prompt: string;
      skillId: string;
      answerKind: "choice" | "percent";
      choices?: { id: string; label: string }[];
      assumptions: string[];
      isTransfer: boolean;
    } | null;
    questionIndex: number;
    totalQuestions: number;
    feedback: { correct: boolean; explanation: string; skillId: string } | null;
    complete: boolean;
  };
}
async function chooseAnyAnswer(page: Page) {
  const choices = page.getByRole("radio");
  const firstChoice = choices.first();
  const percent = page.getByRole("spinbutton");
  await expect(firstChoice.or(percent)).toBeVisible();
  if ((await choices.count()) > 0) {
    await choices.first().check();
  } else {
    await percent.fill("50");
  }
}
async function answerCurrentQuestion(page: Page) {
  await chooseAnyAnswer(page);
  await page
    .getByRole("button", { name: "Submit answer", exact: true })
    .click();
  await expect(
    page.getByRole("region", { name: "Path feedback" }),
  ).toBeVisible();
}
async function finishCurrentLesson(page: Page, request: APIRequestContext) {
  const progress = await readProgress(request);
  if (!progress.activeInstanceId) throw new Error("No active strategy skill.");
  let state = await readInstance(request, progress.activeInstanceId);
  while (state.question) {
    await answerCurrentQuestion(page);
    await page
      .getByRole("button", { name: "Continue lesson", exact: true })
      .click();
    state = await readInstance(request, state.instanceId);
  }
  await expect(
    page.getByRole("heading", { name: "Lesson complete", exact: true }),
  ).toBeVisible();
  return state;
}
async function openedEvent(request: APIRequestContext, instanceId: string) {
  const data = await (await request.get("/api/v1/learning-path/export")).json();
  return data.events.find(
    (event: { kind: string; instanceId: string }) =>
      event.kind === "lesson-opened" && event.instanceId === instanceId,
  );
}

test.beforeEach(async ({ request }) => {
  await request.delete("/api/v1/learning-path/progress");
});

test("navigation keeps aligned icons and labels inside evenly sized buttons", async ({
  page,
}) => {
  await page.goto("/");
  const nav = page.getByRole("navigation", { name: "Main navigation" });
  for (const width of [300, 320, 480, 640, 800, 1280]) {
    await page.setViewportSize({ width, height: 900 });
    const buttons = nav.getByRole("button");
    await expect(buttons).toHaveCount(5);
    const first = (await buttons.first().boundingBox())!;
    for (const button of await buttons.all()) {
      const bounds = (await button.boundingBox())!;
      const icon = (await button.locator("svg").boundingBox())!;
      const label = (await button.locator("span").boundingBox())!;
      expect(
        label.x - icon.x - icon.width,
        "icon gap at " + width + "px",
      ).toBeGreaterThanOrEqual(7);
      expect(
        label.x + label.width,
        "label fits button at " + width + "px",
      ).toBeLessThanOrEqual(bounds.x + bounds.width - 6);
      expect(label.height).toBeLessThan(26);
      expect(
        Math.abs(bounds.width - first.width),
        "equal button widths at " + width + "px",
      ).toBeLessThan(1);
      expect(bounds.x + bounds.width).toBeLessThanOrEqual(width);
    }
    if (width === 300)
      await page.screenshot({
        path: test.info().outputPath("narrow-navigation.png"),
      });
  }
});

test("daily practice stays readable when the browser panel is narrowed", async ({
  page,
}) => {
  await page.goto("/");
  const card = page.getByRole("region", {
    name: "Today's practice",
    exact: true,
  });
  const title = card.getByRole("heading", {
    name: "Today's practice",
    exact: true,
  });
  const button = card.getByRole("button", {
    name: "Start today's practice",
    exact: true,
  });
  for (const width of [320, 480, 640, 1280]) {
    await page.setViewportSize({ width, height: 900 });
    await expect(button).toBeVisible();
    const heading = (await title.boundingBox())!;
    const bounds = (await card.boundingBox())!;
    const action = (await button.boundingBox())!;
    expect(heading.width, "heading width at " + width + "px").toBeGreaterThan(
      140,
    );
    expect(heading.height, "heading height at " + width + "px").toBeLessThan(
      60,
    );
    expect(action.x).toBeGreaterThanOrEqual(bounds.x);
    expect(action.x + action.width).toBeLessThanOrEqual(
      bounds.x + bounds.width,
    );
    expect(bounds.height).toBeLessThan(360);
    if (width === 320)
      await page.screenshot({
        path: test.info().outputPath("narrow-browser-card.png"),
        fullPage: true,
      });
  }
});

test("Learn presents generated strategy skills and keeps supporting tools in their tabs", async ({
  page,
  request,
}) => {
  const catalog = await getCatalog(request);
  const lessons = allLessons(catalog);
  const expectedIds = [
    "strategy-preflop",
    "strategy-equity",
    "strategy-postflop",
    "strategy-ranges",
    "strategy-betting",
  ];
  expect(lessons.map((lesson) => lesson.contentId).sort()).toEqual(
    [...expectedIds].sort(),
  );
  expect(new Set(lessons.map((lesson) => lesson.contentId)).size).toBe(5);

  await page.goto("/");
  const home = page.getByRole("region", {
    name: "Poker strategy practice",
    exact: true,
  });
  await expect(
    page.getByRole("heading", { name: "Poker strategy", exact: true }),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Start today's practice", exact: true }),
  ).toBeEnabled();
  await expect(home).toContainText("Fresh situations each session");
  await expect(home.locator("button.primary")).toHaveCount(1);
  const path = home.getByRole("list", { name: "Strategy skills", exact: true });
  await expect(path.getByRole("button")).toHaveCount(5);
  for (const lesson of lessons) {
    await expect(
      path.getByRole("button", { name: startName(lesson), exact: true }),
    ).toBeVisible();
    expect((lesson.contentId + " " + lesson.title).toLowerCase()).not.toMatch(
      /table-flow|legal action|poker rules|hand-rankings|five-card hand/,
    );
  }
  await expect(
    home.getByRole("region", { name: "Recommended next lesson" }),
  ).toHaveCount(0);
  await expect(
    home.getByRole("region", { name: "Fresh transfer results" }),
  ).toHaveCount(0);
  await expect(
    home.getByText(/answers attempted|mistakes to learn from/),
  ).toHaveCount(0);
  await expect(
    page.getByRole("button", { name: "Open online cash Decision Lab" }),
  ).toHaveCount(0);

  const nav = page.getByRole("navigation", { name: "Main navigation" });
  await nav.getByRole("button", { name: "Progress", exact: true }).click();
  const progress = page.getByRole("region", {
    name: "Learning path progress",
    exact: true,
  });
  await expect(progress).toContainText(
    "0 lessons completed · 0 answers attempted",
  );

  await nav.getByRole("button", { name: "Practice", exact: true }).click();
  const cash = page.getByRole("button", {
    name: "Open online cash Decision Lab",
    exact: true,
  });
  await cash.click();
  await expect(
    page.getByRole("heading", {
      name: "Online cash Decision Lab",
      exact: true,
    }),
  ).toBeVisible();
  await page.reload();
  await expect(
    page.getByRole("heading", {
      name: "Online cash Decision Lab",
      exact: true,
    }),
  ).toBeVisible();
  await page
    .getByRole("button", { name: "Back to practice", exact: true })
    .click();
  await expect(cash).toBeFocused();
  await expect(
    page.getByRole("region", { name: "Current exercise" }),
  ).toBeVisible();

  await nav.getByRole("button", { name: "Reference", exact: true }).click();
  await page
    .getByRole("searchbox", { name: "Find a concept" })
    .fill("pot odds");
  await expect(
    page.getByRole("heading", { name: "Pot odds", exact: true }),
  ).toBeVisible();
  await page.getByRole("searchbox", { name: "Find a concept" }).fill("");
  await page.getByText("Opening charts", { exact: true }).click();
  await expect(
    page.getByRole("heading", { name: "Preflop opening charts", exact: true }),
  ).toBeVisible();
  const walkthrough = page.getByRole("button", {
    name: "Open preflop walkthrough",
    exact: true,
  });
  await walkthrough.click();
  await expect(
    page.getByRole("heading", {
      name: "Watch the action reach you",
      exact: true,
    }),
  ).toBeVisible();
  await page
    .getByText("More practice and earlier lessons", { exact: true })
    .click();
  await page
    .getByRole("button", { name: "Open earlier exercises", exact: true })
    .click();
  await expect(
    page.getByRole("heading", { name: "Should I bet or check?", exact: true }),
  ).toBeVisible();
  await page
    .getByRole("button", { name: "Back to reference", exact: true })
    .click();
  await expect(walkthrough).toBeFocused();
  await page
    .getByRole("button", { name: "Open legacy lessons", exact: true })
    .click();
  await expect(
    page.getByRole("button", {
      name: "Open all-in decision practice",
      exact: true,
    }),
  ).toBeVisible();
  await page
    .getByRole("button", { name: "Back to reference", exact: true })
    .click();
  await expect(
    page.getByRole("button", { name: "Open legacy lessons", exact: true }),
  ).toBeFocused();
  await page.screenshot({
    path: test.info().outputPath("reference-destinations.png"),
    fullPage: true,
  });
  await nav.getByRole("button", { name: "Learn", exact: true }).click();
  await expect(
    page.getByRole("button", { name: "Start today's practice", exact: true }),
  ).toBeEnabled();
});

test("daily practice starts a seeded strategy skill and replays the same private-safe question until submission", async ({
  page,
  request,
}) => {
  const catalog = await getCatalog(request);
  const first = allLessons(catalog)[0]!;
  await page.goto("/");
  const daily = page.getByRole("region", {
    name: "Today's practice",
    exact: true,
  });
  await expect(daily).toContainText("Not completed today");
  await expect(daily).toContainText("0-day practice streak");
  await expect(daily).toContainText(first.title);
  await daily
    .getByRole("button", { name: "Start today's practice", exact: true })
    .click();

  const progress = await readProgress(request);
  expect(progress.activeInstanceId).toBeTruthy();
  const initial = await readInstance(request, progress.activeInstanceId!);
  expect(initial.contentId).toBe(first.contentId);
  expect(initial.question).not.toBeNull();
  expect(initial.feedback).toBeNull();
  const before = initial.question!;
  expect(before.skillId).toBe(first.skillId);
  expect(JSON.stringify(before)).not.toMatch(
    /correctAnswer|gradingRule|explanation|takeaway/,
  );
  await expect(
    page.getByRole("heading", { name: before.title, exact: true }),
  ).toBeFocused();
  await expect(page.getByRole("region", { name: "Path feedback" })).toHaveCount(
    0,
  );
  const opened = await openedEvent(request, initial.instanceId);
  expect(opened.schemaVersion).toBe(2);
  expect(opened.payload).toMatchObject({
    entryPoint: "daily-recommendation",
    generatorVersion: expect.any(String),
    exerciseSeed: expect.any(Number),
  });

  await page
    .getByRole("button", { name: "Back to course", exact: false })
    .click();
  await expect(
    page.getByRole("heading", { name: "Poker strategy", exact: true }),
  ).toBeFocused();
  const resume = page.getByRole("button", {
    name: resumeName(first),
    exact: true,
  });
  await expect(resume).toContainText("In progress");
  await expect(resume).toHaveAttribute("aria-current", "step");
  await resume.click();
  await expect(
    page.getByRole("heading", { name: before.title, exact: true }),
  ).toBeFocused();
  expect((await readInstance(request, initial.instanceId)).question).toEqual(
    before,
  );
  await expect(page.getByRole("region", { name: "Path feedback" })).toHaveCount(
    0,
  );

  await page.reload();
  await expect(
    page.getByRole("heading", { name: before.title, exact: true }),
  ).toBeFocused();
  expect((await readInstance(request, initial.instanceId)).question).toEqual(
    before,
  );
  await expect(page.getByRole("region", { name: "Path feedback" })).toHaveCount(
    0,
  );

  await answerCurrentQuestion(page);
  await expect(
    page.getByRole("heading", { name: /^(Correct|Try this idea again)$/ }),
  ).toBeVisible();
  const events = (
    await (await request.get("/api/v1/learning-path/export")).json()
  ).events;
  const ownEvents = events.filter(
    (event: { instanceId: string }) => event.instanceId === initial.instanceId,
  );
  const feedbackEvent = ownEvents.find(
    (event: { kind: string; payload: { questionId?: string } }) =>
      event.kind === "feedback-generated" &&
      event.payload.questionId === before.id,
  );
  expect(feedbackEvent?.payload).toMatchObject({ questionId: before.id });
  expect(feedbackEvent?.payload.feedback).toBeTruthy();
  await expect(
    page.getByRole("region", { name: "Path feedback" }),
  ).toContainText(feedbackEvent!.payload.feedback.explanation);
  const kinds = ownEvents.map((event: { kind: string }) => event.kind);
  expect(kinds).toContain("answer-submitted");
  expect(kinds).toContain("feedback-generated");
  expect(kinds.indexOf("answer-submitted")).toBeLessThan(
    kinds.indexOf("feedback-generated"),
  );
});

test.describe("daily status freshness", () => {
  test.use({ timezoneId: "America/New_York" });
  for (const newerResult of ["failure", "success"] as const) {
    test(
      "delayed initial progress remains usable after a newer " + newerResult,
      async ({ page }) => {
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
                json: {
                  ...summary,
                  completedToday: true,
                  currentStreakDays: 2,
                },
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
            name:
              newerResult === "failure"
                ? "Practice another lesson"
                : "Start today's practice",
            exact: true,
          }),
        ).toBeEnabled();
      },
    );
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
    const action = daily.locator("button.primary");
    await expect(action).toHaveText("Practice another lesson");
    await action.focus();
    dailyState = { completedToday: false, currentStreakDays: 3 };
    await page.clock.runFor(10_000);
    await expect(daily).toContainText("Not completed today");
    await expect(daily).toContainText("3-day practice streak");
    await expect(action).toHaveText("Start today's practice");
    await expect(action).toBeFocused();
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
    await expect(action).toBeFocused();
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

test("completing a generated skill updates next practice and the local streak; repeating it generates a new scenario", async ({
  page,
  request,
}) => {
  const catalog = await getCatalog(request);
  const lessons = allLessons(catalog);
  const first = lessons[0]!;
  await page.goto("/");
  const daily = page.getByRole("region", {
    name: "Today's practice",
    exact: true,
  });
  await expect(daily).toContainText(first.title);
  await page
    .getByRole("button", { name: "Start today's practice", exact: true })
    .click();
  const firstInstance = (await readProgress(request)).activeInstanceId!;
  const firstState = await readInstance(request, firstInstance);
  const firstOpen = await openedEvent(request, firstInstance);

  await finishCurrentLesson(page, request);
  await page.getByRole("button", { name: "Back to path", exact: true }).click();
  await expect(daily).toContainText("Completed today");
  await expect(daily).toContainText("1-day practice streak");
  await expect(daily).toContainText(lessons[1]!.title);
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

  await page
    .getByRole("button", { name: repeatName(first), exact: true })
    .click();
  const secondInstance = (await readProgress(request)).activeInstanceId!;
  const secondState = await readInstance(request, secondInstance);
  const secondOpen = await openedEvent(request, secondInstance);
  expect(secondInstance).not.toBe(firstInstance);
  expect(secondState.contentId).toBe(first.contentId);
  expect(secondOpen.payload.exerciseSeed).not.toBe(
    firstOpen.payload.exerciseSeed,
  );
  expect(secondState.question).not.toEqual(firstState.question);
});

test("saved answers retry with the same id, resume, export, and clear only strategy-path data", async ({
  page,
  request,
}) => {
  const legacy = await (await request.get("/api/learning/progress")).json();
  const first = allLessons(await getCatalog(request))[0]!;
  await page.goto("/");
  await page
    .getByRole("button", { name: startName(first), exact: true })
    .focus();
  await page.keyboard.press("Enter");
  const initial = await readInstance(
    request,
    (await readProgress(request)).activeInstanceId!,
  );
  const question = initial.question!;
  await expect(
    page.getByRole("heading", { name: question.title, exact: true }),
  ).toBeFocused();
  expect(initial.feedback).toBeNull();
  expect(JSON.stringify(question)).not.toMatch(
    /correctAnswer|gradingRule|explanation|takeaway/,
  );

  const commands: unknown[] = [];
  const receipts: string[] = [];
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
  await chooseAnyAnswer(page);
  await page
    .getByRole("button", { name: "Submit answer", exact: true })
    .click();
  await expect(
    page.getByRole("button", { name: "Retry saved answer" }),
  ).toBeVisible();
  await page
    .getByRole("button", { name: "Back to course", exact: false })
    .click();
  await page
    .getByRole("button", { name: "Resume today's practice", exact: true })
    .click();
  await expect(
    page.getByRole("button", { name: "Retry saved answer" }),
  ).toBeVisible();
  const answerField =
    question.answerKind === "choice"
      ? page.getByRole("radio").first()
      : page.getByRole("spinbutton");
  await expect(answerField).toBeDisabled();
  await expect(
    page.getByRole("button", { name: "Retry saved answer", exact: true }),
  ).toBeEnabled();
  await page.reload();
  await expect(
    page.getByRole("button", { name: "Retry saved answer" }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Retry saved answer" }).click();
  await expect(
    page.getByRole("region", { name: "Path feedback" }),
  ).toBeVisible();
  expect(commands).toHaveLength(2);
  expect(commands[1]).toEqual(commands[0]);
  expect(receipts[1]).toBe(receipts[0]);

  await page.getByRole("button", { name: "Continue lesson" }).click();
  const nextState = await readInstance(request, initial.instanceId);
  if (nextState.question)
    await expect(
      page.getByRole("heading", {
        name: nextState.question.title,
        exact: true,
      }),
    ).toBeFocused();
  await page.evaluate(() => localStorage.removeItem("poker-learning-path-v1"));
  await page.reload();
  const recovered = await readInstance(request, initial.instanceId);
  expect(recovered.question).toEqual(nextState.question);
  if (recovered.question)
    await expect(
      page.getByRole("heading", {
        name: recovered.question.title,
        exact: true,
      }),
    ).toBeFocused();

  await finishCurrentLesson(page, request);
  await page.screenshot({
    path: test.info().outputPath("strategy-skill-complete.png"),
    fullPage: true,
  });
  const exported = await (
    await request.get("/api/v1/learning-path/export")
  ).json();
  const instanceEvents = exported.events.filter(
    (event: { instanceId: string }) => event.instanceId === initial.instanceId,
  );
  const kinds = instanceEvents.map((event: { kind: string }) => event.kind);
  expect(kinds.indexOf("question-presented")).toBeLessThan(
    kinds.indexOf("answer-submitted"),
  );
  expect(kinds.indexOf("feedback-generated")).toBeLessThan(
    kinds.indexOf("feedback-shown"),
  );
  expect(
    kinds.filter((kind: string) => kind === "lesson-completed"),
  ).toHaveLength(1);
  expect(kinds).toContain("lesson-resumed");

  const completedCheckpoint = await page.evaluate(() =>
    localStorage.getItem("poker-learning-path-v1"),
  );
  await page.getByRole("button", { name: "Back to path", exact: true }).focus();
  await page.keyboard.press("Enter");
  await expect(
    page.getByRole("heading", { name: "Poker strategy", exact: true }),
  ).toBeFocused();
  await page.evaluate(
    (value) => localStorage.setItem("poker-learning-path-v1", value!),
    completedCheckpoint,
  );
  await page.reload();
  await expect(
    page.getByRole("heading", { name: "Lesson complete", exact: true }),
  ).toBeVisible();

  await pathData(page);
  const trigger = page.getByRole("button", {
    name: "Clear path progress",
    exact: true,
  });
  await trigger.click();
  await expect(page.getByRole("dialog")).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(trigger).toBeFocused();
  expect((await readProgress(request)).answerAttempts).toBeGreaterThan(0);
  await trigger.click();
  await page
    .getByRole("button", { name: "Confirm clear path progress" })
    .click();
  await expect(
    page.getByText(/0 lessons completed.*0 answers attempted/),
  ).toBeVisible();
  await expect(trigger).toBeFocused();
  expect(await (await request.get("/api/learning/progress")).json()).toEqual(
    legacy,
  );
});

test("acknowledgements retry their saved IDs and stale reload preserves a dynamic answer", async ({
  page,
  request,
}) => {
  await page.goto("/");
  const first = allLessons(await getCatalog(request))[0]!;
  const presentations: unknown[] = [];
  await page.route("**/questions/*/presented", async (route) => {
    presentations.push(route.request().postDataJSON());
    const response = await route.fetch();
    if (presentations.length === 1) await route.abort("failed");
    else await route.fulfill({ response });
  });
  await page
    .getByRole("button", { name: startName(first), exact: true })
    .click();
  await expect(page.getByRole("alert")).toBeVisible();
  await page
    .getByRole("button", { name: "Back to course", exact: false })
    .click();
  await page
    .getByRole("button", { name: "Resume today's practice", exact: true })
    .click();
  await expect(page.getByRole("alert")).toBeVisible();
  await page.getByRole("button", { name: "Try again", exact: true }).click();
  const state = await readInstance(
    request,
    (await readProgress(request)).activeInstanceId!,
  );
  if (state.question?.answerKind === "choice")
    await expect(page.getByRole("radio").first()).toBeEnabled();
  else await expect(page.getByRole("spinbutton")).toBeEnabled();
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
  await chooseAnyAnswer(page);
  await page
    .getByRole("button", { name: "Submit answer", exact: true })
    .click();
  await expect(page.getByRole("alert")).toContainText(
    "Your saved answer is preserved",
  );
  await page.getByRole("button", { name: "Reload current lesson" }).click();
  const current = await readInstance(request, state.instanceId);
  if (current.question?.answerKind === "choice") {
    await expect(page.getByRole("radio").first()).toBeChecked();
  } else {
    await expect(page.getByRole("spinbutton")).toHaveValue("50");
  }
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
  const catalog = await getCatalog(request);
  async function open() {
    return request.post("/api/v1/learning-path/instances", {
      data: {
        eventId: crypto.randomUUID(),
        instanceId: crypto.randomUUID(),
        sessionId: crypto.randomUUID(),
        contentId: allLessons(catalog)[0]!.contentId,
        contentVersion: catalog.contentVersion,
        entryPoint: "path-selection",
      },
    });
  }
  for (let i = 0; i < 103; i++) {
    const response = await open();
    expect(response.ok()).toBeTruthy();
  }
  await page.goto("/");
  const active = (await readProgress(request)).activeInstanceId!;
  const question = (await readInstance(request, active)).question!;
  await expect(
    page.getByRole("heading", { name: question.title, exact: true }),
  ).toBeFocused();
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
  await pathData(page);
  const downloadPromise = page.waitForEvent("download");
  await page.getByRole("button", { name: "Download path data" }).click();
  const download = await downloadPromise;
  const { readFile } = await import("node:fs/promises");
  const exported = JSON.parse(await readFile((await download.path())!, "utf8"));
  expect(pages).toHaveLength(2);
  expect(new URL(pages[1]!.url).searchParams.get("throughCursor")).toBe(
    String(pages[0]!.data.throughCursor),
  );
  expect(exported.events).toEqual(pages.flatMap((page) => page.data.events));
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

test("strategy lessons and clear-dialog controls work with the keyboard alone", async ({
  page,
  request,
}) => {
  await page.goto("/");
  const first = allLessons(await getCatalog(request))[0]!;
  const start = page.getByRole("button", {
    name: startName(first),
    exact: true,
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
  await start.focus();
  await page.keyboard.press("Enter");
  const state = await readInstance(
    request,
    (await readProgress(request)).activeInstanceId!,
  );
  const question = state.question!;
  await expect(
    page.getByRole("heading", { name: question.title, exact: true }),
  ).toBeFocused();
  const answerControl =
    question.answerKind === "choice"
      ? page.getByRole("radio").first()
      : page.getByRole("spinbutton");
  await expect(answerControl).toBeEnabled();
  await tabTo(answerControl);
  if (question.answerKind === "choice") await page.keyboard.press("Space");
  else {
    await page.keyboard.press("5");
    await page.keyboard.press("0");
  }
  const submit = page.getByRole("button", {
    name: "Submit answer",
    exact: true,
  });
  await tabTo(submit);
  await page.keyboard.press("Enter");
  await expect(
    page.getByRole("heading", { name: /^(Correct|Try this idea again)$/ }),
  ).toBeFocused();
  const next = page.getByRole("button", { name: "Continue lesson" });
  await expect(next).toBeEnabled();
  await tabTo(next);
  await page.keyboard.press("Enter");
  await tabTo(
    page
      .getByRole("navigation", { name: "Main navigation" })
      .getByRole("button", { name: "Progress", exact: true }),
  );
  await page.keyboard.press("Enter");
  await tabTo(page.getByText("Learning path data", { exact: true }));
  await page.keyboard.press("Enter");
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
  test(
    "failed " +
      acknowledgement +
      " remains retryable after a successful download",
    async ({ page, request }) => {
      const first = allLessons(await getCatalog(request))[0]!;
      await page.goto("/");
      const acks: unknown[] = [];
      await page.route("**/questions/*/" + acknowledgement, async (route) => {
        acks.push(route.request().postDataJSON());
        if (acks.length === 1)
          await route.fulfill({
            status: 503,
            json: { error: "Acknowledgement temporarily unavailable" },
          });
        else await route.continue();
      });
      await page
        .getByRole("button", { name: startName(first), exact: true })
        .click();
      if (acknowledgement === "feedback-shown")
        await answerCurrentQuestion(page);
      await expect(page.getByRole("alert")).toContainText(
        "Acknowledgement temporarily unavailable",
      );
      await pathData(page);
      const downloaded = page.waitForEvent("download");
      await page.getByRole("button", { name: "Download path data" }).click();
      await downloaded;
      await showLearn(page);
      if (acknowledgement === "presented") {
        const state = await readInstance(
          request,
          (await readProgress(request)).activeInstanceId!,
        );
        if (state.question?.answerKind === "choice")
          await expect(page.getByRole("radio").first()).toBeEnabled();
        else await expect(page.getByRole("spinbutton")).toBeEnabled();
      } else {
        await expect(
          page.getByRole("button", { name: "Continue lesson" }),
        ).toBeEnabled();
      }
      expect(acks).toHaveLength(2);
      expect(acks[1]).toEqual(acks[0]);
    },
  );
}

for (const failedStep of ["delete", "refresh"]) {
  test(
    "clear " + failedStep + " failure has an accessible retry inside the modal",
    async ({ page, request }) => {
      const first = allLessons(await getCatalog(request))[0]!;
      await page.goto("/");
      await expect(
        page.getByRole("button", { name: startName(first), exact: true }),
      ).toBeEnabled();
      await pathData(page);
      let failed = false;
      await page.route(
        failedStep === "delete"
          ? /\/api\/v1\/learning-path\/progress(?:\?.*)?$/
          : /\/api\/progress$/,
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
      await expect(
        page.getByText(/0 lessons completed.*0 answers attempted/),
      ).toBeVisible();
    },
  );
}

test("generated strategy catalog contains five distinct strategic skills and seeded scenarios vary by instance", async ({
  request,
}) => {
  const catalog = await getCatalog(request);
  const lessons = allLessons(catalog);
  expect(catalog.title).toBe("Poker strategy");
  expect(lessons.map((lesson) => lesson.contentId).sort()).toEqual(
    [
      "strategy-preflop",
      "strategy-equity",
      "strategy-postflop",
      "strategy-ranges",
      "strategy-betting",
    ].sort(),
  );
  const opened: {
    contentId: string;
    question: unknown;
    feedback: unknown;
    seed: number;
    generator: string;
  }[] = [];
  const sessionId = crypto.randomUUID();
  for (const lesson of lessons) {
    const response = await request.post("/api/v1/learning-path/instances", {
      data: {
        eventId: crypto.randomUUID(),
        instanceId: crypto.randomUUID(),
        sessionId,
        contentId: lesson.contentId,
        contentVersion: catalog.contentVersion,
        entryPoint: "path-selection",
      },
    });
    expect(response.ok()).toBeTruthy();
    const instance = await response.json();
    expect(instance.contentId).toBe(lesson.contentId);
    expect(instance.question).toBeTruthy();
    expect(instance.question.skillId).toBe(lesson.skillId);
    expect(instance.feedback).toBeNull();
    expect(JSON.stringify(instance.question)).not.toMatch(
      /correctAnswer|gradingRule|explanation|takeaway/,
    );
    const event = await openedEvent(request, instance.instanceId);
    opened.push({
      contentId: instance.contentId,
      question: instance.question,
      feedback: instance.feedback,
      seed: event.payload.exerciseSeed,
      generator: event.payload.generatorVersion,
    });
    expect(event.payload.generatorVersion).toEqual(expect.any(String));
    expect(event.payload.exerciseSeed).toEqual(expect.any(Number));
  }
  const first = lessons[0]!;
  const varied = await request.post("/api/v1/learning-path/instances", {
    data: {
      eventId: crypto.randomUUID(),
      instanceId: crypto.randomUUID(),
      sessionId,
      contentId: first.contentId,
      contentVersion: catalog.contentVersion,
      entryPoint: "path-selection",
    },
  });
  expect(varied.ok()).toBeTruthy();
  const variant = await varied.json();
  const variantOpen = await openedEvent(request, variant.instanceId);
  expect(variantOpen.payload.exerciseSeed).not.toBe(opened[0]!.seed);
  expect(variant.question).not.toEqual(opened[0]!.question);
  expect(new Set(opened.map((item) => item.seed)).size).toBe(lessons.length);
  expect(opened.map((item) => item.contentId)).toEqual(
    lessons.map((lesson) => lesson.contentId),
  );
});

test("experienced players can enter bot and cash practice before completing a strategy skill", async ({
  page,
  request,
}) => {
  await page.goto("/");
  await page
    .getByRole("navigation", { name: "Main navigation" })
    .getByRole("button", { name: "Play", exact: true })
    .click();
  await expect(
    page.getByRole("heading", { name: "Bot table", exact: true }),
  ).toBeVisible();
  await page
    .getByRole("navigation", { name: "Main navigation" })
    .getByRole("button", { name: "Practice", exact: true })
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
  expect((await readProgress(request)).startedLessons).toBe(0);
});

test("back to course preserves the active strategy draft and feedback across pause and reload", async ({
  page,
  request,
}) => {
  const first = allLessons(await getCatalog(request))[0]!;
  await page.goto("/");
  await page
    .getByRole("button", { name: "Start today's practice", exact: true })
    .click();
  let state = await readInstance(
    request,
    (await readProgress(request)).activeInstanceId!,
  );
  const question = state.question!;
  const heading = page.getByRole("heading", {
    name: question.title,
    exact: true,
  });
  await expect(heading).toBeFocused();
  await expect(
    page.getByRole("heading", { name: "Poker strategy", exact: true }),
  ).toHaveCount(0);
  await chooseAnyAnswer(page);
  const before = await (
    await request.get("/api/v1/learning-path/export")
  ).json();
  const saved = await page.evaluate(() =>
    localStorage.getItem("poker-learning-path-v1"),
  );
  await page
    .getByRole("button", { name: "Back to course", exact: false })
    .click();
  await expect(
    page.getByRole("heading", { name: "Poker strategy", exact: true }),
  ).toBeFocused();
  const resumeRow = page.getByRole("button", {
    name: resumeName(first),
    exact: true,
  });
  await expect(resumeRow).toContainText("In progress");
  await expect(resumeRow).toHaveAttribute("aria-current", "step");
  await resumeRow.click();
  await expect(heading).toBeFocused();
  if (question.answerKind === "choice")
    await expect(page.getByRole("radio").first()).toBeChecked();
  else await expect(page.getByRole("spinbutton")).toHaveValue("50");
  expect(
    await page.evaluate(() => localStorage.getItem("poker-learning-path-v1")),
  ).toBe(saved);
  expect(
    (await (await request.get("/api/v1/learning-path/export")).json()).events,
  ).toEqual(before.events);
  await page
    .getByRole("button", { name: "Submit answer", exact: true })
    .click();
  const feedback = page.getByRole("heading", {
    name: /^(Correct|Try this idea again)$/,
  });
  await expect(feedback).toBeFocused();
  await expect(
    page.getByRole("button", { name: "Continue lesson", exact: true }),
  ).toBeEnabled();
  await page
    .getByRole("button", { name: "Back to course", exact: false })
    .click();
  await page
    .getByRole("button", { name: "Resume today's practice", exact: true })
    .click();
  await expect(feedback).toBeFocused();
  await page
    .getByRole("button", { name: "Continue lesson", exact: true })
    .click();
  state = await readInstance(request, state.instanceId);
  if (state.question) {
    await expect(
      page.getByRole("heading", { name: state.question.title, exact: true }),
    ).toBeFocused();
    await chooseAnyAnswer(page);
    await page
      .getByRole("button", { name: "Back to course", exact: false })
      .click();
    await page.reload();
    const recovered = await readInstance(request, state.instanceId);
    expect(recovered.question).toEqual(state.question);
    await expect(
      page.getByRole("heading", { name: state.question.title, exact: true }),
    ).toBeFocused();
  }
});

test("daily course completion reports progress independently of the generated answer values", async ({
  page,
  request,
}) => {
  const first = allLessons(await getCatalog(request))[0]!;
  await page.goto("/");
  const daily = page.getByRole("region", {
    name: "Today's practice",
    exact: true,
  });
  await page
    .getByRole("button", { name: "Start today's practice", exact: true })
    .click();
  await finishCurrentLesson(page, request);
  await page.getByRole("button", { name: "Back to path", exact: true }).click();
  await expect(daily).toContainText("Completed today");
  await expect(daily).toContainText("1-day practice streak");
  await expect(daily).toContainText(
    allLessons(await getCatalog(request))[1]!.title,
  );
  const progress = await readProgress(request);
  expect(progress.completedContentIds).toEqual([first.contentId]);
  expect(progress.completedLessons).toBe(1);
  expect(progress.answerAttempts).toBeGreaterThan(0);
  expect(progress.completedToday).toBe(true);
  expect(progress.currentStreakDays).toBe(1);
  await page.reload();
  await expect(daily).toContainText("Completed today");
  await expect(daily).toContainText("1-day practice streak");
});

test("lesson and clear-dialog flow remains keyboard accessible with focus return", async ({
  page,
  request,
}) => {
  await page.goto("/");
  const clearTarget = page
    .getByRole("navigation", { name: "Main navigation" })
    .getByRole("button", { name: "Progress", exact: true });
  await clearTarget.focus();
  await page.keyboard.press("Enter");
  await page.getByText("Learning path data", { exact: true }).click();
  const clear = page.getByRole("button", {
    name: "Clear path progress",
    exact: true,
  });
  await clear.focus();
  await page.keyboard.press("Enter");
  await expect(
    page.getByRole("button", { name: "Keep progress" }),
  ).toBeFocused();
  await page.keyboard.press("Escape");
  await expect(clear).toBeFocused();
  expect((await readProgress(request)).completedLessons).toBe(0);
});
