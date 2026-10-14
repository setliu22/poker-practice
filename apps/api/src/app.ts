import { readLessonRoutes } from "./read-lesson";
import { learningRoutes } from "./learning";
import express from "express";
import { solverCharts } from "./solver-charts";
import { assistantSchema } from "../../../packages/shared/src/assistant";
import {
  assistantContext,
  assistantSnapshot,
} from "../../../packages/poker/src/decision-assistant";
import { calculateAssistant } from "./assistant-jobs";
import { randomUUID, randomInt } from "node:crypto";
import type Database from "better-sqlite3";
import { z, ZodError } from "zod";
import {
  answerSchema,
  createSchema,
  modes,
  modeLabels,
  type Attempt,
  type Progress,
} from "../../../packages/shared/src/index";
import { generate, grade, type Specification } from "./exercises";
import {
  gameDeleteSchema,
  tableCreateSchema,
  tableActionSchema,
  tableNextSchema,
  tableOddsSchema,
} from "../../../packages/shared/src/table";
import type { LiveOdds } from "../../../packages/shared/src/table";
import {
  act,
  runBots,
  replayTable,
  resetHand,
  tableView,
  type TableState,
} from "../../../packages/poker/src/table";
import { analyzeTable } from "../../../packages/poker/src/table-review";
import { createPracticeTable } from "../../../packages/poker/src/easy-deals";
import { liveOdds } from "../../../packages/poker/src/live-odds";
import {
  openingCharts,
  livePreflopGuide,
} from "../../../packages/poker/src/preflop-charts";
import { gameStats, saveHandStats } from "./game-stats";
export function createApp(db: Database.Database) {
  const app = express();
  const oddsCache = new Map<string, Promise<LiveOdds>>();
  app.use(express.json({ limit: "32kb" }));
  app.use("/api/learning", learningRoutes(db));
  app.use("/api/learning/read", readLessonRoutes(db));
  // Preserve the latest available completed hand for tables created before game tracking.
  for (const row of db.prepare("SELECT state FROM bot_tables").all() as {
    state: string;
  }[]) {
    saveHandStats(db, JSON.parse(row.state));
  }
  app.get("/api/games", (_req, res) => res.json(gameStats(db)));
  app.get("/api/preflop-charts", (_req, res) => res.json(openingCharts));
  const getSolverChart = solverCharts(db);
  app.post("/api/tables/:id/solver-chart", (req, res) => {
    const { revision, retry } = tableOddsSchema
      .extend({ retry: z.boolean().optional() })
      .parse(req.body);
    const row = db
      .prepare("SELECT state FROM bot_tables WHERE id=?")
      .get(req.params.id) as { state: string } | undefined;
    if (!row) return void res.status(404).json({ error: "Table not found." });
    const state: TableState = JSON.parse(row.state);
    if (state.revision !== revision)
      return void res.status(409).json({
        error: "The hand changed. Open a chart for the current decision.",
      });
    const chart = getSolverChart(state, retry);
    res
      .status(
        ["queued", "building", "solving"].includes(chart.status) ? 202 : 200,
      )
      .json(chart);
  });
  app.post("/api/tables/:id/assistant", async (req, res) => {
    const input = assistantSchema.parse(req.body);
    const row = db
      .prepare("SELECT state FROM bot_tables WHERE id=?")
      .get(req.params.id) as { state: string } | undefined;
    if (!row) return void res.status(404).json({ error: "Table not found." });
    const state: TableState = JSON.parse(row.state);
    if (state.revision !== input.revision)
      return void res
        .status(409)
        .json({ error: "The hand changed. Inspect your current decision." });
    if (state.complete || state.actor !== 0 || state.players[0].folded)
      return void res.status(400).json({
        error: "The assistant is available on your turn in an active hand.",
      });
    if (state.street !== "preflop" && input.layer !== "advice")
      return void res
        .status(400)
        .json({ error: "This assistant is for preflop decisions." });
    if (input.layer === "context")
      return void res.json(assistantContext(state));
    const controller = new AbortController();
    const cancel = () => {
      if (!res.writableEnded) controller.abort();
    };
    res.on("close", cancel);
    try {
      const result = await calculateAssistant(
        assistantSnapshot(state),
        input,
        controller.signal,
      );
      const current = db
        .prepare(
          "SELECT json_extract(state,'$.revision') AS revision FROM bot_tables WHERE id=?",
        )
        .get(state.id) as { revision: number } | undefined;
      if (!current)
        return void res
          .status(404)
          .json({ error: "This game was deleted while calculating." });
      if (current.revision !== input.revision)
        return void res.status(409).json({
          error:
            "The hand changed while calculating. Inspect your current decision.",
        });
      res.json(result);
    } catch (error) {
      if (controller.signal.aborted) return;
      const message =
        error instanceof Error
          ? error.message
          : "Unable to calculate this decision.";
      res
        .status(message.startsWith("Two calculations") ? 429 : 422)
        .json({ error: message });
    } finally {
      res.off("close", cancel);
    }
  });

  app.post("/api/tables/:id/guide", (req, res) => {
    const { revision } = tableOddsSchema.parse(req.body);
    const row = db
      .prepare("SELECT state FROM bot_tables WHERE id=?")
      .get(req.params.id) as { state: string } | undefined;
    if (!row)
      return void res
        .status(404)
        .json({ error: "Table not found. Start a new table." });
    const state: TableState = JSON.parse(row.state);
    if (state.revision !== revision)
      return void res.status(409).json({
        error: "This hand changed. Open the guide for your current decision.",
      });
    if (state.complete || state.players[0].folded || state.actor !== 0)
      return void res.status(400).json({
        error: "The guide is available when it is your turn in an active hand.",
      });
    // Reading a guide never advances the game or writes an analysis/stats row.
    res.json(livePreflopGuide(state));
  });
  app.delete("/api/games/:id", (req, res) => {
    const { revision } = gameDeleteSchema.parse(req.body);
    const status = db.transaction(() => {
      const row = db
        .prepare(
          "SELECT json_extract(state,'$.revision') AS revision FROM bot_tables WHERE id=?",
        )
        .get(req.params.id) as { revision: number } | undefined;
      if (!row) return 204; // A retry of a successful deletion is safe.
      if (row.revision !== revision) return 409;
      for (const table of [
        "bot_commands",
        "bot_hand_stats",
        "bot_game_numbers",
        "bot_games",
      ]) {
        db.prepare(`DELETE FROM ${table} WHERE table_id=?`).run(req.params.id);
      }
      db.prepare("DELETE FROM bot_tables WHERE id=?").run(req.params.id);
      return 204;
    })();
    if (status === 409)
      res.status(409).json({
        error:
          "This game changed in another tab. Review its latest stats before deleting.",
      });
    else res.status(204).end();
  });
  app.post("/api/tables", (req, res) => {
    const { players, dealMode } = tableCreateSchema.parse(req.body);
    const state = runBots(
      createPracticeTable(
        randomUUID(),
        players,
        randomInt(0, 4294967295),
        dealMode,
      ),
    );
    db.transaction(() => {
      db.prepare("INSERT INTO bot_tables VALUES(?,?)").run(
        state.id,
        JSON.stringify(state),
      );
      db.prepare("INSERT INTO bot_games VALUES(?,?)").run(
        state.id,
        new Date().toISOString(),
      );
      db.prepare("INSERT INTO bot_game_numbers(table_id) VALUES(?)").run(
        state.id,
      );
      saveHandStats(db, state);
    })();
    res.status(201).json(tableView(state));
  });
  app.get("/api/tables/:id", (req, res) => {
    const row = db
      .prepare("SELECT state FROM bot_tables WHERE id=?")
      .get(req.params.id) as { state: string } | undefined;
    if (!row) {
      res.status(404).json({ error: "Table not found. Start a new table." });
      return;
    }
    const state = analyzeTable(JSON.parse(row.state));
    db.prepare("UPDATE bot_tables SET state=? WHERE id=?").run(
      JSON.stringify(state),
      state.id,
    );
    saveHandStats(db, state);
    res.json(tableView(state));
  });
  app.post("/api/tables/:id/odds", async (req, res) => {
    const { revision } = tableOddsSchema.parse(req.body);
    const row = db
      .prepare("SELECT state FROM bot_tables WHERE id=?")
      .get(req.params.id) as { state: string } | undefined;
    if (!row)
      return void res
        .status(404)
        .json({ error: "Table not found. Start a new table." });
    const state: TableState = JSON.parse(row.state);
    if (state.revision !== revision)
      return void res.status(409).json({
        error: "This hand has changed. Check odds for the current decision.",
      });
    if (state.complete || state.players[0].folded)
      return void res.status(400).json({
        error: "Odds are available while you are still in an active hand.",
      });
    const key = `${state.id}/${state.handNumber}/${revision}`;
    let pending = oddsCache.get(key);
    if (!pending) {
      pending = liveOdds(state);
      oddsCache.set(key, pending);
      if (oddsCache.size > 32) oddsCache.delete(oddsCache.keys().next().value!);
      pending.catch(() => oddsCache.delete(key));
    }
    let result: LiveOdds;
    try {
      result = await pending;
    } catch {
      return void res.status(422).json({
        error:
          "Unable to estimate odds from this public hand history. No game action was taken.",
      });
    }
    // Other tabs can act while the cooperative calculation runs. Never return
    // an old estimate as though it describes their new decision.
    const current = db
      .prepare(
        "SELECT json_extract(state, '$.revision') AS revision FROM bot_tables WHERE id=?",
      )
      .get(req.params.id) as { revision: number } | undefined;
    if (!current)
      return void res
        .status(404)
        .json({ error: "This game was deleted while calculating odds." });
    if (current.revision !== revision)
      return void res.status(409).json({
        error: "This hand changed while calculating. Check odds again.",
      });
    res.json(result);
  });
  app.post("/api/tables/:id/reset-hand", (req, res) => {
    const input = tableNextSchema.parse(req.body);
    const result = db.transaction(() => {
      const saved = db
        .prepare(
          "SELECT response FROM bot_commands WHERE table_id=? AND action_id=?",
        )
        .get(req.params.id, input.actionId) as { response: string } | undefined;
      if (saved) return { status: 200, body: JSON.parse(saved.response) };
      const row = db
        .prepare("SELECT state FROM bot_tables WHERE id=?")
        .get(req.params.id) as { state: string } | undefined;
      if (!row) return { status: 404, body: { error: "Table not found." } };
      const source: TableState = JSON.parse(row.state);
      if (source.revision !== input.revision)
        return {
          status: 409,
          body: { error: "This hand changed. Reload before restarting it." },
        };
      const state = resetHand(source);
      db.prepare(
        "DELETE FROM bot_hand_stats WHERE table_id=? AND hand_number=?",
      ).run(source.id, source.handNumber);
      db.prepare("UPDATE bot_tables SET state=? WHERE id=?").run(
        JSON.stringify(state),
        source.id,
      );
      saveHandStats(db, state);
      const view = tableView(state);
      db.prepare("INSERT INTO bot_commands VALUES(?,?,?)").run(
        source.id,
        input.actionId,
        JSON.stringify(view),
      );
      return { status: 200, body: view };
    })();
    res.status(result.status).json(result.body);
  });
  app.post("/api/tables/:id/replay", (req, res) => {
    const input = tableNextSchema.parse(req.body);
    const result = db.transaction(() => {
      const saved = db
        .prepare(
          "SELECT response FROM bot_commands WHERE table_id=? AND action_id=?",
        )
        .get(req.params.id, input.actionId) as { response: string } | undefined;
      if (saved) return { status: 200, body: JSON.parse(saved.response) };
      const row = db
        .prepare("SELECT state FROM bot_tables WHERE id=?")
        .get(req.params.id) as { state: string } | undefined;
      if (!row)
        return {
          status: 404,
          body: { error: "Table not found. Start a new table." },
        };
      const source: TableState = JSON.parse(row.state);
      if (source.revision !== input.revision)
        return {
          status: 409,
          body: { error: "This table has changed. Reload its current state." },
        };
      if (!source.complete)
        return {
          status: 400,
          body: { error: "Finish the current hand before replaying it." },
        };
      const state = replayTable(source, randomUUID());
      db.prepare("INSERT INTO bot_tables VALUES(?,?)").run(
        state.id,
        JSON.stringify(state),
      );
      db.prepare("INSERT INTO bot_games VALUES(?,?)").run(
        state.id,
        new Date().toISOString(),
      );
      db.prepare("INSERT INTO bot_game_numbers(table_id) VALUES(?)").run(
        state.id,
      );
      saveHandStats(db, state);
      const view = tableView(state);
      // Receipt belongs to the source. Retrying creates no second replay and
      // never rewrites the original hand, history, or profit.
      db.prepare("INSERT INTO bot_commands VALUES(?,?,?)").run(
        source.id,
        input.actionId,
        JSON.stringify(view),
      );
      return { status: 201, body: view };
    })();
    res.status(result.status).json(result.body);
  });
  for (const route of ["actions", "next"] as const)
    app.post(`/api/tables/:id/${route}`, (req, res) => {
      const input =
        route === "actions"
          ? tableActionSchema.parse(req.body)
          : tableNextSchema.parse(req.body);
      const result = db.transaction(() => {
        const saved = db
          .prepare(
            "SELECT response FROM bot_commands WHERE table_id=? AND action_id=?",
          )
          .get(req.params.id, input.actionId) as
          { response: string } | undefined;
        if (saved) return { status: 200, body: JSON.parse(saved.response) };
        const row = db
          .prepare("SELECT state FROM bot_tables WHERE id=?")
          .get(req.params.id) as { state: string } | undefined;
        if (!row)
          return {
            status: 404,
            body: { error: "Table not found. Start a new table." },
          };
        let state: TableState = analyzeTable(JSON.parse(row.state));
        if (state.revision !== input.revision)
          return {
            status: 409,
            body: {
              error: "This table has changed. Reload its current state.",
            },
          };
        try {
          if (route === "next") {
            if (!state.complete)
              return {
                status: 400,
                body: { error: "Finish the current hand first." },
              };
            saveHandStats(db, state);
            state = createPracticeTable(
              state.id,
              state.players.length,
              randomInt(0, 4294967295),
              state.dealMode ?? "random",
              state.dealer + 1,
              state.handNumber + 1,
              state.revision,
              2,
              state.reads ?? [],
            );
          } else {
            const actionInput = tableActionSchema.parse(input);
            act(state, 0, actionInput.action, actionInput.amount);
          }
          state.revision++;
          runBots(state);
        } catch (err) {
          return { status: 400, body: { error: (err as Error).message } };
        }
        analyzeTable(state);
        saveHandStats(db, state);
        const view = tableView(state);
        db.prepare("UPDATE bot_tables SET state=? WHERE id=?").run(
          JSON.stringify(state),
          state.id,
        );
        db.prepare("INSERT INTO bot_commands VALUES(?,?,?)").run(
          state.id,
          input.actionId,
          JSON.stringify(view),
        );
        return { status: 200, body: view };
      })();
      res.status(result.status).json(result.body);
    });
  const attempts = (): Attempt[] =>
    (
      db.prepare("SELECT id,data FROM attempts ORDER BY id DESC").all() as {
        id: number;
        data: string;
      }[]
    ).map((r) => ({ ...JSON.parse(r.data), id: r.id }));
  function progress(): Progress {
    const all = attempts();
    const skills = new Map<
      string,
      { tag: string; mistakes: number; attempts: number }
    >();
    for (const a of all.slice(0, 100))
      for (const tag of a.tags) {
        const s = skills.get(tag) ?? { tag, mistakes: 0, attempts: 0 };
        s.attempts++;
        if (
          a.feedback.correct === false ||
          (a.feedback.kind === "estimate" && (a.feedback.error ?? 0) > 5)
        )
          s.mistakes++;
        skills.set(tag, s);
      }
    const categorical = modes
      .filter((m) => ["who-wins", "what-beats-me", "decision"].includes(m))
      .map((mode) => {
        const rows = all.filter((a) => a.mode === mode);
        return {
          mode,
          attempts: rows.length,
          accuracy: rows.length
            ? (rows.filter((a) => a.feedback.correct).length / rows.length) *
              100
            : 0,
        };
      });
    const numeric = modes
      .filter((m) => ["pot-odds", "equity"].includes(m))
      .map((mode) => {
        const rows = all.filter((a) => a.mode === mode);
        return {
          mode,
          attempts: rows.length,
          averageError: rows.length
            ? rows.reduce((s, a) => s + (a.feedback.error ?? 0), 0) /
              rows.length
            : 0,
        };
      });
    const days = new Map<string, number>();
    all.forEach((a) =>
      days.set(a.date.slice(0, 10), (days.get(a.date.slice(0, 10)) ?? 0) + 1),
    );
    return {
      total: all.length,
      categorical,
      numeric,
      skills: [...skills.values()].sort(
        (a, b) =>
          b.mistakes / b.attempts - a.mistakes / a.attempts ||
          b.mistakes - a.mistakes,
      ),
      recent: all.slice(0, 12),
      sessions: [...days]
        .slice(0, 7)
        .map(([date, attempts]) => ({ date, attempts })),
    };
  }
  app.get("/api/health", (_req, res) => res.json({ status: "ok" }));
  app.get("/api/modes", (_req, res) =>
    res.json(modes.map((id) => ({ id, label: modeLabels[id] }))),
  );
  app.post("/api/exercises", (req, res) => {
    const input = createSchema.parse(req.body);
    const seed = input.seed ?? randomInt(0, 4294967295);
    let mode = input.mode,
      target: string | undefined;
    if (
      input.targetWeak &&
      seed % 4 !== 0 &&
      !(input.mode === "who-wins" && input.showdownStyle === "balanced")
    ) {
      const weak = progress().skills.find((s) => s.mistakes > 0);
      if (weak) {
        target = weak.tag;
        const a = attempts().find(
          (a) =>
            a.tags.includes(target!) &&
            (a.feedback.correct === false || (a.feedback.error ?? 0) > 5),
        );
        if (a) mode = a.mode;
      }
    }
    const spec = generate(
      mode,
      seed,
      randomUUID(),
      input.street,
      target,
      input.showdownStyle,
    );
    if (input.targetWeak)
      spec.exercise.selection =
        mode === "who-wins"
          ? input.showdownStyle === "balanced"
            ? "Balanced showdown practice: each winning hand category is equally represented in fresh generated deals."
            : "Random showdown practice: deals are never filtered by skill or hand strength."
          : target
            ? `Targeting ${target}: highest mistake rate among the last 100 attempts. One in four seeded selections mixes in ordinary practice.`
            : "Mixed practice: no eligible recent weakness, or this is the one-in-four ordinary selection.";
    db.prepare("INSERT INTO exercises VALUES(?,?,?)").run(
      spec.exercise.id,
      JSON.stringify(spec),
      new Date().toISOString(),
    );
    res.status(201).json(spec.exercise);
  });
  app.post("/api/exercises/:id/answer", (req, res) => {
    const input = answerSchema.parse(req.body);
    const row = db
      .prepare("SELECT specification FROM exercises WHERE id=?")
      .get(req.params.id) as { specification: string } | undefined;
    if (!row) {
      res
        .status(404)
        .json({ error: "Exercise not found. Start a new exercise." });
      return;
    }
    const existing = db
      .prepare("SELECT id,data FROM attempts WHERE exercise_id=?")
      .get(req.params.id) as { id: number; data: string } | undefined;
    if (existing) {
      res.json({
        feedback: JSON.parse(existing.data).feedback,
        replayed: true,
      });
      return;
    }
    const spec: Specification = JSON.parse(row.specification);
    let feedback;
    try {
      feedback = grade(spec, input.answer);
    } catch (err) {
      res.status(400).json({ error: (err as Error).message });
      return;
    }
    const attempt: Omit<Attempt, "id"> = {
      exerciseId: spec.exercise.id,
      sourceId: spec.exercise.sourceId,
      mode: spec.exercise.mode,
      answer: input.answer,
      explanation: input.explanation,
      feedback,
      timeMs: input.timeMs,
      date: new Date().toISOString(),
      tags: spec.exercise.tags,
    };
    db.prepare("INSERT INTO attempts(exercise_id,data) VALUES(?,?)").run(
      spec.exercise.id,
      JSON.stringify(attempt),
    );
    res.json({ feedback, replayed: false });
  });
  app.get("/api/progress", (_req, res) => res.json(progress()));
  app.get("/api/attempts", (_req, res) => res.json(attempts()));
  app.get("/api/export", (_req, res) =>
    res.attachment("poker-practice-progress.json").json({
      version: 1,
      exportedAt: new Date().toISOString(),
      profile: "Local learner",
      attempts: attempts(),
      readLessons: db.prepare("SELECT * FROM read_lessons").all(),
      readLessonAttempts: db.prepare("SELECT * FROM read_lesson_answers").all(),
      learningAttempts: db
        .prepare("SELECT * FROM learning_questions WHERE feedback IS NOT NULL")
        .all(),
    }),
  );
  app.delete("/api/progress", (_req, res) => {
    db.transaction(() => {
      db.prepare("DELETE FROM attempts").run();
      db.prepare("DELETE FROM exercises").run();
      db.prepare("DELETE FROM learning_questions").run();
      db.prepare("DELETE FROM read_lessons").run();
    })();
    res.json({ cleared: true });
  });
  app.use(
    (
      err: Error,
      _req: express.Request,
      res: express.Response,
      _next: express.NextFunction,
    ) => {
      if (err instanceof ZodError) {
        res.status(400).json({
          error:
            "Invalid request: " +
            err.issues
              .map((i) => `${i.path.join(".")}: ${i.message}`)
              .join("; "),
        });
        return;
      }
      if ("status" in err && (err as { status: number }).status === 400) {
        res.status(400).json({ error: "Invalid JSON request." });
        return;
      }
      console.error(err);
      res
        .status(500)
        .json({ error: "Unable to complete the request. Please try again." });
    },
  );
  return app;
}
