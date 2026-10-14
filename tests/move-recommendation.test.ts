import { it, expect } from "vitest";
import { recommendMove } from "../packages/poker/src/decision-assistant";
const value = (key: string, chips: number) => ({
  key,
  label: key === "raise" ? "Raise to 224" : key,
  chips,
  margin: 0,
  exact: true,
  samples: 0,
  allFold: 0,
  outcomes: [],
});
it("highlights the highest modeled return and identifies equal choices", () => {
  const best = recommendMove([
    value("fold", 0),
    value("call", -33.8),
    value("raise", 72.7),
  ]);
  expect(best).toMatchObject({
    action: "raise",
    amount: 224,
    status: "distinct",
  });
  expect(best.explanation).toContain("not guaranteed optimal");
  const tied = recommendMove([value("fold", 0), value("check", 0)]);
  expect(tied.status).toBe("close");
  expect(tied.alternatives).toContain("check");
});
it("treats sampling uncertainty as a close comparison rather than optimal play", () => {
  const a = {
    ...value("call", 10),
    exact: false,
    samples: 200,
    outcomes: Array.from({ length: 200 }, (_, i) => (i % 2 ? 100 : -80)),
  };
  const b = {
    ...value("raise", 12),
    exact: false,
    samples: 200,
    outcomes: Array.from({ length: 200 }, (_, i) => (i % 2 ? -80 : 104)),
  };
  expect(recommendMove([a, b, value("fold", 0)]).status).toBe("close");
});

it("winner selection adjusts uncertainty for every action pair", async () => {
  const { pairedActionComparisons } =
    await import("../packages/poker/src/table-review");
  const values = ["fold", "call", "raise", "raise-50"].map((key, j) => ({
    ...value(key, j * 2),
    exact: false,
    samples: 200,
    outcomes: Array.from(
      { length: 200 },
      (_, i) => j * 2 + (j === 0 ? 0 : i % 2 ? 50 : -50),
    ),
  }));
  const fixed = pairedActionComparisons(values, "raise-50");
  const selected = pairedActionComparisons(values, "raise-50", true);
  expect(selected.find((c) => c.key === "fold")!.margin).toBeGreaterThan(
    fixed.find((c) => c.key === "fold")!.margin,
  );
});
