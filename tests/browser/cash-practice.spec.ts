import { test, expect, type Page } from "@playwright/test";
import type {
  CashDrillView,
  CashQuestion,
} from "../../packages/shared/src/cash-practice";

async function openLab(page: Page) {
  await page.goto("/");
  await page
    .getByRole("button", { name: "Open online cash Decision Lab" })
    .click();
  await expect(
    page.getByRole("heading", {
      name: "Online cash Decision Lab",
      exact: true,
    }),
  ).toBeVisible();
}
async function create(page: Page, name = "Start cash drill") {
  const response = page.waitForResponse(
    (r) =>
      r.url().endsWith("/api/cash-practice/drills") &&
      r.request().method() === "POST" &&
      r.ok(),
  );
  await page.getByRole("button", { name, exact: true }).click();
  const view = (await (await response).json()) as CashDrillView;
  await expect(
    page.getByRole("region", { name: "Current cash decision" }),
  ).toBeVisible();
  await expectQuestionInputs(page, view.initial);
  await expect(
    page
      .getByRole("region", { name: "Current cash decision" })
      .getByText(/^In this example:/),
  ).toHaveCount(0);
  return view;
}
async function expectQuestionInputs(page: Page, q: CashQuestion) {
  const scene = page.getByRole("region", { name: "Current cash decision" });
  const number = (n: number) => Number(n.toFixed(2)).toString();
  await expect(scene).toContainText(
    `${q.activePlayers} players still in this pot`,
  );
  await expect(scene).toContainText(`Current pot: ${number(q.potBb)} BB`);
  await expect(scene).toContainText(
    q.callBb > 0
      ? `Call costs ${number(q.callBb)} BB`
      : `Offered bet ${number(q.betBb)} BB`,
  );
  await expect(scene).toContainText(`Fixed rake: ${number(q.rakeBb)} BB`);
  await expect(
    scene.getByText("BB = big blind. Rake is a fixed practice deduction."),
  ).toBeVisible();
  await expect(
    scene.getByText("Practice ranges; real opponents vary."),
  ).toBeVisible();
  await expect(scene).toContainText(
    `You: ${q.seats.find((seat) => seat.seat === q.heroSeat)?.position}`,
  );
  await expect(scene).toContainText(
    q.callBb > 0
      ? "Calling ends the betting."
      : "Checking ends the hand; bets get only the shown responses.",
  );
  const rankNames: Record<string, string> = {
    A: "Ace",
    K: "King",
    Q: "Queen",
    J: "Jack",
    T: "10",
  };
  const suits: Record<string, string> = {
    c: "clubs",
    d: "diamonds",
    h: "hearts",
    s: "spades",
  };
  for (const card of [...q.hole, ...q.board]) {
    await expect(
      scene.locator(".learning-cards").getByRole("img", {
        name: `${rankNames[card[0]] ?? card[0]} of ${suits[card[1]]}`,
        exact: true,
      }),
    ).toBeVisible();
  }
  for (const range of q.ranges) {
    const region = scene.getByRole("region", {
      name: range.label,
      exact: true,
    });
    await expect(region).toBeVisible();
    await expect(region.locator(".cash-range-row")).toHaveCount(
      range.combinations.length,
    );
    const total = range.combinations.reduce((sum, c) => sum + c.weight, 0);
    for (const [i, combination] of range.combinations.entries()) {
      const row = region.locator(".cash-range-row").nth(i);
      await expect(row).toBeVisible();
      await expect(row).toContainText(
        `Weight ${((100 * combination.weight) / total).toFixed(2)}%`,
      );
      for (const card of combination.cards) {
        await expect(
          row.getByRole("img", {
            name: `${rankNames[card[0]] ?? card[0]} of ${suits[card[1]]}`,
            exact: true,
          }),
        ).toBeVisible();
      }
      if (combination.response)
        await expect(row).toContainText(
          `${combination.response === "call" ? "Calls" : "Folds to"} ${number(q.betBb)} BB bet`,
        );
    }
  }
}
async function answer(page: Page, q: CashQuestion) {
  const region = page.getByRole("region", { name: "Current cash decision" });
  await region
    .getByRole("group", { name: "Your action" })
    .getByRole("radio", { name: q.options[0].label, exact: true })
    .check();
  await region
    .getByRole("group", { name: "Why?", exact: true })
    .getByRole("radio", { name: q.reasons[0].label, exact: true })
    .check();
  await region.getByRole("spinbutton", { name: q.estimatePrompt }).fill("0");
  await region.getByRole("radio", { name: "Very sure", exact: true }).check();
  const response = page.waitForResponse(
    (r) =>
      r.url().endsWith("/answer") && r.request().method() === "POST" && r.ok(),
  );
  await region.getByRole("button", { name: "Check answer" }).click();
  const saved = (await (await response).json()) as CashDrillView;
  const f = saved.feedback[q.phase]!;
  const feedback = region.getByRole("region", {
    name: "Cash decision feedback",
  });
  await expect(feedback).toBeVisible();
  await expect(feedback.locator("details[open]")).toHaveCount(0);
  const accepted = f.acceptedActions.map(
    (action) => q.options.find((option) => option.action === action)!.label,
  );
  await expect(
    feedback.getByText(`In this example: ${accepted.join(" or ")}.`, {
      exact: true,
    }),
  ).toBeVisible();
  await expect(
    feedback.getByText(
      `Action: ${f.actionCorrect ? "Correct" : "Revisit"} · Reason: ${f.reasonCorrect ? "Correct" : "Revisit"} · Estimate: ${f.estimateCorrect ? "Within tolerance" : "Revisit"}`,
      { exact: true },
    ),
  ).toBeVisible();
  const number = (n: number) => Number(n.toFixed(2)).toString();
  if (q.callBb > 0) {
    await expect(
      feedback.getByText(
        `Expected pot share: ${number(f.sharePercent!)}% · Required share: ${number(f.expectedEstimate)}%.`,
        { exact: true },
      ),
    ).toBeVisible();
  } else if (q.skill === "bluff") {
    await expect(
      feedback.getByText(
        `Supplied folds: ${number(f.foldPercent!)}% · Required folds: ${number(f.expectedEstimate)}%.`,
        { exact: true },
      ),
    ).toBeVisible();
  } else {
    const bet = f.actionValues.find((value) => value.action === "bet")!;
    const check = f.actionValues.find((value) => value.action === "check")!;
    await expect(
      feedback.getByText(
        `Weaker callers: ${number(f.weakerCallerPercent!)}% · Average return in this example: ${number(bet.evBb)} BB betting vs ${number(check.evBb)} BB checking.`,
        { exact: true },
      ),
    ).toBeVisible();
  }
}

test.beforeEach(async ({ request, page }) => {
  await request.delete("/api/progress");
  if (test.info().project.name === "mobile")
    await page.setViewportSize({ width: 320, height: 800 });
});

test("river bluff feedback shows the accepted move and supplied folds before opening math", async ({
  page,
}) => {
  await openLab(page);
  await page
    .getByRole("combobox", { name: "Practice focus" })
    .selectOption("bluff");
  const drill = await create(page);
  await answer(page, drill.initial);
});

test("full-ring first decision stays private, asks for reasoning and resumes immutable feedback", async ({
  page,
  request,
}) => {
  await openLab(page);
  await expect(page.getByRole("combobox", { name: "Table seats" })).toHaveValue(
    "9",
  );
  await page
    .getByRole("combobox", { name: "Practice focus" })
    .selectOption("bluff-catch");
  const view = await create(page);
  expect(view.initial.tablePlayers).toBe(9);
  expect(view.transfer).toBeNull();
  expect(view.feedback).toEqual({});
  const scene = page.getByRole("region", { name: "Current cash decision" });
  await expect(scene.locator(".cash-seat")).toHaveCount(9);
  await expect(scene.locator(".cash-seats")).not.toBeVisible();
  await expect(scene.locator(".cash-history")).not.toBeVisible();
  await expect(scene.locator("details[open]")).toHaveCount(0);
  await scene.getByText("Table details", { exact: true }).focus();
  await page.keyboard.press("Enter");
  await expect(scene.locator(".cash-seats")).toBeVisible();
  await scene.getByText("Table details", { exact: true }).click();
  await expect(scene).toContainText("9-seat cash table");
  await expect(scene).toContainText("2 players still in this pot");
  await expect(
    scene.getByRole("region", { name: "Cash decision feedback" }),
  ).toHaveCount(0);
  await expect(
    scene.getByRole("button", { name: "Try the change" }),
  ).toHaveCount(0);
  await expect(
    scene.getByRole("button", { name: "Check answer" }),
  ).toBeDisabled();
  await expect(
    scene.getByText("Expected value for these practice ranges and responses", {
      exact: true,
    }),
  ).toHaveCount(0);
  await scene.getByText("Hand history", { exact: true }).focus();
  await page.keyboard.press("Space");
  await expect(scene.locator(".cash-history")).toBeVisible();
  // Action alone must never submit a score; all three reasoning fields are required.
  await scene
    .getByRole("group", { name: "Your action" })
    .getByRole("radio")
    .first()
    .check();
  await expect(
    scene.getByRole("button", { name: "Check answer" }),
  ).toBeDisabled();
  await answer(page, view.initial);
  const feedback = scene.getByRole("region", {
    name: "Cash decision feedback",
  });
  await expect(feedback).toBeFocused();
  await expect(feedback.locator("details[open]")).toHaveCount(0);
  await expect(
    feedback.getByRole("heading", {
      name: "Expected value for these practice ranges and responses",
    }),
  ).not.toBeVisible();
  await expect(
    scene.getByRole("region", { name: "Cash decision feedback" }),
  ).toContainText("Independent first answer");
  await expect(scene.getByRole("button", { name: "Check answer" })).toHaveCount(
    0,
  );
  const saved = (await (
    await request.get(`/api/cash-practice/drills/${view.id}`)
  ).json()) as CashDrillView;
  expect(saved.transfer).not.toBeNull();
  expect(saved.answers.initial?.estimatePercent).toBe(0);
  await expect(
    feedback.getByRole("heading", {
      name: saved.feedback.initial!.correct
        ? "Correct for this practice range"
        : "Revisit this decision",
      exact: true,
    }),
  ).toBeVisible();
  await expect(
    feedback.getByText(saved.feedback.initial!.takeaway, { exact: true }),
  ).toBeVisible();
  await expect(
    feedback.getByText(saved.feedback.initial!.calculation, { exact: true }),
  ).not.toBeVisible();
  await feedback.getByText("Answer breakdown", { exact: true }).focus();
  await page.keyboard.press("Space");
  await expect(feedback.getByText(/Your estimate: 0%/)).toBeVisible();
  await expect(feedback).toContainText("Confidence: very sure");
  await feedback.getByText("Math", { exact: true }).focus();
  await page.keyboard.press("Enter");
  await expect(
    feedback.getByText(saved.feedback.initial!.calculation, { exact: true }),
  ).toBeVisible();
  await expect(
    feedback.getByRole("heading", {
      name: "Expected value for these practice ranges and responses",
    }),
  ).toBeVisible();
  await expectQuestionInputs(page, view.initial);
  await page.reload();
  await expect(
    page.getByRole("region", { name: "Cash decision feedback" }),
  ).toContainText("Independent first answer");
  await expect(page.getByRole("button", { name: "Check answer" })).toHaveCount(
    0,
  );
  await expect(
    page.getByRole("region", { name: "Online cash progress" }),
  ).toContainText("/1 correct for these practice ranges");
  const again = await (
    await request.get(`/api/cash-practice/drills/${view.id}`)
  ).json();
  expect(again.answers).toEqual(saved.answers);
  const progress = await (
    await request.get("/api/cash-practice/progress")
  ).json();
  expect(progress.independentAttempts).toBe(1);
  expect(progress.assistedAttempts).toBe(0);
  expect(progress.transferAttempts).toBe(0);
  await page.screenshot({
    path: test.info().outputPath("cash-decision.png"),
    fullPage: true,
  });
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
});

test("hinted work and guided changed assumptions stay separate, fresh review hides feedback", async ({
  page,
  request,
}) => {
  await openLab(page);
  await page
    .getByRole("combobox", { name: "Practice focus" })
    .selectOption("value-bet");
  const initial = await create(page);
  await page.getByRole("button", { name: "Use a hint", exact: true }).click();
  await expect(
    page.getByRole("region", { name: "Current cash decision" }),
  ).toContainText("Counts as a hinted answer");
  await answer(page, initial.initial);
  await expect(
    page.getByRole("region", { name: "Cash decision feedback" }),
  ).toContainText("Hinted first answer");
  const saved = (await (
    await request.get(`/api/cash-practice/drills/${initial.id}`)
  ).json()) as CashDrillView;
  await page.getByRole("button", { name: "Try the change" }).click();
  await expect(
    page.getByRole("region", { name: "Cash decision feedback" }),
  ).toHaveCount(0);
  await expect(
    page.getByRole("region", { name: "Current cash decision" }),
  ).toContainText("Guided follow-up");
  await expect(
    page.getByRole("button", { name: "Check answer" }),
  ).toBeDisabled();
  await page.reload();
  await expect(
    page.getByRole("region", { name: "Current cash decision" }),
  ).toContainText("Guided follow-up");
  await expectQuestionInputs(page, saved.transfer!);
  await answer(page, saved.transfer!);
  await expect(
    page.getByRole("region", { name: "Cash decision feedback" }),
  ).toContainText("Guided follow-up");
  const progress = await (
    await request.get("/api/cash-practice/progress")
  ).json();
  expect(progress.independentAttempts).toBe(0);
  expect(progress.assistedAttempts).toBe(1);
  expect(progress.transferAttempts).toBe(1);
  const fresh = await create(page, "Fresh drill for this skill");
  expect(fresh.id).not.toBe(initial.id);
  expect(fresh.initial.skill).toBe("value-bet");
  expect(fresh.transfer).toBeNull();
  await expect(
    page.getByRole("region", { name: "Cash decision feedback" }),
  ).toHaveCount(0);
  await page.getByRole("button", { name: "Progress", exact: true }).click();
  const summary = page.getByRole("region", { name: "Online cash progress" });
  await expect(summary).toContainText("Hinted first answers: 1");
  await expect(summary).toContainText("/1 correct");
  await expect(
    summary.getByText("Progress details", { exact: true }),
  ).toBeVisible();
  await expect(summary.locator("details[open]")).toHaveCount(0);
  await summary.getByText("What to practice next", { exact: true }).click();
  await expect(summary.locator(".cash-skill-list")).toBeVisible();
  await expect(summary.locator(".cash-skill-list")).toContainText("Value bets");
});

test("table settings retain the current scene and support eight seats and heads-up", async ({
  page,
}) => {
  await openLab(page);
  await page
    .getByRole("combobox", { name: "Practice focus" })
    .selectOption("multiway-call");
  const nine = await create(page);
  expect(nine.initial.activePlayers).toBe(3);
  await page.getByRole("combobox", { name: "Table seats" }).selectOption("8");
  await expect(
    page.getByRole("region", { name: "Current cash decision" }),
  ).toContainText("9-seat cash table");
  const eight = await create(page, "Start fresh cash drill");
  expect(eight.initial.tablePlayers).toBe(8);
  expect(eight.initial.activePlayers).toBe(3);
  await expect(page.locator(".cash-seat")).toHaveCount(8);
  await answer(page, eight.initial);
  await page.getByRole("combobox", { name: "Table seats" }).selectOption("2");
  await expect(
    page.getByRole("combobox", { name: "Practice focus" }),
  ).toHaveValue("auto");
  await expect(
    page
      .getByRole("combobox", { name: "Practice focus" })
      .locator('option[value="multiway-call"]'),
  ).toHaveCount(0);
  await expect(
    page.getByRole("button", { name: "Fresh drill for this skill" }),
  ).toBeDisabled();
  await expect(
    page.getByText("Multiway calls need at least three seats."),
  ).toBeVisible();
  const progress = page.getByRole("region", { name: "Online cash progress" });
  await progress.getByText("What to practice next", { exact: true }).click();
  await expect(
    progress.getByRole("button", { name: "Fresh multiway calls drill" }),
  ).toHaveCount(0);
  const two = await create(page, "Start fresh cash drill");
  expect(two.initial.tablePlayers).toBe(2);
  expect(two.initial.activePlayers).toBe(2);
  await expect(page.locator(".cash-seat")).toHaveCount(2);
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
});

test("failed loading, hint and saving are retryable without losing the answer", async ({
  page,
  request,
}) => {
  await openLab(page);
  let failCreate = true;
  await page.route("**/api/cash-practice/drills", async (route) => {
    if (route.request().method() === "POST" && failCreate) {
      failCreate = false;
      await route.fulfill({ status: 503, json: { error: "Cash server busy" } });
    } else await route.continue();
  });
  await page
    .getByRole("button", { name: "Start cash drill", exact: true })
    .click();
  await expect(page.getByRole("alert")).toContainText("Cash server busy");
  const response = page.waitForResponse(
    (r) => r.url().endsWith("/api/cash-practice/drills") && r.ok(),
  );
  await page.getByRole("button", { name: "Try again", exact: true }).click();
  const view = (await (await response).json()) as CashDrillView;
  let failHint = true;
  await page.route(
    `**/api/cash-practice/drills/${view.id}/hint`,
    async (route) => {
      if (failHint) {
        failHint = false;
        await route.fulfill({
          status: 503,
          json: { error: "Hint temporarily unavailable" },
        });
      } else await route.continue();
    },
  );
  await page.getByRole("button", { name: "Use a hint", exact: true }).click();
  await expect(page.getByRole("alert")).toContainText(
    "Hint temporarily unavailable",
  );
  await page.getByRole("button", { name: "Try again", exact: true }).click();
  await expect(
    page.getByRole("region", { name: "Current cash decision" }),
  ).toContainText("Counts as a hinted answer");
  let failAnswer = true;
  await page.route(
    `**/api/cash-practice/drills/${view.id}/answer`,
    async (route) => {
      if (failAnswer) {
        failAnswer = false;
        await route.fulfill({
          status: 503,
          json: { error: "Answer not saved yet" },
        });
      } else await route.continue();
    },
  );
  const scene = page.getByRole("region", { name: "Current cash decision" });
  await scene
    .getByRole("group", { name: "Your action" })
    .getByRole("radio")
    .first()
    .check();
  await scene
    .getByRole("group", { name: "Why?", exact: true })
    .getByRole("radio")
    .first()
    .check();
  await scene.getByRole("spinbutton").fill("17");
  await scene.getByRole("radio", { name: "Unsure", exact: true }).check();
  await scene.getByRole("button", { name: "Check answer" }).click();
  await expect(page.getByRole("alert")).toContainText("Answer not saved yet");
  await expect(scene.getByRole("spinbutton")).toHaveValue("17");
  await page.getByRole("button", { name: "Try again", exact: true }).click();
  await expect(
    page.getByRole("region", { name: "Cash decision feedback" }),
  ).toBeVisible();
  const feedback = page.getByRole("region", { name: "Cash decision feedback" });
  await feedback.getByText("Answer breakdown", { exact: true }).click();
  await expect(feedback.getByText(/Your estimate: 17%/)).toBeVisible();
  expect(
    (await (await request.get("/api/cash-practice/progress")).json())
      .assistedAttempts,
  ).toBe(1);
});

test("cleared saved drill recovers and starts a new decision", async ({
  page,
  request,
}) => {
  await openLab(page);
  await create(page);
  await request.delete("/api/progress");
  await page.reload();
  await expect(
    page.getByText(
      "The saved drill was cleared. Start a fresh drill when you're ready.",
      { exact: true },
    ),
  ).toBeVisible();
  await expect(
    page.getByRole("region", { name: "Current cash decision" }),
  ).toHaveCount(0);
  await create(page);
  await expect(
    page.getByRole("region", { name: "Cash decision feedback" }),
  ).toHaveCount(0);
});
