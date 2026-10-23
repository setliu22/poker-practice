import { test, expect } from "@playwright/test";
test("layered assistant is optional, keyboard usable, read-only and fits mobile", async ({
  page,
  request,
}) => {
  await page.setViewportSize({
    width: test.info().project.name === "mobile" ? 320 : 1280,
    height: 900,
  });
  await page.goto("/");
  await page.getByRole("button", { name: "Play", exact: true }).click();
  await page.getByRole("button", { name: "Start table", exact: true }).click();
  await page
    .getByRole("button", { name: "Decision assistant", exact: true })
    .click();
  await expect(
    page.getByRole("heading", { name: "Before you act" }),
  ).toBeVisible();
  const id = await page.evaluate(() =>
    localStorage.getItem("poker-practice-table"),
  );
  const before = await (await request.get(`/api/tables/${id}`)).json();
  const reasoning = page.getByRole("region", {
    name: "How to make this decision",
  });
  await expect(reasoning).toBeVisible();
  await page
    .getByText("Explore the reasoning for other actions", { exact: true })
    .click();
  await page.getByLabel("Think through an action").selectOption("fold");
  await expect(
    reasoning.getByText("What would justify folding?", { exact: true }),
  ).toBeVisible();
  await page.getByLabel("Think through an action").selectOption("raise");
  await expect(
    reasoning.getByText("What would justify raising?", { exact: true }),
  ).toBeVisible();
  await reasoning
    .getByText("Which numbers should I use?", { exact: true })
    .click();
  await expect(reasoning).toContainText(
    "It does not include winning by making opponents fold",
  );
  const layer = page.getByText("2 · How might opponents respond?", {
    exact: true,
  });
  await layer.focus();
  await page.keyboard.press("Enter");
  const button = page.getByRole("button", {
    name: "Estimate responses",
    exact: true,
  });
  await expect(button).toBeVisible();
  await button.click();
  await expect(page.getByText(/800/).first()).toBeVisible({ timeout: 30000 });
  await page
    .getByText("Assumptions and observed behavior", { exact: true })
    .first()
    .click();
  await expect(page.getByText(/Observed:/).first()).toBeVisible();
  const after = await (await request.get(`/api/tables/${id}`)).json();
  expect(after).toEqual(before);
  const advanced = page.getByText("3 · Showdown equity and modeled EV", {
    exact: true,
  });
  await advanced.click();
  await page
    .getByRole("button", { name: "Compare modeled actions", exact: true })
    .click();
  await expect(
    page.getByText("Conditional EV from this decision", { exact: true }),
  ).toBeVisible({ timeout: 60000 });
  expect(await (await request.get(`/api/tables/${id}`)).json()).toEqual(before);
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
  await page.screenshot({
    path: test.info().outputPath("assistant.png"),
    fullPage: true,
  });
});
