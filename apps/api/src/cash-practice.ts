import { Router } from "express";
import type Database from "better-sqlite3";
import { randomBytes, randomInt, randomUUID } from "node:crypto";
import { z } from "zod";
import {
  cashAnswerSchema,
  cashCreateSchema,
  cashHintSchema,
  cashSkills,
  type CashAnswer,
  type CashDrillSpecification,
  type CashDrillView,
  type CashFeedback,
  type CashPhase,
  type CashProgress,
  type CashSkill,
} from "../../../packages/shared/src/cash-practice";
import {
  generateCashDrill,
  gradeCashQuestion,
  cashHint,
  cashSkillLabels,
  cashSkillCues,
} from "../../../packages/poker/src/cash-practice";

type DrillRow = {
  id: string;
  created_at: string;
  selection_reason: string;
  specification: string;
};
type AnswerRow = {
  drill_id: string;
  phase: CashPhase;
  answer: string;
  feedback: string;
  answered_at: string;
};
type Observation = AnswerRow & { skill: CashSkill };

function drillRow(db: Database.Database, id: string): DrillRow | undefined {
  return db
    .prepare(
      "SELECT id,created_at,selection_reason,specification FROM cash_drills WHERE id=?",
    )
    .get(id) as DrillRow | undefined;
}

/** Explicit whitelist: private generation metadata and locked follow-ups never leave here. */
function drillView(db: Database.Database, row: DrillRow): CashDrillView {
  const spec = JSON.parse(row.specification) as CashDrillSpecification;
  const records = db
    .prepare(
      "SELECT drill_id,phase,answer,feedback,answered_at FROM cash_answers WHERE drill_id=?",
    )
    .all(row.id) as AnswerRow[];
  const answers: CashDrillView["answers"] = {};
  const feedback: CashDrillView["feedback"] = {};
  for (const record of records) {
    answers[record.phase] = JSON.parse(record.answer) as CashAnswer;
    feedback[record.phase] = JSON.parse(record.feedback) as CashFeedback;
  }
  const hints = db
    .prepare("SELECT phase FROM cash_hints WHERE drill_id=? ORDER BY seen_at")
    .all(row.id) as { phase: CashPhase }[];
  return {
    id: row.id,
    createdAt: row.created_at,
    selectionReason: row.selection_reason,
    initial: spec.initial,
    transfer: answers.initial ? spec.transfer : null,
    answers,
    feedback,
    // Assistance describes the attempt, not a hint viewed after its immutable answer.
    assisted: hints
      .filter(({ phase }) => !feedback[phase] || feedback[phase]!.assisted)
      .map(({ phase }) => phase),
  };
}

export function cashDrillExport(db: Database.Database): CashDrillView[] {
  return (
    db
      .prepare(
        "SELECT id,created_at,selection_reason,specification FROM cash_drills ORDER BY created_at",
      )
      .all() as DrillRow[]
  ).map((row) => drillView(db, row));
}

function observations(db: Database.Database): Observation[] {
  return db
    .prepare(
      "SELECT a.*,d.skill FROM cash_answers a JOIN cash_drills d ON d.id=a.drill_id ORDER BY a.answered_at DESC,a.rowid DESC",
    )
    .all() as Observation[];
}

function eligibleSkills(players: number): CashSkill[] {
  return cashSkills.filter(
    (skill) => players !== 2 || skill !== "multiway-call",
  );
}

function priorities(rows: Observation[]): Record<CashSkill, number> {
  const result = Object.fromEntries(
    cashSkills.map((skill) => [skill, 0]),
  ) as Record<CashSkill, number>;
  const independent = rows
    .filter(
      (row) =>
        row.phase === "initial" &&
        !(JSON.parse(row.feedback) as CashFeedback).assisted,
    )
    .slice(0, 40);
  for (const row of independent) {
    const feedback = JSON.parse(row.feedback) as CashFeedback;
    const answer = JSON.parse(row.answer) as CashAnswer;
    if (!feedback.correct) {
      result[row.skill] +=
        (!feedback.actionCorrect ? 2 : 0) +
        (!feedback.reasonCorrect ? 1 : 0) +
        (!feedback.estimateCorrect ? 1 : 0) +
        (answer.confidence === "very-sure" ? 2 : 0);
    }
  }
  return result;
}

function cashProgress(db: Database.Database, players: number): CashProgress {
  const rows = observations(db);
  const initial = rows.filter((row) => row.phase === "initial");
  const independent = initial.filter(
    (row) => !(JSON.parse(row.feedback) as CashFeedback).assisted,
  );
  const transfers = rows.filter((row) => row.phase === "transfer");
  const priority = priorities(rows);
  const eligible = eligibleSkills(players);
  const ordered = [...eligible].sort((a, b) => priority[b] - priority[a]);
  const recommendedSkill = priority[ordered[0]] > 0 ? ordered[0] : null;
  const correct = (row: Observation) =>
    (JSON.parse(row.feedback) as CashFeedback).correct;
  return {
    attempts: initial.length,
    independentAttempts: independent.length,
    independentCorrect: independent.filter(correct).length,
    assistedAttempts: initial.length - independent.length,
    transferAttempts: transfers.length,
    transferCorrect: transfers.filter(correct).length,
    highConfidenceMistakes: independent.filter(
      (row) =>
        !correct(row) &&
        (JSON.parse(row.answer) as CashAnswer).confidence === "very-sure",
    ).length,
    recommendedSkill,
    nextSessionCue: recommendedSkill
      ? cashSkillCues[recommendedSkill]
      : "Before your next session, name the active players, price, and plausible range before choosing a river action.",
    skills: cashSkills.map((skill) => {
      const attempts = initial.filter((row) => row.skill === skill);
      const fresh = independent.filter((row) => row.skill === skill);
      const guided = transfers.filter((row) => row.skill === skill);
      const feedback = fresh.map(
        (row) => JSON.parse(row.feedback) as CashFeedback,
      );
      return {
        skill,
        label: cashSkillLabels[skill],
        attempts: attempts.length,
        independentAttempts: fresh.length,
        independentCorrect: fresh.filter(correct).length,
        assistedAttempts: attempts.length - fresh.length,
        actionMistakes: feedback.filter((f) => !f.actionCorrect).length,
        reasonMistakes: feedback.filter((f) => !f.reasonCorrect).length,
        estimateMeanErrorPp: feedback.length
          ? feedback.reduce((sum, f) => sum + f.estimateErrorPp, 0) /
            feedback.length
          : null,
        transferAttempts: guided.length,
        transferCorrect: guided.filter(correct).length,
        reviewPriority: priority[skill],
        nextCue: cashSkillCues[skill],
      };
    }),
    recent: initial.slice(0, 12).map((row) => {
      const f = JSON.parse(row.feedback) as CashFeedback;
      const a = JSON.parse(row.answer) as CashAnswer;
      return {
        id: row.drill_id,
        date: row.answered_at,
        skill: row.skill,
        label: cashSkillLabels[row.skill],
        assisted: f.assisted,
        confidence: a.confidence,
        correct: f.correct,
        actionCorrect: f.actionCorrect,
        reasonCorrect: f.reasonCorrect,
        estimateErrorPp: f.estimateErrorPp,
      };
    }),
  };
}

function selectSkill(
  db: Database.Database,
  players: number,
): { skill: CashSkill; selectionReason: string } {
  const skills = eligibleSkills(players);
  const priority = priorities(observations(db));
  // One quarter of automatic drills deliberately explores; the rest weights recent independent misses.
  const explore =
    randomInt(4) === 0 || skills.every((skill) => priority[skill] === 0);
  if (explore)
    return {
      skill: skills[randomInt(skills.length)],
      selectionReason:
        "A fresh skill mix for this table size. Guided and hinted attempts do not drive the independent-mistake priority.",
    };
  const weights = skills.map((skill) => 1 + priority[skill]);
  let pick = randomInt(weights.reduce((sum, weight) => sum + weight, 0));
  let selected = skills[skills.length - 1];
  for (let i = 0; i < skills.length; i++) {
    pick -= weights[i];
    if (pick < 0) {
      selected = skills[i];
      break;
    }
  }
  return {
    skill: selected,
    selectionReason:
      priority[selected] > 0
        ? `Fresh ${cashSkillLabels[selected].toLowerCase()} practice, weighted toward recent independent mistakes, especially confident misses.`
        : "A fresh variation to keep other river skills in the practice mix.",
  };
}

export function cashPracticeRoutes(db: Database.Database) {
  const router = Router();
  router.get("/progress", (req, res) => {
    const { players } = z
      .object({ players: z.coerce.number().int().min(2).max(9).default(9) })
      .strict()
      .parse(req.query);
    res.json(cashProgress(db, players));
  });
  router.post("/drills", (req, res) => {
    const input = cashCreateSchema.parse(req.body);
    if (input.players === 2 && input.skill === "multiway-call")
      return void res
        .status(400)
        .json({ error: "Multiway practice needs at least three seats." });
    const selected = input.skill
      ? {
          skill: input.skill,
          selectionReason: `Fresh ${cashSkillLabels[input.skill].toLowerCase()} practice chosen by you.`,
        }
      : selectSkill(db, input.players);
    const recentRows = db
      .prepare(
        "SELECT fingerprint FROM cash_drills ORDER BY created_at DESC,rowid DESC LIMIT 20",
      )
      .all() as { fingerprint: string }[];
    const recent = new Set(recentRows.map((row) => row.fingerprint));
    let spec: CashDrillSpecification | undefined;
    for (let attempt = 0; attempt < 32; attempt++) {
      const candidate = generateCashDrill(
        randomBytes(4).readUInt32LE(),
        input.players,
        selected.skill,
      );
      if (!recent.has(candidate.fingerprint)) {
        spec = candidate;
        break;
      }
    }
    if (!spec)
      return void res
        .status(503)
        .json({
          error: "Unable to find a fresh variation. Please try another skill.",
        });
    const row: DrillRow = {
      id: randomUUID(),
      created_at: new Date().toISOString(),
      selection_reason: selected.selectionReason,
      specification: JSON.stringify(spec),
    };
    db.transaction(() => {
      db.prepare(
        "INSERT INTO cash_drills(id,created_at,players,skill,specification,selection_reason,fingerprint) VALUES(?,?,?,?,?,?,?)",
      ).run(
        row.id,
        row.created_at,
        input.players,
        selected.skill,
        row.specification,
        row.selection_reason,
        spec.fingerprint,
      );
    })();
    res.status(201).json(drillView(db, row));
  });
  router.get("/drills/:id", (req, res) => {
    const row = drillRow(db, req.params.id);
    if (!row)
      return void res.status(404).json({ error: "Cash practice not found." });
    res.json(drillView(db, row));
  });
  router.post("/drills/:id/hint", (req, res) => {
    const { phase } = cashHintSchema.parse(req.body);
    const result = db.transaction(() => {
      const row = drillRow(db, req.params.id);
      if (!row)
        return { status: 404, body: { error: "Cash practice not found." } };
      const answered = db
        .prepare(
          "SELECT 1 FROM cash_answers WHERE drill_id=? AND phase='initial'",
        )
        .get(row.id);
      if (phase === "transfer" && !answered)
        return {
          status: 409,
          body: {
            error: "Answer the initial decision before the guided follow-up.",
          },
        };
      db.prepare(
        "INSERT OR IGNORE INTO cash_hints(drill_id,phase,seen_at) VALUES(?,?,?)",
      ).run(row.id, phase, new Date().toISOString());
      const spec = JSON.parse(row.specification) as CashDrillSpecification;
      return { status: 200, body: { hint: cashHint(spec[phase]) } };
    })();
    res.status(result.status).json(result.body);
  });
  router.post("/drills/:id/answer", (req, res) => {
    const input = cashAnswerSchema.parse(req.body);
    const result = db.transaction(() => {
      const row = drillRow(db, req.params.id);
      if (!row)
        return { status: 404, body: { error: "Cash practice not found." } };
      const existing = db
        .prepare("SELECT 1 FROM cash_answers WHERE drill_id=? AND phase=?")
        .get(row.id, input.phase);
      if (existing) return { status: 200, body: drillView(db, row) };
      if (
        input.phase === "transfer" &&
        !db
          .prepare(
            "SELECT 1 FROM cash_answers WHERE drill_id=? AND phase='initial'",
          )
          .get(row.id)
      )
        return {
          status: 409,
          body: {
            error: "Answer the initial decision before the guided follow-up.",
          },
        };
      const spec = JSON.parse(row.specification) as CashDrillSpecification;
      const question = spec[input.phase];
      if (
        !question.options.some((option) => option.action === input.action) ||
        !question.reasons.some((reason) => reason.id === input.reasonId)
      )
        return {
          status: 400,
          body: {
            error: "Choose an action and reason offered for this decision.",
          },
        };
      const assisted = !!db
        .prepare("SELECT 1 FROM cash_hints WHERE drill_id=? AND phase=?")
        .get(row.id, input.phase);
      const feedback = gradeCashQuestion(question, input, assisted);
      db.prepare(
        "INSERT INTO cash_answers(drill_id,phase,answer,feedback,answered_at) VALUES(?,?,?,?,?)",
      ).run(
        row.id,
        input.phase,
        JSON.stringify(input),
        JSON.stringify(feedback),
        new Date().toISOString(),
      );
      return { status: 200, body: drillView(db, row) };
    })();
    res.status(result.status).json(result.body);
  });
  return router;
}
