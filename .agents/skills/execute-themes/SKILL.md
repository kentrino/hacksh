---
name: execute-themes
description: Execute several themes in order under one goal. Each theme is delegated to a fresh Astra supervisor running execute-theme; between themes the goal session improves AGENTS.md, rules, and skills from that theme's retrospective. Use for `/goal execute-themes theme1 theme2 ...`.
---

# Execute Themes

The goal session (this parent) owns the goal across all listed themes. It does not implement, review, or supervise issues, and it does not hold theme context. Each theme runs in its own Astra supervisor using `$execute-theme`. Between themes, the parent turns the finished theme's retrospective into improvements to the repository's agent instructions so the next theme runs better.

Usage: `/goal execute-themes docs/themes/a.md docs/themes/b.md`. Keep the theme order given by the user. Themes run sequentially in the current checkout.

## Context boundary

The parent may read:

- Theme paths, file hashes, and git metadata (commits, status, diff stats).
- Repository agent instructions: `AGENTS.md`, `.cursor/rules/`, `.agents/skills/`, `.cursor/skills/`.
- Each supervisor's completion report and retrospective.
- Mechanical checks on the theme's issues (which state directory they are in), not their bodies.

The parent does not read theme bodies, issue bodies, or implementation diffs, and does not forward their content between supervisors. A later theme's supervisor reads its own theme itself. Use `supervise-agents` for the CLI lifecycle; resolve its SKILL.md from the session's skill catalog and read it before first use.

## Per-theme loop

For each theme in order:

1. Record the theme's path and hash and the current HEAD in `.agent-runs/<theme-stem>/run.md`. Confirm the working tree has no uncommitted changes from an earlier theme; unrelated user changes stay untouched.
2. Start a fresh supervisor:
   `agent-delegate workspace . --slug theme-<theme-stem> --kind astra`.
   Capture its agentName and paneId in the run file. Fill [supervisor-prompt.md](supervisor-prompt.md)
   with the theme path, the theme stem, and the paths of previous retrospectives,
   write it to a temporary file, and send it with
   `agent-delegate prompt FILE --path . --agent AGENT_NAME --kind astra`
   (without `--wait`).
3. Wait with
   `agent-delegate wait-blocked --kind astra --agent AGENT_NAME --until blocked,idle,done --timeout 5m`,
   then read `herdr pane read PANE_ID --source recent-unwrapped --lines 200`.
   Repeat while it works. Idle is not completion; only `THEME_DONE` or
   `THEME_BLOCKED` ends the loop.
4. Answer `CODEX_ASK:` with another prompt to the same agent. Answer from the
   goal, repository instructions, previous retrospectives, and any excerpt the
   supervisor quoted in its question. Do not open the theme to answer. If the
   question needs a product or design decision those sources do not settle, ask
   the human and relay the answer verbatim.
5. On `THEME_DONE`, verify mechanically before accepting:
   - The theme's hash is unchanged, unless the user edited it during the run.
   - Every issue named in the theme's Scope or Layers is under
     `docs/issues/closed/`. Treat an exception named in the supervisor's report
     as a failed check unless the user accepted the deferral during the run.
   - The working tree holds no leftover changes from the supervisor, and the
     reported commits exist.
   - The retrospective file exists in the run directory.
     If a check fails, send the failure to the same supervisor and keep waiting.
     Then run `agent-delegate finish --path . --agent AGENT_NAME`.
6. On `THEME_BLOCKED`, resolve the blocker with the human if possible and send
   the answer to the same supervisor. If it cannot be resolved, stop the loop and
   report the blocked state without starting later themes. Ask before skipping a
   theme; later themes may depend on it.
7. Improve the instructions (below), then move on to the next theme.

## Improve between themes

Read the finished theme's retrospective and decide which findings should change
the instructions. Make the change only when the finding:

- Recurred, cost meaningful rework or review rounds, or left a question that
  the instructions should have answered.
- Generalizes beyond this theme. Do not record theme-specific facts, file lists,
  or decisions in instructions; those belong in the theme's issues.

Choose the narrowest home:

- `AGENTS.md`: repository-wide conventions, commands, and constraints that every
  agent needs. Keep it short.
- `.cursor/rules/*.mdc`: guidance scoped to file globs or a topic.
- `.agents/skills/execute-theme/SKILL.md` or this skill: workflow problems in
  coverage, delegation, review, evidence, or this loop.

Edit existing text rather than appending duplicates. Remove or tighten guidance
the retrospective shows was wrong or ignored, instead of adding a second rule
that contradicts it. Never weaken acceptance, review, or evidence requirements
to make work pass faster. Proposed changes to skills outside this repository
(`supervise-agents`, `review`, and others) are reported to the user, not applied.

Commit the instruction changes on their own, for example
`docs(agents): <what changed>`, and add the commit ID to the retrospective's
`Applied` section. The retrospective stays in the Git-ignored run directory;
only the instruction changes are committed. When no change is warranted, record
that and why in the same section. The next supervisor starts fresh and therefore
reads the updated instructions.

## Resume

Supervisor names are deterministic (`theme-<theme-stem>`) and `agent-delegate`
records their sessions, so there is no separate run ledger beyond the run
directory. On resumption, derive progress from each theme's issue locations and
retrospective: a theme whose completion checks pass and whose retrospective has
an `Applied` section is finished. Reattach to a live or recorded supervisor
through the same agent name rather than starting a duplicate. Follow
`supervise-agents` for missing panes.

## Completion

The goal is complete only when every listed theme passed its completion checks
and its improvement step was recorded. Report, per theme: the outcome, the
supervisor's validation summary, the instruction changes applied (with commit
IDs), and proposals for external skills. Do not create additional goals or
narrow the goal to the themes that succeeded.
