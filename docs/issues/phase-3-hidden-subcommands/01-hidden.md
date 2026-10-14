# P3-01

- Plan: `docs/plan/cli-framework-next/phase-3-hidden-subcommands.md`, feature and acceptance paragraph; parent README common policy.
- Phase: 3 feature
- Status: pending
- depends_on: []
- Worker: unassigned; next action: delegate implementation; blockers: none.
- Review baseline: initial issue commit (record at delegation). Initial state: [02-integration.md](02-integration.md).

## Scope and ownership

Own command metadata, usage rendering, behavior/type regression tests and README documentation. Add optional boolean `hidden` on CommandDef; omit hidden children from parent listings while preserving routing and direct help. Keep API and rendering together because a metadata-only change has no meaningful behavior acceptance boundary. Supervisor owns status/checkbox updates; worker owns implementation and evidence. Others share this repository; preserve unrelated changes.

Prerequisite: phase 1 API and phase 2 help already implemented. Exclude aliases, default subcommands, other phases, plan edits, publication and external consumers. Keep generic `<COMMAND>` syntax for actual subcommands; omit an empty COMMANDS listing when every child is hidden. The option governs listings, not availability.

## Acceptance criteria

- [ ] AC1: Optional typed boolean hidden metadata preserves output inference and defaults; parent renderUsage/showUsage omit hidden names/descriptions, including all-hidden and nested lists, while false/omitted children remain visible (plan feature; verify public API/type and usage tests).
- [ ] AC2: Hidden children execute by name and their own --help remains usable; unknown-command error usage excludes hidden children (plan acceptance; verify run/runMain and process tests as appropriate).
- [ ] AC3: Fixed and variadic positional/subcommand incompatibility remains enforced even for hidden-only children, and existing routing/tokenization semantics remain intact (plan constraint/common policy; definition and regression tests).
- [ ] AC4: README describes the public contract and correctness/quality review accepts implementation with required fixes verified (parent common policy; inspect docs and reviewer report).

## Evidence

Pending implementation.
