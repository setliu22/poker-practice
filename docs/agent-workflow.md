# Head-chef agent workflow

The goal is reliable delivery and resumable work across LLMs. One lead agent owns the user's outcome. Bounded workers implement separate tasks; independent reviewers inspect the result; functional testers check behavior. Durable files connect sessions. Start at [START_HERE.md](../START_HERE.md).

This design draws on [Sarah Chieng's multiagent workflows](https://sarahchieng.com/multiagent-workflows) and [OpenAI's AGENTS.md guidance](https://learn.chatgpt.com/docs/agent-configuration/agents-md). It adopts scoped delegation and persistent handoffs as project conventions. Markdown does not enforce tool permissions, spawn agents by itself, or add an LLM to Poker Practice's runtime. A delegation-only lead would require a separately configured orchestrator; here the lead may inspect, integrate, verify, and publish within the user's authorization.

## System and durable state

```text
User outcome
     |
Lead / head chef ---- PLAN.md: task queue and acceptance
     |               PROGRESS.md: current handoff and evidence
     |
     +--> Builder(s): bounded files, explicit contracts
     |         |
     +--> Independent reviewer: final diff and invariants
     +--> Functional tester: behavior and meaningful checks
               |
          Findings -> scoped fixes -> affected rechecks
               |
          Lead integration -> authorized delivery -> handoff
```

| File                     | Responsibility                                                         | Update policy                           |
| ------------------------ | ---------------------------------------------------------------------- | --------------------------------------- |
| `START_HERE.md`          | Portable bootstrap and working agreement                               | Change when the workflow changes        |
| `AGENTS.md`              | Tool-discoverable entrypoint, module map, invariants                   | Change with durable project constraints |
| `PLAN.md`                | Current outcome, dependencies, ownership, statuses, definition of done | Lead at task start and milestones       |
| `PROGRESS.md`            | State, decisions, evidence, gaps, next concrete action                 | Lead at milestones and every handoff    |
| `VERIFY.md`              | Commands, prerequisites and expected checks                            | Change when tooling/contracts change    |
| `docs/agent-workflow.md` | Coordination design and reusable ticket contracts                      | Change when strategy changes            |

The Git working tree and actual files are authoritative for state. The latest user instruction is authoritative for intent. Handoffs guide discovery; they cannot prove that a prior agent's claim is true. Reconcile stale handoffs with actual files before editing.

## Roles and ownership

**Lead:** understands the request, inspects existing work, defines done, chooses phases, allocates exclusive file ownership, manages dependencies, and decides whether the integrated result meets acceptance. Only the lead updates plan/progress, commits/integrates, and performs authorized external publication. It may temporarily delegate documentation ownership explicitly, then take it back.

**Builder:** implements a bounded ticket and returns changed files, behavior, evidence, and concerns. It must request an ownership expansion from the lead before touching another task's files. It neither commits the shared tree nor publishes. In a shared workspace, disjoint file ownership is mandatory; isolated worktrees can instead be integrated deliberately by the lead.

**Code reviewer:** gets the task acceptance, relevant design/constraints, and final diff; reads independently rather than accepting the builder's conclusion. Checks correctness, privacy, compatibility, and scope. Returns findings with severity, file/location, consequence and suggested verification. Prefer a reviewer who did not author the change.

**Functional tester:** checks acceptance against actual behavior and meaningful tests. For UI changes, checks desktop/mobile, keyboard/focus, and asynchronous error/stale behavior. It reports test state, exact commands, results and gaps; it does not rewrite files owned by a builder. Separate code review and functional evidence answer different questions.

When agent tools are unavailable, one agent performs these roles sequentially and records **self-review**, with executable/observable evidence. When only a few workers are available, schedule phases within that limit rather than running an imaginary larger team. Small prose edits need proportionate checks and may use this fallback without team overhead.

## Phases

1. **Discover and plan.** Read the bootstrap/handoff, inspect status/diffs and relevant contracts, separate existing work from new scope, and put measurable acceptance in the plan. Identify uncertainty before implementation.
2. **Set shared contracts.** Define schemas/API and semantic expectations before dependent work. Give shared hotspots one owner. Poker logic may require fixtures independently specified from the implementation.
3. **Build bounded tasks.** Send fresh context where supported. Parallelize only tasks whose inputs are ready and files do not overlap. If a dependency changes, stop dependent work and reconcile its ticket.
4. **Review and test.** Once relevant changes settle, run independent code review and functional verification against the integrated tree. Review/testing may run concurrently when they are read-only and their test ports/data do not conflict.
5. **Fix and recheck.** Lead assigns findings back to the responsible owner. Rerun the checks affected by those changes. Blocking findings remain open until resolved or explicitly reported as preventing completion.
6. **Integrate and deliver.** Lead examines the final diff/staged contents, records actual evidence, and performs user-authorized commits/publication. Verify the resulting remote state when publication was requested.
7. **Hand off.** Update plan statuses and progress. A new agent should be able to name the next action, what was tested, what remains uncertain, and which local work must be preserved.

Do not mark “done” merely because implementation exists or a test command was started. Definition of done includes acceptance evidence and requested delivery.

## Worker ticket template

Add a row to `PLAN.md` and give the worker this bounded brief:

```text
Task ID / role / owner:
Outcome and user-visible acceptance:
Dependencies and ready inputs:
Allowed write paths (exclusive ownership):
Read-only context and shared contracts:
Project invariants relevant to this task:
Verification commands or behavior to demonstrate:
Non-goals and known existing changes:
Return: files changed, behavior, evidence with tested state,
        findings/risks, and next action. Do not commit/publish.
```

Fresh context means enough information to succeed without a whole conversation dump. Provide specific file paths and excerpts/contracts rather than expecting workers to guess the task. If the tool only supports inherited context, still send a bounded brief and state that limitation honestly.

Worker return:

```text
Task ID and status: done / needs follow-up / blocked
Changed files and resulting behavior:
Evidence: command/check, tested state, pass/fail/skip, artifacts
Findings or unresolved dependencies:
Recommended next action:
```

Plan statuses mean **pending**, **ready**, **in progress**, **needs review**, **blocked** with a concrete dependency, or **done** with evidence. A failed credential for upload blocks publication while local work can continue.

## Poker Practice task boundaries

Typical feature phases are shared contracts/poker engine → API/persistence → UI integration → independent review and browsers. Engine and UI implementation can overlap only once their contracts are stable and ownership is disjoint. `packages/shared/`, `apps/api/src/app.ts`, and `apps/web/src/BotPractice.tsx` are common shared hotspots.

Acceptance must preserve the [AGENTS.md invariants](../AGENTS.md): hidden-card/runout isolation; seeded replay and saved-game compatibility; transaction/idempotency/revision rules; legal betting and chip conservation; honest conditional model claims; local/optional-solver boundaries; accessibility and provenance. Require only checks relevant to the actual change, with broader checks for integrated/full-tree deliveries.

The [GitHub verification workflow](../.github/workflows/verify.yml) makes unit/build and desktop/mobile checks executable on a fresh Linux runner after publication. Its existence does not establish a successful run. The lead records observed CI status and treats optional real-solver coverage separately.

## Handoff and recovery

Keep `PROGRESS.md` short enough to read at session start. Include the objective, branch/commit and dirty scope, important decisions, last successful and failed checks, open issues, and one next concrete action. Keep durable design in this document instead of repeating it in every log.

Before switching objectives, summarize the previous outcome or unfinished blocker. Archive a genuinely substantial old plan under `docs/` only when useful; do not grow a transcript for routine tasks. After interruption, inspect the actual tree, recover partial edits without discarding user work, update ownership/status, and resume the next dependency-ready task.

Test evidence describes the state checked. New code can invalidate it; changed documentation alone does not invalidate checks of unchanged app code. Historical counts, cached screenshots, worker confidence, and a published commit are not substitutes for current behavior checks.
