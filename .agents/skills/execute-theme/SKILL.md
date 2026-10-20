---
name: execute-theme
description: Supervise implementation of one theme in docs/themes through its issues, with delegated implementation, review, and a final audit. Use when asked to execute a theme to completion, including under /goal.
---

# Execute Theme

You supervise one theme to completion. You coordinate scope, order, decisions, and acceptance. A Sol worker implements by default; honor explicit worker or reviewer choices. Do not start when the user only wants to discuss or edit the theme or this skill.

## Inputs

- The theme document is the specification. Do not edit it. Record its hash at the start and confirm it is unchanged at the end, except for user edits.
- Member issues are those named in the theme's Scope or Layers and those whose `theme` frontmatter matches the theme stem. Issues in `open/` are the work, `closed/` is done, and `parked/` stays out unless the user includes it. Non-goals are exclusions.
- Resolve ordinary choices from the theme, issues, and repository conventions. Ask about contradictions or consequential gaps, and continue independent work meanwhile. Never weaken a theme rule or criterion to close an issue.
- Publishing, merging, releases, GitHub issues, and edits to external repositories need explicit authorization from the user.

## Execution state

Keep run state in `.agent-runs/<theme-stem>/run.md`, which Git ignores: base revision, theme hash, issue order, current assignment and worker handles, blockers, and decisions. Never commit worker names, session or pane identifiers, or resume handles (AGENTS.md).

## Prepare

1. Map every theme rule and criterion to a member issue. File missing issues in the repository format, run the formatter, and commit them on their own before delegating.
2. Split issues that hold independently verifiable outcomes. Record a split or scope change in the issue, and link a superseded issue to its replacement.
3. Order the issues from Layers or Scope and their dependencies. Record the order in the run file, not in the issues.

## Delegate each issue

Read `supervise-agents` and `review` from the session's skill catalog before first use and follow their lifecycle rules. If either is unavailable, report the blocker instead of substituting another workflow. Do not use `handle-issue` as the coordinator.

1. Assign one ready issue per worker. The prompt names the role (implementation worker, not supervisor), the issue path, the relevant theme sections, earlier decisions, and implementation-and-review mode. Tell the worker to include behavior and type tests, preserve unrelated work, and make reviewable commits. If validation needs a non-host runtime, pass an already verified selection command.
2. On `ISSUE_DONE`, inspect the artifacts and record the head. Run `$review` with the worker identity, baseline, head, and evidence while implementation edits stay stopped. Route corrections to the same worker. Do not run a competing review yourself.
3. After verifying the acceptance evidence, move the issue to `docs/issues/closed/` with its implementation commit, update the run file, and finish the worker.

Run dependent issues sequentially. Parallelize only with independent ownership.

## Resume

Reconcile the run file with commits, issue locations, and live sessions. A stale status is not proof that a worker stopped. Reattach to recorded workers instead of starting duplicates. Under an existing goal, do not create a second goal or narrow it.

## Completion audit

- Every theme criterion has direct evidence from a closed issue. An issue left in `open/` means the theme is incomplete unless the user accepted the deferral.
- `vp run ready` passes on the final state. Rerun checks after relevant changes rather than trusting a bare "passed".
- Consumer-visible CLI behavior is proven with `.cursor/skills/verify-hacksh/SKILL.md`. Do not claim an environment you could not test.
- A review covers the full change from the base revision. If none exists, delegate an integration task in implementation-and-review mode.
- The theme document is unchanged.

Report the outcome, the evidence, and remaining limitations. Unmet criteria are unfinished work. Mark an active goal complete only after this audit passes.
