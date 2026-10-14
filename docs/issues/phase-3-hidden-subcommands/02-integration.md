# P3-02

- Plan: `docs/plan/cli-framework-next/phase-3-hidden-subcommands.md` entirety; parent README common policy/completion.
- Phase: 3 integration
- Status: working
- depends_on: [P3-01]
- Worker: s-p3-integration (pane w2P:pG); next action: packed feature integration; blockers: none.
- Integration baseline: `72789cb`; full review baseline: `555ac6400c2aed7d61c42a8cc8ce786b90f8854e`.

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

### Coverage reconciliation

| Requirement                                | Direct committed evidence                                                                                                                                                                                                                                                                                                                                                                                                                 |
| ------------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Optional hidden metadata and public types  | P3-01 accepted `src/command.test.ts` coverage for `true`, `false`, omitted, inferred output and rejected non-boolean metadata. The installed-tarball TypeScript consumer in `scripts/test-packed-consumers.mjs` at `78afef1` defines hidden zod and zod/mini commands, assigns their inferred outputs to exact public types, composes both as subcommands and reads `hidden` as `boolean \| undefined`.                                   |
| Parent help suppression                    | P3-01 accepted render/showUsage coverage for mixed, nested and all-hidden listings. The packed Node and Deno consumers at `78afef1` execute real parent `--help`, require the visible command and `<COMMAND>` syntax, and reject both hidden names and descriptions.                                                                                                                                                                      |
| Named execution with zod and zod/mini      | `verifyConsumer` at `78afef1` invokes `zod-hidden` and `mini-hidden` by name in separate installed-package processes, passes phase-2 enum and explicit boolean syntax, and asserts each selected command name plus schema output. This runs through `createMain` from the packed ESM artifact rather than a source import.                                                                                                                |
| Direct hidden help and phase-2 interaction | The same consumers execute each hidden command's own `--help` and assert its resolved name/description, enum choices and `--no-enabled` description. The previously committed visible variadic/alias/boolean/passthrough behavior and programmatic zod/zod-mini phase-2 checks remain in the fixture and pass under both runtimes.                                                                                                        |
| Unknown-name usage                         | The packed Node and Deno processes invoke `missing`, require exit 1, the unknown-command diagnostic, custom parent usage and the visible command, and reject both hidden names/descriptions from stderr. P3-01's accepted `src/run.test.ts` supplies the focused `runMain` regression.                                                                                                                                                    |
| Positional restriction and routing policy  | P3-01 accepted explicit fixed-positional/hidden-only and variadic/hidden-only definition failures plus routing/help tests. The full 93-test suite at `78afef1` retains shared tokenization, parent-prefix validation, child-only execution, option-value skipping, unknown ordering and passthrough boundaries; the packed visible child additionally exercises alias, variadic, extra-argument and `--` behavior beside hidden children. |
| Documentation and packaging policy         | P3-01 accepted the README contract and correctness/quality review without findings at frozen head `a60bc63`. At `78afef1`, the public type consumer compiles against the installed tarball and runtime consumers load that ESM package with zod 4 and zod/mini under exact Node 22.18.0 and Deno's npm path. Publication and external repositories remain excluded.                                                                       |

All phase-3 feature and acceptance text, the parent common policy, and the parent completion
requirements therefore have direct committed evidence. P3-01 is accepted without findings at
`a60bc63`; P3-02's remaining full-baseline correctness/quality review and acceptance decision are
supervisor-owned.

### Integration implementation and gates

- Packed integration revision: `78afef111079b9772ced16ebf3d5bad6c2afc5ca` (`test: cover hidden
commands in packed consumers`). The sole implementation file is
  `scripts/test-packed-consumers.mjs`; it installs the generated tarball, compiles its public types,
  and runs the hidden-command and retained phase-2 behavior through Node and Deno.
- `/usr/bin/time -p pnpm ready` at `78afef1` passed in 1.38s on macOS arm64, host Node `v24.15.0`
  and pnpm `11.20.0`: all 43 files formatted, 18 lint/type targets clean, all 93 tests in 7 files
  passed, and the ESM build plus declarations completed for target Node 22.18.0. The only message
  was the existing non-failing TypeScript 7 experimental API warning.
- `/usr/bin/time -p env
ZITTY_MINIMUM_NODE=/Users/kento/.local/share/mise/installs/node/22.18.0/bin/node pnpm
test:packed` at `78afef1` passed in 3.53s. The installed-tarball consumers reported `Packed
consumers passed: Node 22.18.0 and Deno`; exact runtimes were Node `v22.18.0` and Deno `2.7.14`.
- `shasum -a 256 docs/plan/cli-framework-next/phase-3-hidden-subcommands.md` after the final gates
  returned the original `214286c39e5460afa9ecc4171cfb75866442702010e58d4b4e318c9b5d64b407`;
  the plan has no diff from integration baseline `72789cb`. No in-scope implementation requirement
  is unresolved; final review/checkbox/status updates remain with the supervisor.
