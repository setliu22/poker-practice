import { describe, expect, it } from "vitest";
import request from "supertest";
import solver from "pokersolver";
import { balancedShowdown } from "../packages/poker/src/balanced-deals";
import { deal, validateCards } from "../packages/poker/src/index";
import { createApp } from "../apps/api/src/app";
import { openDatabase } from "../apps/api/src/database";
import { generate } from "../apps/api/src/exercises";
import { exerciseSchema } from "../packages/shared/src/index";

describe("balanced showdown practice deals", () => {
  it.each([
    [0, 0, "High card"],
    [1, 1, "One pair"],
    [2, 2, "Two pair"],
    [3, 3, "Three of a kind"],
    [4, 4, "Straight"],
    [5, 5, "Flush"],
    [6, 6, "Full house"],
    [7, 7, "Four of a kind"],
    [8, 8, "Straight flush"],
  ] as const)(
    "seed %i produces winning category %i (%s), verified independently",
    (seed, category, _name) => {
      const result = balancedShowdown(seed);
      const hero = solver.Hand.solve([...result.hero, ...result.board]) as {
        rank: number;
      };
      const villain = solver.Hand.solve([
        ...result.villain,
        ...result.board,
      ]) as { rank: number };
      expect(Math.max(hero.rank, villain.rank) - 1).toBe(category);
      validateCards([...result.hero, ...result.villain, ...result.board], 9, 9);
      expect(result.hero).toHaveLength(2);
      expect(result.villain).toHaveLength(2);
      expect(result.board).toHaveLength(5);
      expect(balancedShowdown(seed)).toEqual(result);
    },
  );

  it("creates fresh legal deals across every category rather than repeating a fixed exercise bank", () => {
    const seen = new Set<string>();
    const counts = Array(9).fill(0);
    const winners = new Set<number>();
    for (let seed = 0; seed < 180; seed++) {
      const result = balancedShowdown(seed);
      validateCards([...result.hero, ...result.villain, ...result.board], 9, 9);
      const hero = solver.Hand.solve([...result.hero, ...result.board]) as {
        rank: number;
      };
      const villain = solver.Hand.solve([
        ...result.villain,
        ...result.board,
      ]) as { rank: number };
      const category = Math.max(hero.rank, villain.rank) - 1;
      expect(category).toBe(seed % 9);
      counts[category]++;
      const winningHands = solver.Hand.winners([hero, villain]);
      winners.add(
        winningHands.length === 2 ? 2 : winningHands[0] === hero ? 0 : 1,
      );
      seen.add(JSON.stringify(result));
    }
    expect(counts).toEqual(Array(9).fill(20));
    expect(seen.size).toBe(180);
    expect(winners.has(0)).toBe(true);
    expect(winners.has(1)).toBe(true);
  });

  it("leaves unfiltered random showdown generation unchanged", () => {
    for (const seed of [0, 5, 44, 4294967295]) {
      const exercise = generate("who-wins", seed, "id").exercise;
      const cards = deal(seed, 9);
      expect(exercise.hero).toEqual(cards.slice(0, 2));
      expect(exercise.villain).toEqual(cards.slice(2, 4));
      expect(exercise.board).toEqual(cards.slice(4));
      expect(exercise.sourceId).toBe(`deal-${seed}`);
      expect(exercise.dealStyle).toBe("random");
    }
    for (const seed of [-1, 4294967296, 0.5, NaN])
      expect(() => balancedShowdown(seed)).toThrow("seed");
  });

  it("validates the exercise and exposes sampling style without exposing the selected category", () => {
    const exercise = generate(
      "who-wins",
      7,
      "id",
      "river",
      undefined,
      "balanced",
    ).exercise;
    expect(exerciseSchema.safeParse(exercise).success).toBe(true);
    expect(exercise.dealStyle).toBe("balanced");
    expect(exercise.sourceId).toBe("balanced-deal-7");
    expect(exercise.tags).toEqual(["Range comparison"]);
    expect(exercise).not.toHaveProperty("category");
    expect(exercise).not.toHaveProperty("targetCategory");
    expect(exercise).not.toHaveProperty("answer");
    expect(exercise.context![0]).toContain("not the natural frequencies");
  });

  it("supports balanced API creation and grading while preserving the selected mode under weak-area practice", async () => {
    const db = openDatabase(":memory:");
    try {
      const app = createApp(db);
      const odds = await request(app)
        .post("/api/exercises")
        .send({ mode: "pot-odds", seed: 2 });
      await request(app)
        .post(`/api/exercises/${odds.body.id}/answer`)
        .send({ answer: 0, timeMs: 1000 })
        .expect(200);
      const exercise = await request(app)
        .post("/api/exercises")
        .send({
          mode: "who-wins",
          showdownStyle: "balanced",
          seed: 7,
          targetWeak: true,
        })
        .expect(201);
      expect(exercise.body.mode).toBe("who-wins");
      expect(exercise.body.dealStyle).toBe("balanced");
      expect(exercise.body.selection).toContain("Balanced showdown");
      const hero = solver.Hand.solve([
        ...exercise.body.hero,
        ...exercise.body.board,
      ]);
      const villain = solver.Hand.solve([
        ...exercise.body.villain,
        ...exercise.body.board,
      ]);
      const winners = solver.Hand.winners([hero, villain]);
      const answer =
        winners.length === 2
          ? "Tie"
          : winners[0] === hero
            ? "Player 1 wins"
            : "Player 2 wins";
      const result = await request(app)
        .post(`/api/exercises/${exercise.body.id}/answer`)
        .send({ answer, timeMs: 1000 })
        .expect(200);
      expect(result.body.feedback.correct).toBe(true);
      await request(app)
        .post("/api/exercises")
        .send({ mode: "who-wins", showdownStyle: "invented" })
        .expect(400);
    } finally {
      db.close();
    }
  });
});
