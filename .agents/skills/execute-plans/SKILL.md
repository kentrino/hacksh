---
name: execute-plans
description: Execute several plans in order under one goal. Each plan is delegated to a fresh Astra supervisor running execute-plan; between plans the goal session improves AGENTS.md, rules, and skills from that plan's retrospective. Use for `/goal execute-plans plan1 plan2 ...`.
---

# Execute Plans

The goal session (this parent) owns the goal across all listed plans. It does
not implement, review, or supervise issues, and it does not hold plan context.
Each plan runs in its own Astra supervisor using `$execute-plan`. Between plans,
the parent turns the finished plan's retrospective into improvements to the
repository's agent instructions so the next plan runs better.

Usage: `/goal execute-plans docs/plan/a.md docs/plan/b.md`. Keep the plan order
given by the user. Plans run sequentially in the current checkout.

## Context boundary

The parent may read:

- Plan paths, file hashes, and git metadata (commits, status, diff stats).
- Repository agent instructions: `AGENTS.md`, `.cursor/rules/`, `.agents/skills/`.
- Each supervisor's completion report and retrospective.
- Mechanical checks on the plan's issues (status fields, unchecked boxes),
  not their bodies.

The parent does not read plan bodies, issue bodies, or implementation diffs, and
does not forward their content between supervisors. A later plan's supervisor
reads its own plan itself. Use `supervise-agents` for the CLI lifecycle; resolve
its SKILL.md from the session's skill catalog and read it before first use.

## Per-plan loop

For each plan in order:

1. Record the plan's path and hash, and the current HEAD. Confirm the working
   tree has no uncommitted changes from an earlier plan; unrelated user changes
   stay untouched.
2. Start a fresh supervisor:
   `agent-delegate workspace . --slug plan-<plan-stem> --kind astra`.
   Capture its agentName and paneId. Fill [supervisor-prompt.md](supervisor-prompt.md)
   with the plan path, the plan stem, and the paths of previous retrospectives,
   write it to a temporary file, and send it with
   `agent-delegate prompt FILE --path . --agent AGENT_NAME --kind astra`
   (without `--wait`).
3. Wait with
   `agent-delegate wait-blocked --kind astra --agent AGENT_NAME --until blocked,idle,done --timeout 5m`,
   then read `herdr pane read PANE_ID --source recent-unwrapped --lines 200`.
   Repeat while it works. Idle is not completion; only `PLAN_DONE` or
   `PLAN_BLOCKED` ends the loop.
4. Answer `CODEX_ASK:` with another prompt to the same agent. Answer from the
   goal, repository instructions, previous retrospectives, and any excerpt the
   supervisor quoted in its question. Do not open the plan to answer. If the
   question needs a product or design decision those sources do not settle, ask
   the human and relay the answer verbatim.
5. On `PLAN_DONE`, verify mechanically before accepting:
   - The plan's hash is unchanged, unless the user edited it during the run.
   - Every issue under `docs/issues/<plan-stem>/` has status `done` or
     `superseded`, and done issues contain no unchecked `- [ ]` criteria.
   - The working tree holds no leftover changes from the supervisor, and the
     reported commits exist.
   - The retrospective file exists.
     If a check fails, send the failure to the same supervisor and keep waiting.
     Then run `agent-delegate finish --path . --agent AGENT_NAME`.
6. On `PLAN_BLOCKED`, resolve the blocker with the human if possible and send
   the answer to the same supervisor. If it cannot be resolved, stop the loop and
   report the blocked state without starting later plans. Ask before skipping a
   plan; later plans may depend on it.
7. Improve the instructions (below), then move on to the next plan.

## Improve between plans

Read the finished plan's retrospective and decide which findings should change
the instructions. Make the change only when the finding:

- Recurred, cost meaningful rework or review rounds, or left a question that
  the instructions should have answered.
- Generalizes beyond this plan. Do not record plan-specific facts, file lists,
  or decisions in instructions; those belong in the plan's issues.

Choose the narrowest home:

- `AGENTS.md`: repository-wide conventions, commands, and constraints that every
  agent needs. Create it if absent. Keep it short.
- `.cursor/rules/*.mdc`: guidance scoped to file globs or a topic.
- `.agents/skills/execute-plan/SKILL.md` or this skill: workflow problems in
  decomposition, delegation, review, evidence, or this loop.

Edit existing text rather than appending duplicates. Remove or tighten guidance
the retrospective shows was wrong or ignored, instead of adding a second rule
that contradicts it. Never weaken acceptance, review, or evidence requirements
to make work pass faster. Proposed changes to skills outside this repository
(`supervise-agents`, `review`, and others) are reported to the user, not applied.

Commit the instruction changes on their own, for example
`docs(agents): <what changed>`, and add the commit ID to the retrospective's
`Applied` section in the same or a follow-up commit. When no change is
warranted, record that and why in the same section. The next supervisor starts
fresh and therefore reads the updated instructions.

## Resume

Supervisor names are deterministic (`plan-<plan-stem>`) and `agent-delegate`
records their sessions, so there is no separate run ledger. On resumption,
derive progress from each plan's issues and retrospective: a plan whose
completion checks pass and whose retrospective has an `Applied` section is
finished. Reattach to a live or recorded supervisor through the same agent name
rather than starting a duplicate. Follow `supervise-agents` for missing panes.

## Completion

The goal is complete only when every listed plan passed its completion checks
and its improvement step was recorded. Report, per plan: the outcome, the
supervisor's validation summary, the instruction changes applied (with commit
IDs), and proposals for external skills. Do not create additional goals or
narrow the goal to the plans that succeeded.
