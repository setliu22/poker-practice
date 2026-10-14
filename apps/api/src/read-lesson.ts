import { Router } from "express";
import type Database from "better-sqlite3";
import { randomBytes, randomUUID } from "node:crypto";
import { z } from "zod";
import {
  readQuestion,
  gradeRead,
} from "../../../packages/poker/src/read-lesson";
import {
  readAnswerSchema,
  type ReadQuestion,
  type ReadFeedback,
  type ReadProgress,
  type ReadStep,
} from "../../../packages/shared/src/read-lesson";
import {
  generateDecision,
  selectDecisionSkill,
  type RecentDecision,
} from "../../../packages/poker/src/decision-generator";
const steps: ReadStep[] = ["range", "cards", "decision"];
export function readLessonRoutes(db: Database.Database) {
  const router = Router();
  function completed(id: string) {
    return Object.fromEntries(
      (
        db
          .prepare(
            "SELECT step,feedback FROM read_lesson_answers WHERE lesson_id=?",
          )
          .all(id) as { step: string; feedback: string }[]
      ).map((r) => [r.step, JSON.parse(r.feedback)]),
    ) as ReadQuestion["completed"];
  }
  function savedQuestion(id: string, variant: number): ReadQuestion {
    const saved = db
      .prepare(
        "SELECT specification FROM generated_decisions WHERE lesson_id=?",
      )
      .get(id) as { specification: string } | undefined;
    if (saved)
      return {
        ...JSON.parse(saved.specification),
        id,
        completed: completed(id),
      };
    return readQuestion(variant, id, completed(id));
  }
  router.post("/", (req, res) => {
    const input = z
      .object({
        variant: z.number().int().min(0).max(1001).optional(),
        repeatId: z.string().uuid().optional(),
      })
      .strict()
      .parse(req.body);
    if (input.variant !== undefined && input.repeatId)
      throw new Error("Choose a legacy variant or a repeat, not both.");
    const id = randomUUID();
    let q: ReadQuestion;
    if (input.repeatId) {
      const original = db
        .prepare("SELECT variant FROM read_lessons WHERE id=?")
        .get(input.repeatId) as { variant: number } | undefined;
      if (!original)
        return void res.status(404).json({ error: "Practice not found." });
      q = {
        ...savedQuestion(input.repeatId, original.variant),
        id,
        completed: {},
      };
    } else if (input.variant !== undefined) q = readQuestion(input.variant, id);
    else {
      const recent = db
        .prepare(
          "SELECT g.specification, a.feedback FROM read_lesson_answers a JOIN generated_decisions g ON g.lesson_id=a.lesson_id WHERE a.step='decision' ORDER BY a.answered_at DESC LIMIT 24",
        )
        .all() as { specification: string; feedback: string }[];
      const observations: RecentDecision[] = recent.map((row) => ({
        ...JSON.parse(row.feedback),
        skill: JSON.parse(row.specification).skill,
      }));
      const seed = randomBytes(4).readUInt32LE();
      const selected = selectDecisionSkill(
        randomBytes(4).readUInt32LE(),
        observations,
      );
      q = generateDecision(seed, selected.skill, id, selected.selectionReason);
    }
    db.transaction(() => {
      db.prepare("INSERT INTO read_lessons VALUES(?,?,?)").run(
        id,
        q.variant,
        new Date().toISOString(),
      );
      if (q.generatorVersion)
        db.prepare("INSERT INTO generated_decisions VALUES(?,?)").run(
          id,
          JSON.stringify(q),
        );
    })();
    res.status(201).json(q);
  });
  router.get("/progress", (_req, res) => {
    const rows = db
      .prepare("SELECT step,feedback FROM read_lesson_answers")
      .all() as { step: ReadStep; feedback: string }[];
    const parsed = rows.map((r) => ({
      step: r.step,
      f: JSON.parse(r.feedback) as ReadFeedback,
    }));
    const group = (step: ReadStep) =>
        parsed.filter((r) => r.step === step).map((r) => r.f),
      ranges = group("range"),
      cards = group("cards"),
      decisions = group("decision");
    const mean = (fs: ReadFeedback[]) => {
      const errors = fs
        .map((f) => f.errorPp)
        .filter(
          (n): n is number => typeof n === "number" && Number.isFinite(n),
        );
      return errors.length
        ? errors.reduce((sum, n) => sum + n, 0) / errors.length
        : null;
    };
    const p: ReadProgress = {
      completed: decisions.length,
      rangeError: mean(ranges),
      equityError: mean(decisions),
      cardAccuracy: cards.length ? 100 - mean(cards)! : null,
      decisionsCorrect: decisions.filter((f) => f.actionCorrect).length,
      reasonsCorrect: decisions.filter((f) => f.reasonCorrect).length,
    };
    res.json(p);
  });
  router.get("/:id", (req, res) => {
    const r = db
      .prepare("SELECT variant FROM read_lessons WHERE id=?")
      .get(req.params.id) as { variant: number } | undefined;
    if (!r) return void res.status(404).json({ error: "Lesson not found." });
    res.json(savedQuestion(req.params.id, r.variant));
  });
  router.post("/:id/retry-answer", (req, res) => {
    const input = readAnswerSchema.parse(req.body);
    const lesson = db
      .prepare("SELECT variant FROM read_lessons WHERE id=?")
      .get(req.params.id) as { variant: number } | undefined;
    if (!lesson)
      return void res.status(404).json({ error: "Lesson not found." });
    if (!completed(req.params.id)[input.step])
      return void res
        .status(409)
        .json({ error: "Submit this section once before retrying it." });
    // Rehearsal gives fresh feedback without overwriting the recorded first attempt.
    res.json(
      gradeRead(
        lesson.variant,
        input,
        savedQuestion(req.params.id, lesson.variant),
      ),
    );
  });
  router.post("/:id/answer", (req, res) => {
    const input = readAnswerSchema.parse(req.body),
      r = db
        .prepare("SELECT variant FROM read_lessons WHERE id=?")
        .get(req.params.id) as { variant: number } | undefined;
    if (!r) return void res.status(404).json({ error: "Lesson not found." });
    const done = completed(req.params.id);
    if (done[input.step]) return void res.json(done[input.step]);
    const previous =
      r.variant >= 2 ? [] : steps.slice(0, steps.indexOf(input.step));
    if (previous.some((s) => !done[s]))
      return void res
        .status(409)
        .json({ error: "Complete the earlier lesson steps first." });
    const f = gradeRead(
      r.variant,
      input,
      savedQuestion(req.params.id, r.variant),
    );
    db.prepare("INSERT INTO read_lesson_answers VALUES(?,?,?,?,?)").run(
      req.params.id,
      input.step,
      JSON.stringify(input),
      JSON.stringify(f),
      new Date().toISOString(),
    );
    res.json(f);
  });
  return router;
}
