---
name: complete-themes
description: Complete several themes in order under one goal. Each theme runs in a fresh Astra supervisor using complete-theme, and the goal session improves agent instructions from each retrospective. Use for `/goal complete-themes docs/themes/a.md docs/themes/b.md`.
---

# Complete Themes

You own the goal across the listed themes, in the given order, in the current checkout. You do not implement, review, or read theme bodies, issue bodies, or implementation diffs. Read `supervise-agents` from the skill catalog before first use.

## Per theme

1. Record the theme hash and HEAD in `.agent-runs/<theme-stem>/run.md`. Confirm no leftover changes from an earlier theme.
2. Start a supervisor with `agent-delegate workspace . --slug theme-<theme-stem> --kind astra`. Fill [supervisor-prompt.md](supervisor-prompt.md), write it to a temporary file, and send it with `agent-delegate prompt FILE --path . --agent AGENT_NAME --kind astra`.
3. Loop on `agent-delegate wait-blocked --kind astra --agent AGENT_NAME --until blocked,idle,done --timeout 5m` and `herdr pane read PANE_ID --source recent-unwrapped --lines 200`. Only `THEME_DONE` or `THEME_BLOCKED` ends the loop.
4. Answer `CODEX_ASK:` from the goal, repository instructions, earlier retrospectives, and the quoted excerpt. Relay product decisions to the human verbatim.
5. On `THEME_DONE`, check that the theme hash is unchanged, the theme's issues are in `docs/issues/closed/` unless the user accepted a deferral, the reported commits exist, the tree is clean, and the retrospective exists. Send failures back to the same supervisor. Then run `agent-delegate finish --path . --agent AGENT_NAME`.
6. On `THEME_BLOCKED`, resolve with the human or stop the loop. Ask before skipping a theme.

## Improve between themes

Change instructions only for findings that recurred or cost rework and that generalize beyond the theme. Use the narrowest home: `AGENTS.md`, `.cursor/rules/`, or these skills. Edit existing text instead of adding contradicting rules, and never weaken acceptance, review, or evidence requirements. Report proposals for external skills instead of applying them.

Commit instruction changes on their own (`docs(agents): ...`). Record the commit ID, or why nothing changed, under the retrospective's `Applied` heading.

## Resume and completion

A theme is finished when its checks pass and its retrospective has `Applied`. Reattach to `theme-<theme-stem>` instead of starting a duplicate.

The goal is complete when every theme is finished. Report each theme's outcome, validation summary, applied instruction commits, and external proposals.
