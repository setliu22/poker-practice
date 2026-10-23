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
    .getByRole("navigation", { name: "Main navigation" })
    .getByRole("button", { name: "Reference", exact: true })
    .click();
  await page
    .getByRole("button", { name: "Open legacy lessons", exact: true })
    .click();
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
  await expect(
    page.getByText("Each combination is equally likely.", { exact: false }),
  ).toBeVisible();
  await expect(page.locator(".learning-opponents")).toContainText("Calls 40");
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
  await expect(feedback.locator(":scope > p")).toContainText([
    "Decision: Correct",
    "80.0 chips versus 66.7",
    "weaker calling hands",
  ]);
  const primary = await feedback.locator(":scope > p").allTextContents();
  expect(primary.join(" ").trim().split(/\s+/).length).toBeLessThanOrEqual(60);
  const calculation = feedback.locator("details");
  await expect(calculation).not.toHaveAttribute("open", "");
  await expect(calculation.locator("table")).not.toBeVisible();
  await calculation.locator("summary").focus();
  await page.keyboard.press("Enter");
  await expect(calculation.locator("table")).toBeVisible();
  await expect(calculation).toContainText("1/3");
  await calculation.locator("summary").click();
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
  ).not.toBeVisible();
  await page.getByText("Detailed practice stats", { exact: true }).focus();
  await page.keyboard.press("Enter");
  await expect(
    page.getByText("Decisions correct: 8/8 · Reasons correct: 7/8"),
  ).toBeVisible();
  await page.reload();
  await page
    .getByRole("navigation", { name: "Main navigation" })
    .getByRole("button", { name: "Reference", exact: true })
    .click();
  await page
    .getByRole("button", { name: "Open legacy lessons", exact: true })
    .click();
  await expect(
    page.getByRole("heading", { name: "Saved learning progress" }),
  ).toBeVisible();
  await expect(
    page.getByText("Decisions: 8/8 · Reasons: 7/8", { exact: true }),
  ).toBeVisible();
});
