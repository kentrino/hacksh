# P3-02

- Plan: `docs/plan/cli-framework-next/phase-3-hidden-subcommands.md` entirety; parent README common policy/completion.
- Phase: 3 integration
- Status: pending
- depends_on: [P3-01]
- Worker: unassigned; next action: await P3-01; blockers: none.

## Initial state

- Branch: main; clean working tree.
- Base: `555ac6400c2aed7d61c42a8cc8ce786b90f8854e`.
- Original plan SHA-256: `214286c39e5460afa9ecc4171cfb75866442702010e58d4b4e318c9b5d64b407`.
- No applicable AGENTS.md or Cursor rules found in workspace or ancestors.
- P3-01 covers the single feature, all four acceptance scenarios, positional restriction, types and README; P3-02 covers package/runtime compatibility and full integration. Dependencies are acyclic.
- Issues use the task-requested phase directory; plans remain unchanged.

## Scope and ownership

Own packed consumer fixtures/scripts and any necessary cross-feature integration tests. Prerequisite is accepted hidden metadata/rendering/routing contract from P3-01. Supervisor owns status/checkboxes and audit. Exclude other phases, plan edits, publication and external repositories. Preserve unrelated work.

## Acceptance criteria

- [ ] AC1: Installed tarball consumers use hidden commands with zod and zod/mini, check public types/output inference, parent help suppression, named execution, own help and unknown-name usage (phase acceptance and parent packaging policy; committed packed consumer tests).
- [ ] AC2: pnpm ready and pnpm test:packed pass final code, including exact Node 22.18.0 and Deno npm consumers; record runtime, command, revision and results (parent completion).
- [ ] AC3: Full implementation from initial base passes correctness/quality review, including phase 2 help interactions; all required corrections verified.
- [ ] AC4: Reconcile every requirement to direct committed evidence; P3-01 accepted, original plan hash unchanged, no unresolved requirements (completion audit).

## Evidence

Pending implementation and final coverage reconciliation.
