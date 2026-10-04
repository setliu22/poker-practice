import express from "express";
import { randomUUID, randomInt } from "node:crypto";
import type Database from "better-sqlite3";
import { ZodError } from "zod";
import {
  answerSchema,
  createSchema,
  modes,
  modeLabels,
  type Attempt,
  type Progress,
} from "../../../packages/shared/src/index";
import { generate, grade, type Specification } from "./exercises";
export function createApp(db: Database.Database) {
  const app = express();
  app.use(express.json({ limit: "32kb" }));
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
    if (input.targetWeak && seed % 4 !== 0) {
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
    const spec = generate(mode, seed, randomUUID(), input.street, target);
    if (input.targetWeak)
      spec.exercise.selection = target
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
    res
      .attachment("poker-practice-progress.json")
      .json({
        version: 1,
        exportedAt: new Date().toISOString(),
        profile: "Local learner",
        attempts: attempts(),
      }),
  );
  app.delete("/api/progress", (_req, res) => {
    db.transaction(() => {
      db.prepare("DELETE FROM attempts").run();
      db.prepare("DELETE FROM exercises").run();
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
        res
          .status(400)
          .json({
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
