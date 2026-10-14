# Phase 1 execution

- Plan: `docs/plan/cli-framework-next/phase-1-public-api.md`, plus common requirements in its README.
- Baseline: `f43188f875d62830ab428c599ea77771899d480a`.
- Plan SHA-256: `8f33be3a4488060e664e6b23a1e67175534d184bc5cdd975523a7949f2a4a304`.
- Parent README SHA-256: `2b6082e2a1eb9d12519f3f9f362ae864dda6c1c4d656a4d97417371dd6f27a88`.
- Scope: all Phase 1 local implementation, types, tests, README, packaging and review. No later phases, publishing or external consumer edits. Preserve plan files and checkboxes.
- Status: complete. Phase 1 implemented, reviewed and verified at `009d2db`; see acceptance.md for requirement evidence.
- Ownership: one Sol implementation worker for [01-public-api.md](01-public-api.md); supervisor owns execution record and review coordination.

## Requirement mapping

| ID  | Requirement                                                                                       | Required evidence                                                                                      |
| --- | ------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------ |
| P1  | Inject runMain argv; process argv default                                                         | Explicit, empty and omitted argv behavior                                                              |
| P2  | Replace help and validation usage via same callback; onError replaces whole default error display | Typed async callback examples, help stdout/error stderr, async onError awaited, exit subprocess checks |
| P3  | createMain returns callable accepting invocation argv                                             | Repeated invocation, defaults and return contract tests                                                |
| P4  | Public parseArgs returns validated schema output and existing errors, no token public contract    | zod and mini output inference, async validation, errors; no stdout/exit                                |
| P5  | Public renderUsage and showUsage share generation                                                 | String/output equality, selectable destination, async writer; rendering no stdout/exit                 |
| P6  | run context cmd is actual resolved command with fallback child name                               | Root, nested named/unnamed child, schema inference, definition not mutated                             |
| C1  | Existing defaults, shared tokenizer and routing semantics remain                                  | Existing regression suite, parent prefix, passthrough and unknown token ordering                       |
| C2  | Typed examples establish display arguments, async and output contracts                            | README examples and compile-time assertions; declaration inspection                                    |
| C3  | ESM, zod 4/mini, Node >=22.18 and Deno npm                                                        | ready, test:packed, minimum Node and Deno real new-feature consumers, tarball/declaration inspection   |
| C4  | Fixed plan, full review and final acceptance                                                      | Hash comparison, exact-head correctness/quality review, evidence for all above                         |

All requirements belong to issue 01; dependencies are internal and sequential. Verification evidence will identify revision, environment, command and log location.

## API decisions before implementation

Keep runMain's Promise<void> return and default process error/exit behavior. Use options.argv for injection. createMain(command, options) returns (argv?: string[]) => Promise<void>, with invocation argv taking precedence over options.argv and process argv as final default.

Use async public parseArgs returning only z.output<S>. Expose async renderUsage returning Promise<string> and async showUsage returning Promise<void>; awaiting these now avoids a future breaking return-type change if lazy command resolution is introduced. showUsage accepts options with an optional write(text): void | Promise<void>, default console.log; it awaits renderUsage and the writer. Internal synchronous formatting can remain private.

RunMainOptions.showUsage receives (command, { write }) and may return void or Promise<void>. The same hook handles ordinary help (console.log writer) and usage errors (console.error writer); runMain awaits it. Existing onError suppresses all default error display including this hook. Export public option/callback types needed by typed consumer examples. cmd is CommandDef<S> in CommandContext<S>, with the actual resolved definition/name at execution.

These additive contracts maintain existing defaults and reserve async public boundaries without implementing lazy loading. Worker may raise concrete contradictions before altering these decisions.

## Execution history

- Initial mapping/contracts committed as `649e4fc` before delegation.
- Worker `s-phase1-public-api` (Sol), workspace `w2P`, pane `w2P:p4`, tab `w2P:t4`; prompt is issue 01, implementation-and-review mode.
- Prompt/wait handle: exec session `74109`. Next: inspect implementation completion and verification artifacts, then launch exact-head review against baseline. Keep worker available for corrections.

## Implementation completion

- Worker reported ISSUE_DONE (completion sequence 95) at `269df37a5d99fe793362e5d1abbab0230ccffff4`; implementation commits `91a444a` and `269df37`. Worker remains available for review corrections.
- `pnpm ready` passed: 52 tests across 7 files, formatting/lint/types/build clean. `pnpm test:packed` passed real new-API consumers on Node 22.18.0 and Deno 2.7.14. Logs: `/tmp/zitty-phase1/ready.log`, `/tmp/zitty-phase1/test-packed.log`, `/tmp/zitty-phase1/coverage.log`, `/tmp/zitty-phase1/final-evidence.log`.
- Only uncommitted change at review start: supervisor-owned execution.md (execution history and formatting). Review implementation against original baseline through exact implementation head above.

## Review round 1

- Reviewer `c-phase1-review` (Cursor), pane `w2P:p5`, session `0667ddd5-8e4e-4d63-809a-1256ea76ae85`; REVIEW_DONE sequence 98, exact head `269df37`, full baseline scope. Review wait `76293` terminal.
- Worker corrections: ensure a rejecting default usage-display hook does not bypass exit 1 on a usage error; remove/document the packed-script's unconditional mise dependency; consolidate related usage writer types and redundant await wrapper.
- Supervisor decision: parseArgs is a single-command schema parser, returning the supplied command's z.output<S>. It does not route subcommands or execute help/version; callers supply that command's argv segment. Builtin flags do not bypass validation. Common parent-prefix semantics apply to execution routing (runCommand/runMain/createMain), which remains unchanged. Document and test this explicit boundary; routing to a leaf would violate the chosen output type and introduce a different API.
- Next: same worker corrections, refreshed gates, same reviewer incremental verification.

## Final acceptance

- Correction commits: `ad085ece42ed73262968f02f03a57959127e24fe`, `009d2dbcdbd3fb6916a438e6a0014cf6d41ba01e`. Worker ISSUE_DONE sequence 100; correction wait `21781` terminal.
- Same reviewer returned REVIEW_DONE sequence 102 with no remaining worker or supervisor findings. Full baseline scope is covered by initial review plus correction/interactions review through exact head `009d2db`. Review wait `7089` terminal. Reports: `/tmp/zitty-phase1/review-round1.log`, `/tmp/zitty-phase1/review-final.log`.
- Final gates and requirement-by-requirement evidence: [acceptance.md](acceptance.md). `pnpm ready` passed all 57 tests, formatting, lint, types and build. Documented minimum-Node packed checks passed on Node 22.18.0 and Deno 2.7.14. Final supplemental return/async-onError probes passed against rebuilt final dist. Tarball and public declarations inspected.
- Both plan hashes match initial values. No out-of-scope work or unresolved requirements remain. Historical next actions above are superseded; remaining lifecycle cleanup is to finish reviewer and worker, then commit these final records.
- Lifecycle complete: agent-delegate finish closed reviewer tab `w2P:t5` and worker tab `w2P:t4`. No active worker, pending correction, or next implementation action remains.
