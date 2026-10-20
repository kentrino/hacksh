---
name: execute-theme
description: Supervise implementation of an existing theme through its issues, from coverage check and ordered delegation through review, corrections, and a final audit, while preserving the theme document. Use when asked to execute a theme to completion, including under /goal.
---

# Execute Theme

Own completion of one theme from `docs/themes/`. The supervisor coordinates scope, dependencies, design decisions, and acceptance. Delegate implementation, tests, and corrections to a Sol worker by default. Honor explicit worker or reviewer choices.

This skill executes a theme; it does not turn one into issues. Do not start execution when the user only wants to discuss, draft, or edit a theme or this skill.

## Source of truth

- The theme document is the specification. Read it, the repository instructions, the member issues, and the current implementation. Member issues are the issues named in the theme's Scope or Layers section and every issue under `docs/issues/` whose frontmatter `theme` matches the theme's filename stem. Open issues are remaining work, closed issues are done, and parked issues stay out unless the user includes them. The theme's Non-goals name the exclusions.
- Preserve the theme document. Record its hash and the base revision in the run file at the start so unchanged content can be verified at the end. Do not edit the theme to make work pass.
- Resolve ordinary implementation choices from the theme, the issues, and repository conventions. Ask about contradictions or consequential unspecified behavior that cannot be resolved from evidence, and continue independent work while awaiting the answer. Do not silently replace requirements with easier alternatives.
- Issues are working specifications and may become more specific, split, or merge as implementation reveals new information. Record the reason for a meaningful scope or acceptance change in the affected issue. Mark superseded issues and link their replacements instead of deleting their history. Never weaken a theme rule or criterion to close an issue.
- Default completion scope is local implementation, review, and verification. Publishing, merging, releases, GitHub issue creation, and edits to external consumer repositories require authorization from the user's task. Consumer scripts named in the theme's References do not by themselves authorize migrating those scripts.

## Where execution state lives

This repository is public. Committed files hold specifications, design, code, tests, and reproducible verification steps only (AGENTS.md). Keep execution records under `.agent-runs/<theme-stem>/`, which Git ignores.

- Keep `run.md` there with the base revision, the theme hash, the issue order, the current assignment and worker handles, blockers, and decisions made during the run. Update it at handoffs and state transitions.
- Prefer committed tests or scripts as acceptance evidence. Record one-off probe procedures and their observed results in the run file.
- Never write worker names, session or pane identifiers, or resume handles into committed files, commit messages, or PR bodies.

## Context ownership

The supervisor reads this skill plus `supervise-agents` and `review` when used. The implementation worker reads its issue, the referenced theme sections, applicable repository instructions, and the code it owns. It does not run this supervisor workflow. The reviewer reads the review rubrics itself. Do not load those rubrics in the supervisor merely to forward their paths.

Use the theme as the specification and each issue as the record of its scope and acceptance. Follow-ups carry changed requirements, decisions, commit IDs, and relevant sections, not the original prompt again. Each role still reads the source needed for its own judgment. Within a continuing session, reuse already-read unchanged material. On resumption, read the current state and the changes since the last observed revision, then fetch missing context as needed. Search applicable instruction paths in the workspace and its ancestors, not every sibling repository or dependency directory.

## Coverage and order

Before delegating implementation:

- Map every theme rule and criterion to at least one member issue. Where coverage is missing, file the issue in the repository's format (`docs/issues/open/NNNN-slug/issue.md` with the `theme` frontmatter). Format new issue files with the repository formatter and commit them on their own before delegating.
- Order ready work from the theme's Layers or Scope and from the dependencies visible in the issues. An issue is ready when the issues it depends on are closed. Record the order in the run file. Do not add status or dependency metadata to the committed issues; the state directories and the run file already carry it.
- Split an issue that holds independently verifiable outcomes before delegating it. Keep tightly coupled changes together only when splitting would leave no meaningful acceptance boundary, and record that reason in the issue. Transfer unfinished criteria to linked successor issues.
- Include behavior and type tests with each implementation issue.
- Delegate one ready issue at a time per worker.

## Delegate and review

Use the installed `supervise-agents` and `review` skills. Resolve their SKILL.md paths from the current session's available-skills catalog rather than assuming a particular installation directory. Read them before their first use and follow their CLI and session lifecycle rules. If these dependencies cannot be found or used, report the concrete blocker. Do not silently substitute a different delegation workflow.

1. Open the task prompt by naming the role. The worker is an implementation worker, not a supervisor. It implements directly and leaves delegation and review to the supervisor. Delegate with the issue path, the theme reference and relevant sections, ownership, acceptance criteria, and relevant earlier decisions. Tell the worker that others may share the codebase and that it must preserve unrelated work. Explicitly request implementation-and-review mode so the worker stays available after its first `ISSUE_DONE`. Require reviewable commits without unrelated user edits. When package validation requires a runtime different from the host, include an already verified runtime-selection command from prior evidence in the assignment, and verify that its executable is still available.
2. Process worker questions and inspect actual completion artifacts. Dependent issues run sequentially. Parallelize only when ownership and integration are independent and the review workflow can associate findings with each worker.
3. Wait for the worker's implementation `ISSUE_DONE`, inspect the completion artifacts, and record the implementation head and any remaining uncommitted changes before launching review. Keep implementation edits stopped during that review. Invoke `$review` with the worktree, existing worker identity, baseline, review head, and verification evidence. That skill owns review and worker-fixable correction rounds. Keep the implementation worker available until those rounds finish.
4. Resolve supervisor items using the theme and the evidence. Route any resulting implementation back to the same worker and obtain the required review outcome. Do not perform a competing code review in the supervisor or reopen dismissed nits.
5. Verify the issue's acceptance evidence, move the issue from `docs/issues/open/` to `docs/issues/closed/` with the implementation commit, update the run file, finish the worker according to the lifecycle rules, and advance to the next ready issue. Record pre-existing check failures separately from failures introduced by the current work.

Commit issue updates with the implementation they describe, and commit issue-only changes separately. Agree with the worker who will include each update. Do not amend reviewed commits or include unrelated user changes.

Do not use `handle-issue` as the outer coordinator. It dispatches and stops, while this supervisor must retain responsibility for the whole theme. Never treat dispatch, a worker's first completion message, or one closed issue as theme completion.

## Resume and recover

On resumption, reconcile the run file with the actual code, commits, issue locations, and live process or session state. A stale status or an observation timeout is not evidence that a worker stopped. Reuse the recorded conversation. Follow the delegation skill's missing-worker rules instead of starting duplicate workers or inventing session IDs.

If a required decision or an unavailable dependency prevents further progress, record the blocker in the run file and report what is needed. Do not mark the theme complete. When running under an existing goal, preserve that goal and its completion rules. Do not create a second goal or substitute a smaller objective.

## Completion audit

Completion requires evidence for the theme's criteria, not only green existing tests.

- Reconcile every theme rule and criterion with the closed member issues and their verification evidence, following supersession links. Record this coverage check in the run file. Checked work without direct evidence leaves the criterion incomplete. An issue still under `open/` means the theme is incomplete unless the user accepted the exclusion.
- Ensure the repository's required checks, tests, and build have run against the final state. Inspect recorded evidence and its coverage before reusing it. A worker's bare "passed" claim is insufficient. Rerun affected checks after code, dependency, configuration, or environment changes, failed checks, or evidence gaps. Do not rerun an identical full suite in every role merely to duplicate a verified result.
- Verify the integration scenarios and the environment or package constraints named by the theme with real consumer behavior, not import-only smoke tests. Use the `verify-hacksh` skill (`.cursor/skills/verify-hacksh/SKILL.md`) for consumer-visible CLI behavior. Do not claim an environment was tested if it was unavailable.
- Obtain a review covering the full implementation relative to the recorded base, including interactions between issues. If a previous review already covers the full final change, reuse that evidence. Otherwise delegate an integration task in implementation-and-review mode so `$review` has a live worker for corrections.
- Confirm that necessary review corrections are resolved, that validation reflects the final code, and that the theme document is unchanged. Preserve user edits. Do not revert a concurrent user change just to match the initial hash.
- Report the implemented outcome, the validation evidence, and the remaining limitations. Unmet criteria are unfinished work, not limitations to disclose after declaring success. Mark an active goal complete only after this audit passes.
