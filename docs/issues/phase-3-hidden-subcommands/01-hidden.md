# P3-01

- Plan: `docs/plan/cli-framework-next/phase-3-hidden-subcommands.md`, feature and acceptance paragraph; parent README common policy.
- Phase: 3 feature
- Status: done
- depends_on: []
- Worker: s-p3-hidden (pane w2P:pE); next action: none; accepted; blockers: none.
- Review baseline: `a843989`. Initial state: [02-integration.md](02-integration.md).

## Scope and ownership

Own command metadata, usage rendering, behavior/type regression tests and README documentation. Add optional boolean `hidden` on CommandDef; omit hidden children from parent listings while preserving routing and direct help. Keep API and rendering together because a metadata-only change has no meaningful behavior acceptance boundary. Supervisor owns status/checkbox updates; worker owns implementation and evidence. Others share this repository; preserve unrelated changes.

Prerequisite: phase 1 API and phase 2 help already implemented. Exclude aliases, default subcommands, other phases, plan edits, publication and external consumers. Keep generic `<COMMAND>` syntax for actual subcommands; omit an empty COMMANDS listing when every child is hidden. The option governs listings, not availability.

## Acceptance criteria

- [x] AC1: Optional typed boolean hidden metadata preserves output inference and defaults; parent renderUsage/showUsage omit hidden names/descriptions, including all-hidden and nested lists, while false/omitted children remain visible (plan feature; verify public API/type and usage tests).
- [x] AC2: Hidden children execute by name and their own --help remains usable; unknown-command error usage excludes hidden children (plan acceptance; verify run/runMain and process tests as appropriate).
- [x] AC3: Fixed and variadic positional/subcommand incompatibility remains enforced even for hidden-only children, and existing routing/tokenization semantics remain intact (plan constraint/common policy; definition and regression tests).
- [x] AC4: README describes the public contract and correctness/quality review accepts implementation with required fixes verified (parent common policy; inspect docs and reviewer report).

## Evidence

- Source state: baseline `a843989`; implementation commit `9301166430061662082eebada79623ea6ce68ebe`
  (`feat: support hidden subcommands`). Validation below ran from that implementation commit with
  only this issue's coordinator assignment/evidence edit left uncommitted.
- AC1: `src/command.test.ts` has `accepts optional boolean hidden metadata without changing output
inference`, including `true`, `false`, omitted metadata and a compile-time non-boolean rejection.
  `src/public-api.test.ts` has `omits hidden subcommands from parent and nested listings` and `keeps
command syntax but omits an empty listing when every child is hidden`; these exercise both
  `renderUsage` and `showUsage`, mixed visibility, nested lists, and the all-hidden `<COMMAND>` case.
- AC2: `src/run.test.ts` has `routes hidden commands normally`, `shows help for a hidden command
without exposing it in parent help`, and `omits hidden commands from usage reported for an unknown
command`. The latter uses `runMain`; the first two cover named `runCommand` execution and direct
  help.
- AC3: `src/command.test.ts` has explicit `positional and hidden-only subcommands` and `variadic and
hidden-only subcommands` rejection cases. The full routing/parser suite remained green, including
  parent-prefix validation, option-value skipping, nesting, passthrough boundaries, and phase 2
  boolean/help behavior.
- AC4 documentation: `README.md` documents `hidden: true`, parent-list/unknown-usage suppression,
  direct execution/help availability, and all-hidden rendering. Correctness/quality review remains a
  supervisor action.
- Validation at source `9301166430061662082eebada79623ea6ce68ebe` on macOS arm64, Node `v24.15.0`,
  pnpm `11.20.0`: `pnpm ready` passed formatting/lint/type checks (18 checked source files), all 93
  tests in 7 files, and the Node 22.18-targeted package build. Generated `dist/index.d.ts` includes
  `hidden?: boolean`.
- Packed compatibility validation at the same source, with exact Node `v22.18.0` from mise and Deno
  `2.7.14`: `ZITTY_MINIMUM_NODE=/Users/kento/.local/share/mise/installs/node/22.18.0/bin/node pnpm
test:packed` passed (`Packed consumers passed: Node 22.18.0 and Deno`). An initial plain `pnpm
test:packed` correctly stopped before consumer execution because the active Node was `v24.15.0`;
  rerunning with the required absolute minimum-Node path produced the recorded pass.

- Review frozen head: `a60bc63`; implementation `9301166`; no uncommitted implementation changes. Only supervisor issue lifecycle metadata is dirty during review.

- Review acceptance: c-review-p3-hidden accepted `a843989..a60bc63` without worker/supervisor findings. Independently passed 59 targeted tests and project typecheck, probed hidden-group/grandchild routing and direct help, and rejected non-boolean hidden types. Supervisor inspected committed tests and evidence; AC1–AC4 accepted. Worker and reviewer finished after acceptance.
