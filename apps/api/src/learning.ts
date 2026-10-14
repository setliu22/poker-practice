import { Router } from "express";
import type Database from "better-sqlite3";
import { randomUUID } from "node:crypto";
import { z } from "zod";
import {
  learningScenarios,
  learningQuestion,
  gradeLearning,
} from "../../../packages/poker/src/learning";
import { learningAnswerSchema } from "../../../packages/shared/src/learning";
import type {
  LearningFeedback,
  LearningProgress,
} from "../../../packages/shared/src/learning";
export function learningRoutes(db: Database.Database) {
  const router = Router();
  router.post("/questions", (req, res) => {
    const { index } = z
      .object({
        index: z
          .number()
          .int()
          .min(0)
          .max(learningScenarios.length - 1),
      })
      .strict()
      .parse(req.body);
    const id = randomUUID();
    db.prepare(
      "INSERT INTO learning_questions(id,scenario,created_at) VALUES(?,?,?)",
    ).run(id, index, new Date().toISOString());
    res.status(201).json(learningQuestion(index, id));
  });
  router.post("/questions/:id/answer", (req, res) => {
    const input = learningAnswerSchema.parse(req.body);
    const row = db
      .prepare("SELECT scenario,feedback FROM learning_questions WHERE id=?")
      .get(req.params.id) as
      { scenario: number; feedback: string | null } | undefined;
    if (!row)
      return void res.status(404).json({ error: "Lesson exercise not found." });
    if (row.feedback) return void res.json(JSON.parse(row.feedback));
    const feedback = gradeLearning(row.scenario, input);
    db.prepare(
      "UPDATE learning_questions SET answer=?,feedback=?,answered_at=? WHERE id=? AND feedback IS NULL",
    ).run(
      JSON.stringify(input),
      JSON.stringify(feedback),
      new Date().toISOString(),
      req.params.id,
    );
    res.json(feedback);
  });
  router.get("/progress", (_req, res) => {
    const rows = db
      .prepare(
        "SELECT scenario,feedback,answered_at FROM learning_questions WHERE feedback IS NOT NULL ORDER BY answered_at DESC",
      )
      .all() as { scenario: number; feedback: string; answered_at: string }[];
    const results = rows.map((r) => ({
      q: learningScenarios[r.scenario],
      f: JSON.parse(r.feedback) as LearningFeedback,
      date: r.answered_at,
    }));
    const transfers = results.filter((r) => r.q.stage === "Transfer");
    const progress: LearningProgress = {
      attempts: results.length,
      decisionsCorrect: results.filter((r) => r.f.actionCorrect).length,
      reasonsCorrect: results.filter((r) => r.f.reasonCorrect).length,
      transferAttempts: transfers.length,
      transferBothCorrect: transfers.filter(
        (r) => r.f.actionCorrect && r.f.reasonCorrect,
      ).length,
      recent: results
        .slice(0, 8)
        .map((r) => ({
          date: r.date,
          title: r.q.title,
          stage: r.q.stage,
          actionCorrect: r.f.actionCorrect,
          reasonCorrect: r.f.reasonCorrect,
        })),
    };
    res.json(progress);
  });
  return router;
}
