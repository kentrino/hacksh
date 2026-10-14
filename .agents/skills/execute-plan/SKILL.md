---
name: execute-plan
description: Supervise implementation of an existing plan through task decomposition, delegated implementation, review, corrections, and final verification while preserving the plan. Use when asked to execute a plan to completion, including under /goal.
---

# Execute Plan

Own completion of the requested plan. The parent coordinates scope, dependencies,
design decisions, and acceptance; delegate implementation, tests, and corrections
to a Sol worker by default. Honor explicit worker or reviewer choices.

This skill executes a plan, not merely turns it into issues. Do not start execution
when the user is only asking to discuss, draft, or edit a plan or this skill.

## Scope and source of truth

- Read the supplied plan, repository instructions, and current implementation.
  Identify the requested release or milestone and its exclusions. Interpret
  checkboxes according to the document; they may denote scope rather than progress.
- Preserve the plan, including its checkboxes. Record execution state separately.
  Capture its initial content or hash so unchanged content can be verified later.
- Resolve ordinary implementation choices from the plan and repository conventions.
  Ask about contradictions or consequential unspecified behavior that cannot be
  resolved from evidence; continue independent work while awaiting the answer.
  Do not silently replace requirements with easier alternatives.
- Default completion scope is local implementation, review, and verification.
  GitHub issue creation, publishing, merging, releases, and edits to external
  consumer repositories require authorization from the user's task. Examples of
  consumer scripts in a plan do not by themselves authorize migrating those scripts.

## Establish execution state

Keep local Markdown issues and execution records under `docs/issues/`, grouped
under `<plan-stem>/` when useful. Follow existing naming conventions within that
directory and reuse records on resumption. These are local files, not GitHub
issues. Do not duplicate the full specification into every issue.

Record:

- Plan path, requested scope, initial plan hash, and initial branch/base revision.
- A requirement-to-issue mapping, with implementation and verification evidence
  added as work completes. Include cross-cutting constraints, types, errors,
  compatibility, and packaging where the plan requires them.
- For each issue: referenced requirements, owned files or responsibilities,
  dependencies, observable acceptance criteria, and verification method.
- Status, unresolved decisions, actual worker/reviewer identifiers, session or run
  handles, commit revisions, and the next action needed to resume.

Choose reviewable tasks based on dependencies; do not force a fixed task count or
create an issue per checkbox. Tests belong with their implementation. Reserve
integration tasks for behavior spanning multiple components. Cover the entire
requested scope before starting the first implementation task.

Commit the initial issues and requirement mapping before delegating implementation.
Make this a documentation-only commit containing only this plan's execution
records; preserve unrelated staged and unstaged changes. On resumption, reuse
the existing initial commit rather than recreating the issue set.

## Evolve issues during execution

The plan remains fixed; issues are working records that may become more specific,
split, merge, or change dependencies as implementation reveals new information.

- Record the reason for meaningful scope, acceptance, or dependency changes.
  Update the requirement-to-issue mapping in the same change so no requirement
  disappears or is weakened merely to make an issue complete.
- Preserve traceability when splitting or merging: mark superseded issues and
  link their replacements instead of deleting their history. Distinguish
  superseded work from completed work.
- Coordinate changes to an assigned issue with its existing worker. Send the
  changed scope and acceptance criteria before dependent work proceeds; adjust
  ownership to prevent overlapping implementation or concurrent issue edits.
- Commit issue updates with the related implementation when they describe that
  change. Commit issue-only planning or status changes separately. Agree with
  the worker who will include each update; do not amend reviewed commits or
  include unrelated user changes.
- At completion, record the verification results and actual implementation
  commit references. A subsequent issue-only commit can record those references;
  do not try to embed a commit's own hash in itself.

## Delegate and review

Use the installed `supervise-agents` and `review` skills. Resolve their SKILL.md
paths from the current session's available-skills catalog rather than assuming
a particular installation directory. Read them before their first use and follow
their CLI and session lifecycle rules. If these dependencies
cannot be found or used, report the concrete blocker; do not silently substitute
a different delegation workflow.

1. Delegate a ready task with the plan reference, ownership, acceptance criteria,
   and relevant earlier decisions. Tell the worker that others may share the
   codebase and that it must preserve unrelated work. Explicitly request
   implementation-and-review mode so the worker stays available after its first
   `ISSUE_DONE`. Require reviewable commits without including unrelated user edits.
2. Process worker questions and inspect actual completion artifacts. Dependent
   tasks run sequentially. Parallelize only when ownership and integration are
   independent and the review workflow can associate findings with each worker.
3. Invoke `$review` with the worktree, existing worker identity, and applicable
   scope/base context. That skill owns review and worker-fixable correction rounds.
   Keep the implementation worker available until those rounds finish.
4. Resolve supervisor items using the plan and evidence. Route any resulting
   implementation back to the same worker and obtain the required review outcome.
   Do not perform a competing code review in the parent or reopen dismissed nits.
5. Verify the task's acceptance evidence, record and commit the issue's completion
   evidence, finish the worker according to the lifecycle rules, and advance to
   the next ready task.

Do not use `handle-issue` as the outer coordinator: it dispatches and stops, while
this parent must retain responsibility for the whole plan. Never treat dispatch,
a worker's first completion message, or one completed task as goal completion.

## Resume and recover

On resumption, reconcile saved records with the actual code, commits, and live
process/session state. A stale status or observation timeout is not evidence that
a worker stopped. Reuse the recorded conversation; follow the delegation skill's
missing-worker rules instead of starting duplicate workers or inventing session IDs.

If a required decision or unavailable dependency prevents further progress,
record the blocker and report what is needed. Do not mark the plan complete.
When running under an existing goal, preserve that goal and its completion rules;
do not create a second goal or substitute a smaller objective.

## Completion audit

Completion requires evidence for the requested plan, not only green existing tests.

- Reconcile every in-scope requirement with the final implementation and appropriate
  verification. Missing, skipped, or indirect evidence leaves that item incomplete.
- Run the repository's required checks, tests, and build against the final state.
  Verify integration scenarios and environment/package constraints named by the
  plan. Do not claim an environment was tested if it was unavailable.
- Obtain a review covering the full implementation relative to the recorded base,
  including interactions between tasks. If a previous review already covers the
  full final change, reuse that evidence. Otherwise delegate an integration task
  in implementation-and-review mode so `$review` has a live worker for corrections.
- Confirm that necessary review corrections are resolved, validation reflects the
  final code, and the original plan content is unchanged. Preserve user edits;
  do not revert a concurrent user change just to match the initial plan hash.
- Report the implemented outcome, validation evidence, and remaining limitations.
  Unmet requirements are unfinished work, not merely limitations to disclose after
  declaring success. Mark an active goal complete only after this audit passes.
