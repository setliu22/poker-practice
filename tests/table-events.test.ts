import { describe, expect, it } from "vitest";
import {
  act,
  createTable,
  legalActions,
  replayTable,
  runBots,
  type TableState,
} from "../packages/poker/src/table";
import { createPracticeTable } from "../packages/poker/src/easy-deals";
import {
  branchTable,
  historicalTableView,
  initialHandState,
  publicTableEvents,
  reconstructTable,
  type TableEvent,
} from "../packages/poker/src/table-events";

function checkpoint(state: TableState, partial = false): TableEvent {
  return {
    sequence: 1,
    version: 1,
    kind: "checkpoint",
    payload: {
      state: structuredClone(state),
      reason: partial ? "legacy" : "created",
      ...(partial ? { partial: true } : {}),
    },
  };
}

function journal(source: TableState): TableEvent[] {
  const events: TableEvent[] = [checkpoint(initialHandState(source))];
  for (const action of source.actions ?? [])
    events.push({
      sequence: events.length + 1,
      version: 1,
      kind: "action",
      payload: {
        seat: action.seat,
        action: action.action,
        ...(action.amount === undefined ? {} : { amount: action.amount }),
      },
    });
  return events;
}

function finish(state: TableState) {
  runBots(state);
  let safety = 0;
  while (!state.complete) {
    expect(++safety).toBeLessThan(100);
    const legal = legalActions(state)!;
    act(state, 0, legal.canCheck ? "check" : "call");
    runBots(state);
  }
  return state;
}

// Persistence uses JSON. Omitted optional properties and undefined are equivalent.
const persisted = (value: unknown) => JSON.parse(JSON.stringify(value));

describe("durable table events", () => {
  it.each([1, 2])(
    "reconstructs recorded human/bot actions and public reads for policy %i without policy rerolls",
    (policy) => {
      const reads = [
        { seat: 0, decisions: 12, facing: 9, folds: 2, calls: 3, raises: 4 },
      ];
      const source = finish(
        createTable("original", 6, 42, 3, 7, 4, policy, reads),
      );
      const events = journal(source);
      const originalJournal = persisted(events);
      expect(events.filter((event) => event.kind === "action")).toHaveLength(
        source.actions!.length,
      );
      expect(persisted(reconstructTable(events))).toEqual(persisted(source));
      // Randomness is not consulted while applying recorded actions.
      if (events[0].kind !== "checkpoint") throw new Error("test setup");
      events[0].payload.state.seed = 999_999;
      const rebuilt = reconstructTable(events);
      expect(rebuilt.actions).toEqual(source.actions);
      expect(rebuilt.players).toEqual(source.players);
      expect(rebuilt.policyEvents).toEqual(source.policyEvents);
      expect(rebuilt.reads).toEqual(source.reads);
      expect(originalJournal[0].payload.state.seed).toBe(42);
      expect(events[0].payload.state.actions).toEqual([]);
      expect(
        rebuilt.players.reduce((sum, player) => sum + player.stack, 0),
      ).toBe(6000);
    },
  );

  it("preserves the actual recorded deal, identities, Easy mode and replay metadata", () => {
    const source = finish(createPracticeTable("easy", 3, 33, "easy"));
    const alternate = createTable("alternate", 3, 789);
    source.players.forEach((player, seat) => {
      player.hole = [...alternate.players[seat].hole];
      player.name = `Recorded ${seat}`;
    });
    source.runout = [...alternate.runout];
    const replay = replayTable(source, "replay");
    const initial = initialHandState(replay);
    expect(initial.seed).toBe(source.seed);
    expect(initial.runout).toEqual(alternate.runout);
    expect(initial.players.map((player) => player.hole)).toEqual(
      alternate.players.map((player) => player.hole),
    );
    expect(initial.players.map((player) => player.name)).toEqual(
      replay.players.map((player) => player.name),
    );
    expect(initial.replayOf).toEqual({ tableId: "easy", handNumber: 1 });
    expect(initial.analysisIdentity).toBe("easy");
    expect(initial.dealMode).toBe("easy");
    expect(initial.actions).toEqual([]);
    expect(initial.board).toEqual([]);
    expect(persisted(reconstructTable(journal(replay)))).toEqual(
      persisted(replay),
    );
  });

  it("reconstructs revisions and multiple hands while retaining old decision prefixes", () => {
    const first = createTable("game", 2, 9);
    act(first, 0, "fold");
    const events = journal(first);
    events.push({
      sequence: 3,
      version: 1,
      kind: "revision",
      payload: { revision: 1 },
    });
    const next = createTable("game", 2, 10, 1, 2, 2);
    events.push({
      sequence: 4,
      version: 1,
      kind: "checkpoint",
      payload: { state: next, reason: "next" },
    });
    const prefix = reconstructTable(events, 2);
    expect(prefix.complete).toBe(false);
    expect(prefix.handNumber).toBe(1);
    expect(prefix.actor).toBe(0);
    expect(reconstructTable(events, 4).revision).toBe(1);
    expect(reconstructTable(events).handNumber).toBe(2);
    expect(reconstructTable(events).revision).toBe(2);
    expect(publicTableEvents(events).map((event) => event.handNumber)).toEqual([
      1, 1, 1, 2,
    ]);
  });

  it("retains legacy checkpoints exactly and honestly marks missing prior history", () => {
    const legacy = finish(createTable("legacy", 3, 27, 0, 4, 8, 1));
    delete legacy.actions;
    delete legacy.startingReads;
    delete legacy.policyVersion;
    const events = [checkpoint(legacy, true)];
    expect(reconstructTable(events)).toEqual(legacy);
    expect(publicTableEvents(events)).toEqual([
      expect.objectContaining({
        reason: "legacy",
        partial: true,
        kind: "checkpoint",
        heroDecision: false,
      }),
    ]);
    expect(() => reconstructTable(events, 1)).toThrow("No table state");
  });

  it("exposes only decision-time public information and never bot legal contexts", () => {
    const source = finish(createTable("private", 3, 42));
    const events = journal(source);
    const publicEvents = publicTableEvents(events);
    for (const entry of publicEvents) {
      expect(entry).not.toHaveProperty("payload");
      expect(entry).not.toHaveProperty("seed");
      expect(entry).not.toHaveProperty("runout");
      expect(entry).not.toHaveProperty("players");
      if (entry.heroDecision) {
        const before = reconstructTable(events, entry.sequence);
        expect(entry.hero).toEqual(before.players[0].hole);
        expect(entry.board).toEqual(before.board);
        expect(entry.pot).toBe(
          before.players.reduce((sum, player) => sum + player.contributed, 0),
        );
        expect(entry.legal).toEqual(legalActions(before, 0));
      } else {
        expect(entry).not.toHaveProperty("hero");
        expect(entry).not.toHaveProperty("legal");
      }
    }
    const firstDecision = publicEvents.find((entry) => entry.heroDecision)!;
    const historical = historicalTableView(
      reconstructTable(events, firstDecision.sequence),
    );
    expect(historical.board).toEqual([]);
    expect(
      historical.history.some((entry) => entry.text.includes("dealt")),
    ).toBe(false);
    expect(historical.players.slice(1).every((player) => !player.hole)).toBe(
      true,
    );
    expect(historical.rounds).toEqual([]);
    expect(historical.review).toEqual([]);
  });

  it("masks opponent showdown cards, ranks and completed-hand analysis", () => {
    const source = finish(createTable("showdown", 2, 42));
    expect(source.complete).toBe(true);
    source.history.push({ street: "river", seat: 1, text: "Secret hand rank" });
    source.rounds = [{ actualCards: [{ cards: ["As", "Ad"] }] } as never];
    const view = historicalTableView(source);
    expect(view.players[0].hole).toEqual(source.players[0].hole);
    for (const player of view.players.slice(1)) {
      expect(player).not.toHaveProperty("hole");
      expect(player).not.toHaveProperty("bestFive");
      expect(player).not.toHaveProperty("handName");
    }
    expect(view.history.some((entry) => entry.text.includes("receives"))).toBe(
      false,
    );
    expect(view.history.some((entry) => entry.text.includes("Secret"))).toBe(
      false,
    );
    expect(view.rounds).toEqual([]);
    expect(view.review).toEqual([]);
    expect(view.legal).toBeNull();
  });

  it("branches from a later hero decision with prior observations and an independent result", () => {
    const source = finish(createTable("source", 2, 42));
    const sourceBefore = persisted(source);
    const events = journal(source);
    const decisions = publicTableEvents(events).filter(
      (event) => event.heroDecision,
    );
    expect(decisions.length).toBeGreaterThan(1);
    const selected = decisions[1];
    const before = reconstructTable(events, selected.sequence);
    const branch = branchTable(before, "branch", source.id, selected.sequence);
    expect(branch.branchOf).toEqual({
      tableId: "source",
      sequence: selected.sequence,
      handNumber: source.handNumber,
    });
    expect(branch.revision).toBe(0);
    expect(branch.analysisIdentity).toBe("source");
    expect(branch.actions).toEqual(before.actions);
    expect(branch.reads).toEqual(before.reads);
    expect(branch.decisions).toEqual(before.decisions);
    expect(branch.runout).toEqual(before.runout);
    expect(branch.rounds).toEqual([]);
    act(branch, 0, "fold");
    runBots(branch);
    expect(branch.complete).toBe(true);
    expect(persisted(source)).toEqual(sourceBefore);
    expect(before.complete).toBe(false);
    expect(branch.actions).not.toEqual(source.actions);
    expect(branch.players.reduce((sum, player) => sum + player.stack, 0)).toBe(
      2000,
    );
  });

  it("reconstructs short all-in raise reopening rights before branching", () => {
    const start = createTable("short", 3, 1);
    start.street = "flop";
    start.board = start.runout.slice(0, 3);
    start.players.forEach((player) => {
      player.stack += player.streetBet;
      player.contributed = 0;
      player.streetBet = 0;
    });
    start.players[1].stack = 150;
    start.players[1].contributed = 850;
    start.currentBet = 0;
    start.minRaise = 10;
    start.actor = 0;
    start.pending = [0, 1, 2];
    start.lastActBet = [null, null, null];
    const events: TableEvent[] = [checkpoint(start)];
    for (const [seat, action, amount] of [
      [0, "raise", 100],
      [1, "raise", 150],
      [2, "call", undefined],
    ] as const)
      events.push({
        sequence: events.length + 1,
        version: 1,
        kind: "action",
        payload: { seat, action, amount },
      });
    const reconstructed = reconstructTable(events);
    expect(reconstructed.actor).toBe(0);
    expect(legalActions(reconstructed)?.canRaise).toBe(false);
    expect(legalActions(reconstructed)?.toCall).toBe(50);
    const branch = branchTable(reconstructed, "short-branch", "short", 5);
    expect(() => act(branch, 0, "raise", 250)).toThrow("Raise to a total");
    act(branch, 0, "call");
    while (!branch.complete) {
      const legal = legalActions(branch)!;
      act(branch, branch.actor!, legal.canCheck ? "check" : "call");
    }
    expect(branch.players.reduce((sum, player) => sum + player.stack, 0)).toBe(
      3000,
    );
  });

  it("rejects corrupt sequence/version/legal moves and invalid branch points", () => {
    const state = createTable("bad", 2, 8);
    expect(() => reconstructTable([])).toThrow("No table state");
    expect(() => reconstructTable([checkpoint(state)], 2)).toThrow("not found");
    expect(() =>
      reconstructTable([{ ...checkpoint(state), sequence: 2 }]),
    ).toThrow("sequence");
    expect(() =>
      reconstructTable([{ ...checkpoint(state), version: 2 } as never]),
    ).toThrow("version");
    const illegal: TableEvent = {
      sequence: 2,
      version: 1,
      kind: "action",
      payload: { seat: 1, action: "check" },
    };
    const initial = checkpoint(state);
    expect(() => reconstructTable([initial, illegal])).toThrow("turn");
    expect(initial).toEqual(checkpoint(state));
    expect(() => branchTable(state, "bad", "bad", 2)).toThrow("separate");
    act(state, 0, "call");
    expect(() => branchTable(state, "new", "bad", 3)).toThrow("hero decision");
    act(state, 1, "fold");
    expect(() => branchTable(state, "new", "bad", 3)).toThrow("hero decision");
  });
});
