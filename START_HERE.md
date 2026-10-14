# Start here: agent working agreement

Tell any coding LLM: **“Read `START_HERE.md`, inspect the current repo, and follow its workflow for this task: …”**

You are working on Poker Practice, a local TypeScript learning app. Use one lead agent (the **head chef**) to own the outcome, coordinate scoped workers, integrate changes, and maintain the handoff. These instructions work with any provider; they require no agent SDK in the application.

## Bootstrap every substantive task

1. Read [AGENTS.md](AGENTS.md) for project rules, then [PLAN.md](PLAN.md) and [PROGRESS.md](PROGRESS.md) for the current objective and handoff. Read [VERIFY.md](VERIFY.md) for checks relevant to the task.
2. Inspect `git status --short`, `git branch --show-current`, `git log -1 --oneline`, and the actual files involved. A handoff is a guide, not proof that the working tree is unchanged. Preserve existing user work.
3. Reconcile the user's latest request with unfinished work. Continue the current objective unless the user replaces it. For a new objective, replace the active plan and summarize the old handoff before starting.
4. Record the outcome, acceptance criteria, dependencies, file ownership, and verification in `PLAN.md`. Do this before delegating or making substantial edits.
5. Follow **plan → build → independent review and functional verification → fix → integrate → handoff**. Read [the system design](docs/agent-workflow.md) when coordinating multiple agents or changing this workflow.

## Lead and worker contract

- The lead owns `PLAN.md`, `PROGRESS.md`, integration, commits, and any user-authorized publication. A worker edits only assigned files and returns evidence; it does not rewrite the plan or publish.
- Use separate builders, a code reviewer, and a functional tester for substantial changes when agent tools are available. This agreement explicitly requests scoped delegation in those environments. Use fresh task context when supported: the task, relevant files/contracts, constraints, and acceptance criteria.
- Run builders in parallel only with disjoint file ownership and satisfied dependencies. Shared schemas, `apps/api/src/app.ts`, and `apps/web/src/BotPractice.tsx` need one owner at a time. Agree on contracts before dependent implementation.
- Reviewers inspect the final diff independently. Testers exercise actual behavior and report commands/results and gaps. Resolve findings and recheck affected behavior before calling the task done.
- If delegation is unavailable, perform the phases sequentially and label review **self-review**. Never invent workers, independent review, test passes, or tool permissions.
- For a small, reversible edit, use a short plan and proportionate checks. Do not create a large team or redundant tests for a typo.
- Every spawned worker needs an assigned ticket, role and file scope. Capture its result, release its ownership, and retire it when the task is complete; do not keep unused or unassigned workers. Check the live roster before handoff. Use close/delete tools when available; otherwise stop unnecessary running work and report that deleting displayed agent entries is unavailable.

## Finish or hand off

Update `PLAN.md` statuses and leave `PROGRESS.md` with the current branch/commit and dirty-tree description, completed work, important decisions, exact verification evidence, open issues, and the next concrete action. Update it at meaningful milestones and before ending a session or losing context. Keep it a concise current handoff, not a transcript.

Report what changed, what actually passed, and what remains. When publication is requested, inspect staged contents, preserve ignored local databases/builds/secrets, then publish through an authenticated tool and verify the remote commit. User authorization still governs external writes; this file does not grant blanket permission to publish future work.
