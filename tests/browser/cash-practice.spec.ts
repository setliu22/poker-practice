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
  return view;
}
async function answer(page: Page, q: CashQuestion) {
  const region = page.getByRole("region", { name: "Current cash decision" });
  await region
    .getByRole("group", { name: "Your action under the supplied assumptions" })
    .getByRole("radio", { name: q.options[0].label, exact: true })
    .check();
  await region
    .getByRole("group", { name: "Why?", exact: true })
    .getByRole("radio", { name: q.reasons[0].label, exact: true })
    .check();
  await region.getByRole("spinbutton", { name: q.estimatePrompt }).fill("0");
  await region.getByRole("radio", { name: "Very sure", exact: true }).check();
  await region.getByRole("button", { name: "Commit my answer" }).click();
  await expect(
    region.getByRole("region", { name: "Cash decision feedback" }),
  ).toBeVisible();
}

test.beforeEach(async ({ request, page }) => {
  await request.delete("/api/progress");
  if (test.info().project.name === "mobile")
    await page.setViewportSize({ width: 320, height: 800 });
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
  await expect(scene).toContainText("9-seat cash table");
  await expect(scene).toContainText("2 players still in this pot");
  await expect(
    scene.getByRole("region", { name: "Cash decision feedback" }),
  ).toHaveCount(0);
  await expect(
    scene.getByRole("button", { name: "Try the changed assumption" }),
  ).toHaveCount(0);
  await expect(
    scene.getByRole("button", { name: "Commit my answer" }),
  ).toBeDisabled();
  await expect(
    scene.getByText("Expected value under the supplied ranges and responses", {
      exact: true,
    }),
  ).toHaveCount(0);
  await scene.getByText("Public action history", { exact: true }).focus();
  await page.keyboard.press("Space");
  await expect(scene.locator(".cash-history")).toBeVisible();
  // Action alone must never submit a score; all three reasoning fields are required.
  await scene
    .getByRole("group", { name: "Your action under the supplied assumptions" })
    .getByRole("radio")
    .first()
    .check();
  await expect(
    scene.getByRole("button", { name: "Commit my answer" }),
  ).toBeDisabled();
  await answer(page, view.initial);
  await expect(
    scene.getByRole("region", { name: "Cash decision feedback" }),
  ).toContainText("Independent first answer");
  await expect(
    scene.getByRole("button", { name: "Commit my answer" }),
  ).toHaveCount(0);
  const saved = (await (
    await request.get(`/api/cash-practice/drills/${view.id}`)
  ).json()) as CashDrillView;
  expect(saved.transfer).not.toBeNull();
  expect(saved.answers.initial?.estimatePercent).toBe(0);
  await page.reload();
  await expect(
    page.getByRole("region", { name: "Cash decision feedback" }),
  ).toContainText("Independent first answer");
  await expect(
    page.getByRole("button", { name: "Commit my answer" }),
  ).toHaveCount(0);
  await expect(
    page.getByRole("region", { name: "Online cash progress" }),
  ).toContainText("/1 complete answers correct");
  const again = await (
    await request.get(`/api/cash-practice/drills/${view.id}`)
  ).json();
  expect(again.answers).toEqual(saved.answers);
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
  await page
    .getByRole("button", { name: "Use a reasoning hint", exact: true })
    .click();
  await expect(
    page.getByRole("region", { name: "Current cash decision" }),
  ).toContainText("This answer will be recorded as assisted");
  await answer(page, initial.initial);
  await expect(
    page.getByRole("region", { name: "Cash decision feedback" }),
  ).toContainText("Hinted first answer");
  const saved = (await (
    await request.get(`/api/cash-practice/drills/${initial.id}`)
  ).json()) as CashDrillView;
  await page
    .getByRole("button", { name: "Try the changed assumption" })
    .click();
  await expect(
    page.getByRole("region", { name: "Cash decision feedback" }),
  ).toHaveCount(0);
  await expect(
    page.getByRole("region", { name: "Current cash decision" }),
  ).toContainText("Guided changed-assumption follow-up");
  await expect(
    page.getByRole("button", { name: "Commit my answer" }),
  ).toBeDisabled();
  await page.reload();
  await expect(
    page.getByRole("region", { name: "Current cash decision" }),
  ).toContainText("Guided changed-assumption follow-up");
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
  await expect(summary).toContainText("For your next real session");
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
  await page.getByRole("combobox", { name: "Table seats" }).selectOption("2");
  await expect(
    page.getByRole("combobox", { name: "Practice focus" }),
  ).toHaveValue("auto");
  await expect(
    page
      .getByRole("combobox", { name: "Practice focus" })
      .locator('option[value="multiway-call"]'),
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
  await page
    .getByRole("button", { name: "Use a reasoning hint", exact: true })
    .click();
  await expect(page.getByRole("alert")).toContainText(
    "Hint temporarily unavailable",
  );
  await page.getByRole("button", { name: "Try again", exact: true }).click();
  await expect(
    page.getByRole("region", { name: "Current cash decision" }),
  ).toContainText("This answer will be recorded as assisted");
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
    .getByRole("group", { name: "Your action under the supplied assumptions" })
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
  await scene.getByRole("button", { name: "Commit my answer" }).click();
  await expect(page.getByRole("alert")).toContainText("Answer not saved yet");
  await expect(scene.getByRole("spinbutton")).toHaveValue("17");
  await page.getByRole("button", { name: "Try again", exact: true }).click();
  await expect(
    page.getByRole("region", { name: "Cash decision feedback" }),
  ).toContainText("Your estimate: 17%");
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
