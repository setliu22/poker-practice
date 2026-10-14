import { test, expect } from "@playwright/test";
test("restart hand keeps the same game and restores cards; assistant shortcut is visible", async ({
  page,
  request,
}) => {
  await page.goto("/");
  await page.getByRole("button", { name: "Bot table", exact: true }).click();
  await page.getByRole("button", { name: "Start table", exact: true }).click();
  await expect(
    page.getByRole("heading", { name: "Your turn", exact: true }),
  ).toBeVisible();
  const id = await page.evaluate(() =>
    localStorage.getItem("poker-practice-table"),
  );
  const initialResponse = await request.get(`/api/tables/${id}`);
  expect(initialResponse.status()).toBe(200);
  const initial = await initialResponse.json();
  await page
    .getByRole("button", { name: "Decision assistant", exact: true })
    .click();
  await expect(
    page.getByRole("heading", { name: "Before you act" }),
  ).toBeInViewport();
  await page
    .getByRole("dialog", { name: "Decision assistant", exact: true })
    .getByRole("button", { name: "Close", exact: true })
    .click();
  await page.getByRole("button", { name: "Fold", exact: true }).click();
  await expect(
    page.getByRole("heading", { name: "Hand complete", exact: true }),
  ).toBeVisible();
  page.once("dialog", (d) => d.dismiss());
  await page.getByRole("button", { name: "Restart hand", exact: true }).click();
  await expect(
    page.getByRole("heading", { name: "Hand complete", exact: true }),
  ).toBeVisible();
  page.once("dialog", (d) => d.accept());
  await page.getByRole("button", { name: "Restart hand", exact: true }).click();
  await expect(
    page.getByRole("heading", { name: "Your turn", exact: true }),
  ).toBeVisible();
  const reset = await (await request.get(`/api/tables/${id}`)).json();
  expect(reset.id).toBe(initial.id);
  expect(reset.handNumber).toBe(initial.handNumber);
  expect(reset.players[0].hole).toEqual(initial.players[0].hole);
  expect(reset.history).toEqual(initial.history);
});
