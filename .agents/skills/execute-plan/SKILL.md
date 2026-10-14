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

## Context ownership

The supervisor reads this skill plus `supervise-agents` and `review` when used.
The implementation worker reads its issue, referenced plan sections, applicable
repository instructions, and owned code; it does not run this supervisor workflow.
The reviewer reads the review rubrics itself. Do not load those rubrics in the
supervisor merely to forward their paths.

Use the plan as the specification and each issue as the record of its scope,
progress, and evidence. Acceptance criteria reference the relevant plan sections,
so the set of issues provides requirement coverage without a separate mapping file. Follow-ups carry changed
requirements, decisions, commit IDs, and relevant sections, not the original
prompt again. Each role still reads the source needed for its own judgment.

Within a continuing session, reuse already-read unchanged material. On resumption,
read the current status and changes since the last observed revision, then fetch
missing context as needed; do not automatically reload every skill and source file.
Search applicable instruction paths in the workspace and its ancestors, not every
sibling repository or dependency directory.

## Required issue format

Keep local Markdown issues under `docs/issues/`, grouped under `<plan-stem>/` when
useful. Follow existing naming conventions and reuse issues on resumption. These
are local files, not GitHub issues. Do not create execution.md or a separate
acceptance/progress ledger; acceptance checkboxes in issues are the progress record.
Retain existing historical records when resuming older work, linking relevant
history from issues rather than deleting it or maintaining duplicate live ledgers.

Every issue must contain:

- Stable ID, plan path/sections, phase, status, and explicit `depends_on` issue IDs.
- A short current-state summary near the top: assigned worker, next action, and
  blockers (or explicitly none). Keep actual worker/reviewer identities and resume
  handles here while active; put obsolete observations below or remove them from
  the current summary. Update it at handoffs and state transitions.
- Scope, exclusions, owned files or responsibilities, and prerequisite contracts.
- An `Acceptance criteria` section with Markdown checkboxes. Each criterion states
  an observable outcome, its plan reference, and how it will be verified. Include
  relevant errors, types, compatibility, and constraints, not just the happy path.
- Concise evidence attached to each criterion or linked within the same issue:
  source revision (including relevant uncommitted changes), command/procedure,
  environment, observed result, and committed test/script or artifact references.

For example:

```markdown
## Acceptance criteria

- [ ] AC1: Unknown option tokens retain their order in extraArgs (plan: Unknown
      options). Verify with parser tests covering mixed known and unknown tokens.
- [ ] AC2: Issue changes pass correctness/quality review; required corrections are
      verified against the accepted revision.
```

Check an item only after inspecting its evidence, not when implementation is
merely reported complete. Reopen it if later changes invalidate that evidence.
Require review acceptance as a checkbox in each implementation issue. Status is a
summary of lifecycle (pending, working, review, blocked, done, superseded), not an
independent completion claim: done requires all acceptance criteria verified.

Temporary logs can support execution but must not be the only lasting evidence.
Link committed tests/scripts for repeatable checks. For one-off probes, retain the
reproduction command/procedure, relevant inputs, expected behavior, and observed
result in the issue. Preserve essential non-reproducible artifacts durably rather
than relying on a /tmp path that may disappear.

Record the initial branch/base revision and original plan hashes in the final
integration/acceptance issue before implementation; other issues link to it.
This issue owns cross-cutting final checks and full-plan coverage, not the whole
implementation. Record each implementation issue's own review baseline when it
starts. Do not duplicate the complete plan in issue bodies.

## Decompose into phases and issues

Before implementation, create the issues with phase metadata and verify that
their acceptance criteria cover the entire requested scope. A phase groups a meaningful stage of
delivery; an issue is a bounded outcome that can be verified and reviewed on its
own after its prerequisites. Reuse phases already in the plan where appropriate;
express additional execution grouping through issue metadata without editing the plan.

- Split independently verifiable outcomes into separate issues. Do not put a
  multi-component release or phase into one umbrella implementation issue merely
  because its components depend on each other or share files. Express those
  relationships through dependencies and sequence the work.
- Define the minimal interface or artifact a successor needs from its predecessor.
  Keep tightly coupled changes together only when splitting would leave no
  meaningful acceptance boundary, and record that reason. Do not impose a fixed
  issue count or create an issue per checkbox.
- Include behavior and type tests with each implementation issue. Integration
  issues verify interactions and packaging; they do not postpone verification
  of individual components until the end.
- Give each issue a stable ID and metadata, for example:

  ```yaml
  phase: 2
  depends_on:
    - 01-schema-reader
  status: pending
  ```

- Use `depends_on`, not the phase number alone, to determine readiness. Ensure
  referenced IDs exist and dependencies are acyclic. Phase labels communicate
  progress; any actual phase gate must be an explicit dependency. Mark a phase
  complete only when its active issues and required integration checks are done.
- Delegate one ready issue at a time per worker, rather than passing a phase's
  entire backlog as one implementation assignment.

Commit the initial issues before delegating implementation.
Make this a documentation-only commit containing only this plan's issues; preserve unrelated staged and unstaged changes. On resumption, reuse
the existing initial commit rather than recreating the issue set.

## Evolve issues during execution

The plan remains fixed; issues are working records that may become more specific,
split, merge, or change dependencies as implementation reveals new information.

- Record the reason for meaningful scope, acceptance, or dependency changes.
  Update plan references and acceptance criteria in affected issues together so
  no requirement disappears or is weakened merely to make an issue complete.
- Preserve traceability when splitting or merging: mark superseded issues and
  link their replacements instead of deleting their history. Distinguish
  superseded work from completed work.
- If an issue grows to include independently verifiable outcomes, split the
  remaining work before delegating more scope. Preserve completed evidence and
  update phase membership, dependencies, and affected acceptance criteria together.
  Transfer unfinished criteria to linked successor issues; never check them just
  because they were moved or their original issue was superseded.
  Merge only when there is no useful separate acceptance boundary, not simply
  because one worker could implement both issues.
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

1. Start the task prompt with the role: implementation worker, not supervisor;
   implement directly and leave delegation/review to the parent. Delegate with
   the plan reference and relevant sections, ownership, acceptance criteria,
   and relevant earlier decisions. Tell the worker that others may share the
   codebase and that it must preserve unrelated work. Explicitly request
   implementation-and-review mode so the worker stays available after its first
   `ISSUE_DONE`. Require reviewable commits without including unrelated user edits.
2. Process worker questions and inspect actual completion artifacts. Dependent
   tasks run sequentially. Parallelize only when ownership and integration are
   independent and the review workflow can associate findings with each worker.
3. Wait for the worker's implementation `ISSUE_DONE`, inspect the completion
   artifacts, and record the implementation head and any remaining uncommitted
   changes before launching review. Keep implementation edits stopped during that
   review. Invoke `$review` with the worktree, existing worker identity, baseline,
   review head, and verification evidence. That skill owns review and worker-fixable
   correction rounds.
   Keep the implementation worker available until those rounds finish.
4. Resolve supervisor items using the plan and evidence. Route any resulting
   implementation back to the same worker and obtain the required review outcome.
   Do not perform a competing code review in the parent or reopen dismissed nits.
5. Verify the task's acceptance evidence, update and commit the issue's acceptance
   checkboxes and supporting evidence, finish the worker according to the lifecycle rules, and advance to
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

- Reconcile every in-scope plan requirement with acceptance criteria and final
  implementation evidence across the active issues, following supersession links.
  Record this coverage check in the final acceptance issue. Checked boxes alone
  are not proof; missing, skipped, or indirect evidence leaves the item incomplete.
- Ensure the repository's required checks, tests, and build have run against the
  final state. Inspect recorded evidence and its coverage before reusing it; a
  worker's bare "passed" claim is insufficient. Rerun affected checks after code,
  dependency, configuration, or relevant environment changes, failed checks, or
  evidence gaps. Do not rerun an identical full suite in every role merely to
  duplicate a verified result. Independent reviewer probes and required final
  checks remain necessary where the evidence does not answer the requirement.
- Verify integration scenarios and environment/package constraints named by the
  plan, including real consumer behavior rather than import-only smoke tests.
  Do not claim an environment was tested if it was unavailable.
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
