import { test, expect, type Page } from "@playwright/test";

const seats = {
  6: ["Lojack", "Hijack", "Cutoff", "Button", "Small blind", "Big blind"],
  9: [
    "Under the gun",
    "Under the gun + 1",
    "Under the gun + 2",
    "Lojack",
    "Hijack",
    "Cutoff",
    "Button",
    "Small blind",
    "Big blind",
  ],
};
const feedback = (page: Page) =>
  page.getByRole("region", { name: "Walkthrough feedback" });
async function seeded(page: Page, seed: number) {
  // Constant entropy also exercises bounded collision handling on New/Next.
  await page.addInitScript((value) => {
    const original = crypto.getRandomValues.bind(crypto);
    Object.defineProperty(crypto, "getRandomValues", {
      value: (array: ArrayBufferView<ArrayBuffer>) => {
        if (array instanceof Uint32Array) {
          array.fill(value);
          return array;
        }
        return original(array);
      },
    });
  }, seed);
  await page.setViewportSize({
    width: test.info().project.name === "mobile" ? 320 : 1280,
    height: 850,
  });
  await page.goto("/");
  await expect(
    page.getByRole("heading", { name: "Watch the action reach you" }),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: "New randomized walkthrough" }),
  ).toBeEnabled();
}
async function answer(page: Page, label: string) {
  await page.getByLabel(label, { exact: true }).check();
  await page.getByRole("button", { name: "Reveal why" }).click();
  await expect(feedback(page)).toBeVisible();
  const primary = await feedback(page).locator(":scope > p").allTextContents();
  expect(primary.join(" ").trim().split(/\s+/).length).toBeLessThanOrEqual(65);
}
async function continueStep(page: Page) {
  await page.getByRole("button", { name: "Continue walkthrough" }).click();
  await expect(page.locator(".page-heading h1")).toBeFocused();
}
async function foldsToButton(page: Page, count: 6 | 9) {
  for (const position of seats[count].slice(0, -3)) {
    await expect(page.locator(".acting-seat")).toContainText(position);
    await page
      .getByRole("button", { name: `Watch ${position} fold`, exact: true })
      .click();
  }
  await expect(page.locator(".folded-seat")).toHaveCount(count - 3);
  await expect(page.locator(".hero-seat")).toContainText("Your turn");
  await answer(page, "Unopened");
  await expect(feedback(page)).toContainText(
    `Keep using the ${count}-player guide even after others fold`,
  );
  await continueStep(page);
}
async function cards(page: Page) {
  return page
    .locator(".hero-seat [role=img]")
    .evaluateAll((items) =>
      items.map((item) => item.getAttribute("aria-label")),
    );
}
async function layoutBounds(page: Page, count: 6 | 9) {
  const table = page.getByLabel(
    `${count}-player table and public action order`,
    { exact: true },
  );
  await expect(table.locator(".learning-seat")).toHaveCount(count);
  const boxes = await table.locator(".learning-seat").evaluateAll((items) =>
    items.map((item) => {
      const box = item.getBoundingClientRect();
      return { x: box.x, y: box.y, right: box.right, bottom: box.bottom };
    }),
  );
  const scene = (await table.boundingBox())!;
  for (let i = 0; i < boxes.length; i++) {
    const a = boxes[i];
    expect(a.x).toBeGreaterThanOrEqual(scene.x);
    expect(a.right).toBeLessThanOrEqual(scene.x + scene.width);
    for (const b of boxes.slice(i + 1))
      expect(
        a.right <= b.x || b.right <= a.x || a.bottom <= b.y || b.bottom <= a.y,
        "Seats do not overlap",
      ).toBe(true);
  }
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
}

for (const count of [9, 6] as const) {
  test(`${count} seats keep paired hand contexts, honest sizing, public order and arithmetic`, async ({
    page,
  }) => {
    await seeded(page, 0);
    await expect(page.getByLabel("Walkthrough table size")).toHaveValue("9");
    if (count === 6)
      await page.getByLabel("Walkthrough table size").selectOption("6");
    await expect(page.locator(".learning-seat strong")).toHaveText(
      seats[count].map(
        (position, i) =>
          `${i + 1}. ${position}${position === "Button" ? " · D" : ""}`,
      ),
    );
    await layoutBounds(page, count);
    const openingCards = await cards(page);
    await expect(page.locator(".walkthrough-prompt h2")).toContainText("AA:");
    await foldsToButton(page, count);
    await expect(page.locator(".walkthrough-prompt h2")).toContainText(
      "AA on the button",
    );
    await expect(
      page.locator(".walkthrough-prompt > p").last(),
    ).not.toContainText(/includes|inside|outside|suited king/);
    const hint = page.locator(".walkthrough-prompt details");
    await expect(hint).not.toHaveAttribute("open", "");
    await expect(hint.locator("p")).not.toBeVisible();
    await expect(
      page.getByRole("button", { name: "Reveal why" }),
    ).toBeDisabled();
    await page.getByLabel("Raise to 25", { exact: true }).focus();
    await page.keyboard.press("Space");
    await page.getByRole("button", { name: "Reveal why" }).focus();
    await page.keyboard.press("Enter");
    await expect(feedback(page)).toContainText("AA is inside");
    await expect(feedback(page).locator(":scope > p")).toContainText([
      "The button acts last after the flop",
      "25 chips total (2.5 BB) for every hand in the opening range",
    ]);
    const sizeDetails = feedback(page).locator("details");
    await expect(sizeDetails).not.toHaveAttribute("open", "");
    await expect(sizeDetails.locator("p").first()).not.toBeVisible();
    await sizeDetails.locator("summary").focus();
    await page.keyboard.press("Enter");
    await expect(sizeDetails.locator("p").first()).toBeVisible();
    await expect(sizeDetails).toContainText(
      "Hand strength does not set this practice size",
    );
    await expect(sizeDetails).toContainText(
      "Position, stacks, rake and opponents",
    );
    await expect(sizeDetails).toContainText("does not prove an optimal size");
    await expect(sizeDetails).toContainText("25 total, not an extra 25");
    const source = page.locator("details").filter({
      has: page.getByText("Guide source and limits", { exact: true }),
    });
    await expect(source.locator("a")).not.toBeVisible();
    await source.locator("summary").click();
    await expect(source.locator("a")).toHaveAttribute("href", /^https:/);
    await expect(source.locator("a")).toBeVisible();
    await expect(source).toContainText("not a solver or a guarantee");
    await source.locator("summary").click();
    await continueStep(page);
    const comparison = count === 9 ? "K7s" : "K2s",
      early = count === 9 ? "Under the gun + 1" : "Lojack";
    await expect(page.locator(".walkthrough-prompt h2")).toContainText(
      `${comparison} in ${early}`,
    );
    const contrastCards = await cards(page);
    // These specific weak suited kings fold in the earlier charts but open on BTN.
    await answer(page, "Raise to 25");
    await expect(feedback(page)).toContainText("Compare with the guide");
    await expect(feedback(page)).toContainText(
      `outside the guide's ${early} opening range: fold`,
    );
    await expect(feedback(page)).toContainText(
      "early position opens fewer hands",
    );
    await page.getByRole("button", { name: "Try this decision again" }).click();
    await expect(feedback(page)).toHaveCount(0);
    await expect(
      page.getByRole("button", { name: "Reveal why" }),
    ).toBeDisabled();
    await page
      .getByText("Show the guide for this hand", { exact: true })
      .click();
    await expect(page.locator(".walkthrough-prompt details p")).toContainText(
      `${comparison}: fold`,
    );
    await answer(page, "Fold");
    await continueStep(page);
    expect(await cards(page)).toEqual(contrastCards);
    await expect(
      page.locator(".walkthrough-prompt details"),
    ).not.toHaveAttribute("open", "");
    await answer(page, "Raise to 25");
    await expect(feedback(page)).toContainText("hand did not become stronger");
    await continueStep(page);
    await expect(page.locator(".learning-pot")).toContainText("Pot: 45 chips");
    await expect(page.locator(".raised-seat")).toContainText("Cutoff");
    await expect(page.locator(".raised-seat")).toContainText("Raised to 30");
    await expect(page.locator(".walkthrough-prompt h2")).toContainText("AQs:");
    const raisedCards = await cards(page);
    await answer(page, "30 chips");
    await expect(feedback(page)).toContainText("Call · pay 30");
    await expect(feedback(page)).toContainText(
      "cannot choose your response to a raise",
    );
    await continueStep(page);
    expect(await cards(page)).toEqual(raisedCards);
    await expect(page.locator(".learning-pot")).toContainText("Pot: 45 chips");
    await answer(page, "Raise to 50");
    await expect(feedback(page)).toContainText("a 20-chip increase");
    await expect(feedback(page)).toContainText("not a strategy recommendation");
    await page
      .getByRole("button", { name: "Try a fresh preflop hand", exact: true })
      .click();
    const transfer = await page.locator(".walkthrough-prompt h2").textContent();
    // Reveal with any choice; changing hand must clear feedback and selection.
    await answer(page, "Fold");
    await page.getByRole("button", { name: "Next preflop hand" }).click();
    await expect(feedback(page)).toHaveCount(0);
    await expect(
      page.getByRole("button", { name: "Reveal why" }),
    ).toBeDisabled();
    expect(await page.locator(".walkthrough-prompt h2").textContent()).not.toBe(
      transfer,
    );
    const nextTransfer = await page
      .locator(".walkthrough-prompt h2")
      .textContent();
    await page.getByRole("button", { name: "Previous step" }).click();
    expect(await cards(page)).toEqual(raisedCards);
    await page.locator(".walkthrough-progress button").nth(6).click();
    await expect(page.locator(".walkthrough-prompt h2")).toHaveText(
      nextTransfer!,
    );
    await page.getByRole("button", { name: "Replay walkthrough" }).click();
    expect(await cards(page)).toEqual(openingCards);
    await expect(
      page.getByRole("button", {
        name: `Watch ${seats[count][0]} fold`,
        exact: true,
      }),
    ).toBeVisible();
    await page.locator(".walkthrough-progress button").nth(2).click();
    expect(await cards(page)).toEqual(contrastCards);
    await page.locator(".walkthrough-progress button").nth(4).click();
    expect(await cards(page)).toEqual(raisedCards);
    await layoutBounds(page, count);
  });
}

test("an opening fold is available without automatic answer disclosure", async ({
  page,
}) => {
  await seeded(page, 2);
  await foldsToButton(page, 9);
  await expect(page.locator(".walkthrough-prompt h2")).toContainText(
    "72s on the button",
  );
  await expect(page.locator(".walkthrough-prompt details p")).not.toBeVisible();
  await answer(page, "Fold");
  await expect(feedback(page)).toContainText("That follows the guide");
  await expect(feedback(page)).toContainText("72s is outside");
  await expect(feedback(page)).toContainText(
    "25 chips total (2.5 BB) for every hand in the opening range",
  );
});

test("new walkthrough and table changes reset answers, folds and unlocked stages", async ({
  page,
}) => {
  await seeded(page, 0);
  const original = await page.locator(".walkthrough-prompt h2").textContent();
  await foldsToButton(page, 9);
  await answer(page, "Raise to 25");
  await page
    .getByRole("button", { name: "New randomized walkthrough" })
    .focus();
  await page.keyboard.press("Enter");
  await expect(page.locator(".page-heading h1")).toBeFocused();
  await expect(feedback(page)).toHaveCount(0);
  await expect(
    page.locator(".walkthrough-progress button").nth(1),
  ).toBeDisabled();
  await expect(page.locator(".folded-seat")).toHaveCount(0);
  await expect(
    page.getByRole("button", { name: "Watch Under the gun fold", exact: true }),
  ).toBeVisible();
  expect(await page.locator(".walkthrough-prompt h2").textContent()).not.toBe(
    original,
  );
  await expect(page.locator(".walkthrough-prompt h2")).toContainText("A5s:");
  await foldsToButton(page, 9);
  await expect(page.getByRole("button", { name: "Reveal why" })).toBeDisabled();
  await answer(page, "Raise to 25");
  await continueStep(page);
  await expect(page.locator(".walkthrough-prompt h2")).toContainText(
    "43s in Hijack",
  );
  const newContrastCards = await cards(page);
  await answer(page, "Fold");
  await continueStep(page);
  expect(await cards(page)).toEqual(newContrastCards);
  await answer(page, "Raise to 25");
  await continueStep(page);
  await expect(page.locator(".walkthrough-prompt h2")).toContainText("JJ:");
  await expect(page.locator(".raised-seat")).toContainText("Raised to 25");
  const newRaisedCards = await cards(page);
  await answer(page, "25 chips");
  await continueStep(page);
  expect(await cards(page)).toEqual(newRaisedCards);
  await page.getByRole("button", { name: "Replay walkthrough" }).click();
  await expect(page.locator(".walkthrough-prompt h2")).toContainText("A5s:");
  await page.locator(".walkthrough-progress button").nth(4).click();
  expect(await cards(page)).toEqual(newRaisedCards);
  await answer(page, "25 chips");
  await page.getByLabel("Walkthrough table size").selectOption("6");
  await expect(feedback(page)).toHaveCount(0);
  await expect(page.locator(".folded-seat")).toHaveCount(0);
  await expect(page.locator(".learning-seat")).toHaveCount(6);
  await expect(
    page.getByRole("button", { name: "Watch Lojack fold", exact: true }),
  ).toBeVisible();
  await expect(
    page.locator(".walkthrough-progress button").nth(1),
  ).toBeDisabled();
  await layoutBounds(page, 6);
});

for (const fixture of [
  { seed: 6, raise: 20, pot: 35, minimum: 30 },
  { seed: 1, raise: 25, pot: 40, minimum: 40 },
  { seed: 17, raise: 40, pot: 55, minimum: 70 },
]) {
  test(`public raise to ${fixture.raise} gives independent call and minimum-raise arithmetic`, async ({
    page,
  }) => {
    await seeded(page, fixture.seed);
    await foldsToButton(page, 9);
    for (let step = 1; step <= 3; step++) {
      await answer(page, "Fold");
      await continueStep(page);
    }
    await expect(page.locator(".learning-pot")).toContainText(
      `Pot: ${fixture.pot} chips`,
    );
    await expect(page.locator(".raised-seat")).toContainText(
      `Raised to ${fixture.raise}`,
    );
    await answer(page, `${fixture.raise} chips`);
    await expect(feedback(page)).toContainText("That matches the situation");
    await expect(feedback(page)).toContainText(`costs ${fixture.raise} chips`);
    await continueStep(page);
    const options = await page
      .locator(".learning-choices label")
      .allTextContents();
    expect(new Set(options).size).toBe(3);
    await answer(page, `Raise to ${fixture.minimum}`);
    await expect(feedback(page)).toContainText("That matches the situation");
    await expect(feedback(page)).toContainText(
      `making your total ${fixture.minimum}`,
    );
  });
}

test("guide loading, errors and retry retain a usable current walkthrough", async ({
  page,
}) => {
  let release!: () => void;
  const gate = new Promise<void>((resolve) => {
    release = resolve;
  });
  let attempts = 0;
  await page.route("**/api/preflop-charts", async (route) => {
    attempts++;
    if (attempts === 1) {
      await gate;
      await route.fulfill({ status: 503, json: { error: "Unavailable" } });
    } else await route.continue();
  });
  await page.goto("/");
  await expect(page.getByRole("status")).toHaveText(
    "Loading the opening guide…",
  );
  await expect(
    page.getByRole("button", { name: "New randomized walkthrough" }),
  ).toBeDisabled();
  release();
  await expect(page.getByRole("alert")).toContainText(
    "Opening guide could not load",
  );
  await page.getByRole("button", { name: "Retry loading" }).click();
  await expect(
    page.getByRole("button", { name: "Watch Under the gun fold", exact: true }),
  ).toBeVisible();
  await expect(page.getByRole("alert")).toHaveCount(0);
  await expect(
    page.getByRole("button", { name: "New randomized walkthrough" }),
  ).toBeEnabled();
});
