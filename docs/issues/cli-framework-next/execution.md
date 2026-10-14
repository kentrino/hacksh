# Phase 1 execution

- Plan: `docs/plan/cli-framework-next/phase-1-public-api.md`, plus common requirements in its README.
- Baseline: `f43188f875d62830ab428c599ea77771899d480a`.
- Plan SHA-256: `8f33be3a4488060e664e6b23a1e67175534d184bc5cdd975523a7949f2a4a304`.
- Parent README SHA-256: `2b6082e2a1eb9d12519f3f9f362ae864dda6c1c4d656a4d97417371dd6f27a88`.
- Scope: all Phase 1 local implementation, types, tests, README, packaging and review. No later phases, publishing or external consumer edits. Preserve plan files and checkboxes.
- Status: initial mapping; implementation pending.
- Ownership: one Sol implementation worker for [01-public-api.md](01-public-api.md); supervisor owns execution record and review coordination.

## Requirement mapping

| ID | Requirement | Required evidence |
| --- | --- | --- |
| P1 | Inject runMain argv; process argv default | Explicit, empty and omitted argv behavior |
| P2 | Replace help and validation usage via same callback; onError replaces whole default error display | Typed async callback examples, help stdout/error stderr, async onError awaited, exit subprocess checks |
| P3 | createMain returns callable accepting invocation argv | Repeated invocation, defaults and return contract tests |
| P4 | Public parseArgs returns validated schema output and existing errors, no token public contract | zod and mini output inference, async validation, errors; no stdout/exit |
| P5 | Public renderUsage and showUsage share generation | String/output equality, selectable destination, async writer; rendering no stdout/exit |
| P6 | run context cmd is actual resolved command with fallback child name | Root, nested named/unnamed child, schema inference, definition not mutated |
| C1 | Existing defaults, shared tokenizer and routing semantics remain | Existing regression suite, parent prefix, passthrough and unknown token ordering |
| C2 | Typed examples establish display arguments, async and output contracts | README examples and compile-time assertions; declaration inspection |
| C3 | ESM, zod 4/mini, Node >=22.18 and Deno npm | ready, test:packed, minimum Node and Deno real new-feature consumers, tarball/declaration inspection |
| C4 | Fixed plan, full review and final acceptance | Hash comparison, exact-head correctness/quality review, evidence for all above |

All requirements belong to issue 01; dependencies are internal and sequential. Verification evidence will identify revision, environment, command and log location.

## API decisions before implementation

Keep runMain's Promise<void> return and default process error/exit behavior. Use options.argv for injection. createMain(command, options) returns (argv?: string[]) => Promise<void>, with invocation argv taking precedence over options.argv and process argv as final default.

Use async public parseArgs returning only z.output<S>. Expose async renderUsage returning Promise<string> and async showUsage returning Promise<void>; awaiting these now avoids a future breaking return-type change if lazy command resolution is introduced. showUsage accepts options with an optional write(text): void | Promise<void>, default console.log; it awaits renderUsage and the writer. Internal synchronous formatting can remain private.

RunMainOptions.showUsage receives (command, { write }) and may return void or Promise<void>. The same hook handles ordinary help (console.log writer) and usage errors (console.error writer); runMain awaits it. Existing onError suppresses all default error display including this hook. Export public option/callback types needed by typed consumer examples. cmd is CommandDef<S> in CommandContext<S>, with the actual resolved definition/name at execution.

These additive contracts maintain existing defaults and reserve async public boundaries without implementing lazy loading. Worker may raise concrete contradictions before altering these decisions.
