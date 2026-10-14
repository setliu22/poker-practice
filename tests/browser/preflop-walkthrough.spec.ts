import { test, expect } from "@playwright/test";
test("walks through public action, position contrast, raised-pot rules and fresh transfer", async ({
  page,
}) => {
  await page.goto("/");
  await expect(
    page.getByRole("heading", { name: "Watch the action reach you" }),
  ).toBeVisible();
  for (const position of ["Lojack", "Hijack", "Cutoff"])
    await page.getByRole("button", { name: `Watch ${position} fold` }).click();
  await page.getByLabel("Unopened", { exact: true }).check();
  await page.getByRole("button", { name: "Reveal why" }).click();
  await expect(
    page.getByRole("region", { name: "Walkthrough feedback" }),
  ).toContainText("original table still has six seats");
  await page.getByRole("button", { name: "Continue walkthrough" }).click();
  await page.getByLabel("Raise to 25", { exact: true }).check();
  await page.getByRole("button", { name: "Reveal why" }).click();
  await page.getByRole("button", { name: "Continue walkthrough" }).click();
  await page.getByLabel("Raise to 25", { exact: true }).check();
  await page.getByRole("button", { name: "Reveal why" }).click();
  await expect(
    page.getByRole("region", { name: "Walkthrough feedback" }),
  ).toContainText("outside this baseline");
  await page.getByRole("button", { name: "Try this decision again" }).click();
  await page.getByLabel("Fold", { exact: true }).check();
  await page.getByRole("button", { name: "Reveal why" }).click();
  await page.getByRole("button", { name: "Continue walkthrough" }).click();
  await page.getByRole("button", { name: "Previous step" }).click();
  await expect(
    page.getByRole("heading", {
      name: "Try a different hand in early position",
    }),
  ).toBeVisible();
  await page.getByLabel("Fold", { exact: true }).check();
  await page.getByRole("button", { name: "Reveal why" }).click();
  await page.getByRole("button", { name: "Continue walkthrough" }).click();
  await page.getByLabel("Raise to 25", { exact: true }).check();
  await page.getByRole("button", { name: "Reveal why" }).click();
  await page.getByRole("button", { name: "Continue walkthrough" }).click();
  await page.getByLabel("25 chips", { exact: true }).check();
  await page.getByRole("button", { name: "Reveal why" }).click();
  await page.getByRole("button", { name: "Continue walkthrough" }).click();
  await page.getByLabel("Raise to 40", { exact: true }).check();
  await page.getByRole("button", { name: "Reveal why" }).click();
  await expect(
    page.getByRole("region", { name: "Walkthrough feedback" }),
  ).toContainText("not inventing a strategy recommendation");
  await page.getByRole("button", { name: "Try a fresh preflop hand" }).click();
  await expect(
    page.getByRole("heading", { name: "Try a fresh preflop hand" }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Replay walkthrough" }).click();
  await expect(
    page.getByRole("button", { name: "Watch Lojack fold" }),
  ).toBeVisible();
});
