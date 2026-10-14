import { test, expect } from "@playwright/test";
test("lesson teaches reasoning, changes assumptions, saves progress and fits mobile", async ({
  page,
  request,
}) => {
  if (test.info().project.name === "mobile")
    await page.setViewportSize({ width: 320, height: 800 });
  await request.delete("/api/progress");
  await page.goto("/");
  await page
    .getByText("More practice and earlier lessons", { exact: true })
    .click();
  await page.getByRole("button", { name: "Open earlier exercises" }).click();
  await expect(
    page.getByRole("heading", { name: "Should I bet or check?" }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Start lesson" }).click();
  await expect(
    page.getByRole("region", { name: "Lesson feedback" }),
  ).toHaveCount(0);
  await expect(
    page.getByRole("button", { name: "Check my reasoning" }),
  ).toBeDisabled();
  await page.screenshot({
    path: test.info().outputPath("learning-question.png"),
    fullPage: true,
  });
  const choice = page.getByRole("radio", { name: "Bet 40", exact: true });
  await choice.focus();
  await page.keyboard.press("Space");
  await page.getByRole("radio", { name: /Get calls from weaker/ }).check();
  await page.getByRole("button", { name: "Check my reasoning" }).click();
  const feedback = page.getByRole("region", { name: "Lesson feedback" });
  await expect(feedback).toContainText("80.0 chips versus 66.7");
  await page.getByRole("button", { name: "Next situation" }).click();
  await expect(
    page.getByRole("heading", { name: "Same cards, different calls" }),
  ).toBeVisible();
  await page.getByRole("radio", { name: "Check", exact: true }).check();
  await page.getByRole("radio", { name: /Get calls from weaker/ }).check();
  await page.getByRole("button", { name: "Check my reasoning" }).click();
  await expect(feedback).toContainText("Reason: Needs revision");
  const actions = ["bet", "check", "bet", "check", "check", "bet"];
  for (const action of actions) {
    await page.getByRole("button", { name: "Next situation" }).click();
    await page
      .getByRole("radio", {
        name: action === "check" ? "Check" : /^Bet \d+$/,
        exact: action === "check",
      })
      .check();
    await page
      .getByRole("radio", {
        name:
          action === "check"
            ? /Make weaker hands fold/
            : /Get calls from weaker/,
      })
      .check();
    await page.getByRole("button", { name: "Check my reasoning" }).click();
    await expect(feedback).toContainText("Decision: Correct");
  }
  await page.getByRole("button", { name: "Review lesson" }).click();
  await expect(
    page.getByText("This session: 8/8 decisions and 7/8 reasons correct."),
  ).toBeVisible();
  await page.screenshot({
    path: test.info().outputPath("learning-review.png"),
    fullPage: true,
  });
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
  await page.getByRole("button", { name: "Revisit missed situations" }).click();
  await expect(
    page.getByRole("heading", { name: "Same cards, different calls" }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Progress", exact: true }).click();
  await expect(
    page.getByText("Decisions correct: 8/8 · Reasons correct: 7/8"),
  ).toBeVisible();
  await page.reload();
  await expect(
    page.getByRole("heading", { name: "Saved learning progress" }),
  ).toBeVisible();
});
