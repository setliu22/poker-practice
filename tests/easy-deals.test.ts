import { describe, expect, it } from "vitest";
import request from "supertest";
import { randomUUID } from "node:crypto";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { deck, deal, validateCards } from "../packages/poker/src/index";
import {
  createPracticeTable,
  isEasyStartingHand,
  selectPracticeSeed,
} from "../packages/poker/src/easy-deals";
import {
  act,
  createTable,
  replayTable,
  runBots,
  tableView,
  type TableState,
} from "../packages/poker/src/table";
import { tableCreateSchema } from "../packages/shared/src/table";
import { createApp } from "../apps/api/src/app";
import { openDatabase } from "../apps/api/src/database";

describe("Easy starting-hand selection", () => {
  it.each([
    ["2c", "2h"],
    ["As", "Ad"],
    ["Tc", "Jd"],
    ["Kh", "Qs"],
    ["Ac", "2c"],
    ["Ad", "9d"],
    ["6h", "5h"],
    ["9s", "8s"],
    ["Tc", "9c"],
    ["Ks", "As"],
  ])("includes the authored practice candidate %s %s", (first, second) => {
    expect(isEasyStartingHand([first, second])).toBe(true);
    expect(isEasyStartingHand([second, first])).toBe(true);
  });
  it.each([
    ["As", "2h"],
    ["Ad", "9c"],
    ["Kh", "9s"],
    ["Th", "9d"],
    ["7c", "6s"],
    ["5h", "4h"],
    ["6d", "4d"],
    ["2c", "7d"],
  ])("excludes the unselected starting hand %s %s", (first, second) => {
    expect(isEasyStartingHand([first, second])).toBe(false);
  });
  it("contains 290 of the 1,326 distinct starting combinations", () => {
    let count = 0;
    for (let a = 0; a < deck.length; a++)
      for (let b = a + 1; b < deck.length; b++)
        if (isEasyStartingHand([deck[a], deck[b]])) count++;
    // 78 pairs + 160 nonpair T-through-A hands + 32 other suited aces
    // + 20 other suited connectors from 65s through T9s.
    expect(count).toBe(290);
  });
  it("rejects invalid cards, seed values, and unknown deal modes", () => {
    expect(() => isEasyStartingHand(["As", "As"])).toThrow("unique");
    expect(() => isEasyStartingHand(["As"])).toThrow("Cards");
    for (const seed of [-1, 1.5, Number.NaN, 4294967296])
      expect(() => selectPracticeSeed(seed, "easy")).toThrow("32-bit");
    expect(() => selectPracticeSeed(1, "unknown" as never)).toThrow("Unknown");
  });
  it("retains random deals exactly and never changes the existing table constructor", () => {
    for (const seed of [0, 1, 44, 0xffffffff]) {
      expect(selectPracticeSeed(seed, "random")).toBe(seed);
      const original = createTable("random", 9, seed, 4, 7, 3);
      const practice = createPracticeTable(
        "random",
        9,
        seed,
        "random",
        4,
        7,
        3,
      );
      expect(practice).toEqual({ ...original, dealMode: "random" });
      expect(original).not.toHaveProperty("dealMode");
    }
  });
  it("repeats deterministically, varies deals, and leaves the full selected deck untouched", () => {
    const selected = new Set<number>();
    for (let seed = 0; seed < 200; seed++) {
      const chosen = selectPracticeSeed(seed, "easy");
      selected.add(chosen);
      expect(selectPracticeSeed(seed, "easy")).toBe(chosen);
      if (isEasyStartingHand(deal(seed, 2))) expect(chosen).toBe(seed);
      for (const players of [2, 5, 9]) {
        const state = createPracticeTable("easy", players, seed, "easy");
        expect(state.seed).toBe(chosen);
        expect(isEasyStartingHand(state.players[0].hole)).toBe(true);
        const allCards = [
          ...state.players.flatMap((player) => player.hole),
          ...state.runout,
        ];
        validateCards(allCards);
        // No swapping, favorable-board selection, or opponent-hand filtering.
        expect(allCards).toEqual(deal(chosen, players * 2 + 5));
        const sameDeal = createTable("easy", players, chosen);
        expect(runBots(state).players).toEqual(runBots(sameDeal).players);
        expect(state.history).toEqual(sameDeal.history);
      }
    }
    expect(selected.size).toBeGreaterThan(150);
  });
  it("replays the recorded Easy deal and policy randomness without selecting another seed", () => {
    const original = createPracticeTable(
      "easy-original",
      2,
      44,
      "easy",
      0,
      6,
      8,
    );
    const initial = structuredClone(tableView(original));
    act(original, 0, "fold");
    const saved = structuredClone(original);
    const replay = replayTable(original, "easy-replay");
    expect(replay.dealMode).toBe("easy");
    expect(replay.seed).toBe(original.seed);
    expect(replay.runout).toEqual(original.runout);
    expect(replay.players.map((player) => player.hole)).toEqual(
      original.players.map((player) => player.hole),
    );
    expect(replay.dealer).toBe(initial.dealer);
    expect(replay.history).toEqual(initial.history);
    act(replay, 0, "fold");
    expect(replay.players).toEqual(original.players);
    expect(original).toEqual(saved);
  });
});

describe("Easy mode API and persistence", () => {
  it("defaults to random, validates the mode, and hides all deal internals", async () => {
    const db = openDatabase(":memory:");
    try {
      const app = createApp(db);
      expect(tableCreateSchema.parse({ players: 2 }).dealMode).toBe("random");
      for (const dealMode of ["unknown", null, 1])
        expect(
          (
            await request(app)
              .post("/api/tables")
              .send({ players: 2, dealMode })
          ).status,
        ).toBe(400);
      const random = await request(app)
        .post("/api/tables")
        .send({ players: 2 });
      expect(random.status).toBe(201);
      expect(random.body.dealMode).toBe("random");
      const easy = await request(app)
        .post("/api/tables")
        .send({ players: 2, dealMode: "easy" });
      expect(easy.status).toBe(201);
      expect(easy.body.dealMode).toBe("easy");
      expect(isEasyStartingHand(easy.body.players[0].hole)).toBe(true);
      expect(easy.body.players[1]).not.toHaveProperty("hole");
      for (const privateField of [
        "seed",
        "runout",
        "startingReads",
        "policyEvents",
      ])
        expect(easy.body).not.toHaveProperty(privateField);
      const stored = JSON.parse(
        (
          db
            .prepare("SELECT state FROM bot_tables WHERE id=?")
            .get(easy.body.id) as { state: string }
        ).state,
      ) as TableState;
      expect(stored.dealMode).toBe("easy");
      expect(isEasyStartingHand(deal(stored.seed, 2))).toBe(true);
    } finally {
      db.close();
    }
  });
  it("persists Easy mode through restart, next hand, and an idempotent exact replay", async () => {
    const directory = mkdtempSync(join(tmpdir(), "poker-easy-"));
    const file = join(directory, "table.sqlite");
    let db = openDatabase(file);
    try {
      let app = createApp(db);
      const created = await request(app)
        .post("/api/tables")
        .send({ players: 2, dealMode: "easy" });
      const finished = await request(app)
        .post(`/api/tables/${created.body.id}/actions`)
        .send({
          revision: created.body.revision,
          actionId: randomUUID(),
          action: "fold",
        });
      expect(finished.status).toBe(200);
      expect(finished.body.complete).toBe(true);
      const originalState = (
        db
          .prepare("SELECT state FROM bot_tables WHERE id=?")
          .get(created.body.id) as { state: string }
      ).state;
      const replayInput = {
        revision: finished.body.revision,
        actionId: randomUUID(),
      };
      const replay = await request(app)
        .post(`/api/tables/${created.body.id}/replay`)
        .send(replayInput);
      expect(replay.status).toBe(201);
      expect(replay.body.dealMode).toBe("easy");
      expect(replay.body.players[0].hole).toEqual(created.body.players[0].hole);
      expect(
        (
          db
            .prepare("SELECT state FROM bot_tables WHERE id=?")
            .get(created.body.id) as { state: string }
        ).state,
      ).toBe(originalState);
      db.close();
      db = openDatabase(file);
      app = createApp(db);
      const loaded = await request(app).get(`/api/tables/${created.body.id}`);
      expect(loaded.body.dealMode).toBe("easy");
      expect(
        (
          await request(app)
            .post(`/api/tables/${created.body.id}/replay`)
            .send(replayInput)
        ).body,
      ).toEqual(replay.body);
      const input = { revision: loaded.body.revision, actionId: randomUUID() };
      const next = await request(app)
        .post(`/api/tables/${created.body.id}/next`)
        .send(input);
      expect(next.status).toBe(200);
      expect(next.body.dealMode).toBe("easy");
      expect(next.body.handNumber).toBe(2);
      expect(next.body.dealer).toBe(1);
      expect(isEasyStartingHand(next.body.players[0].hole)).toBe(true);
      expect(
        (
          await request(app)
            .post(`/api/tables/${created.body.id}/next`)
            .send(input)
        ).body,
      ).toEqual(next.body);
      const state = JSON.parse(
        (
          db
            .prepare("SELECT state FROM bot_tables WHERE id=?")
            .get(created.body.id) as { state: string }
        ).state,
      ) as TableState;
      expect(state.dealMode).toBe("easy");
      expect(
        state.players
          .map((player) => player.hole)
          .flat()
          .concat(state.runout),
      ).toEqual(deal(state.seed, 9));
    } finally {
      if (db.open) db.close();
      rmSync(directory, { recursive: true, force: true });
    }
  });
});
