# P2-01

- Plan: `docs/plan/cli-framework-next/phase-2-args-and-help.md` and parent README common policy/completion.
- Phase: 2
- Status: working
- depends_on: []
- Worker: s-p2-variadic (pane w2P:p7); next action: implement then review; blockers: none.
- Baseline: `1b1567a`; initial baseline/hash in [03-integration.md](03-integration.md).

## Scope and ownership

Own variadic command contract, schema-reader array recognition, common parser collection, usage syntax, related type/behavior tests and README. API: `variadic` is one schema key separate from fixed `positional`, hence always trailing. Reject multiple keys at runtime, duplicates/placement in fixed positionals, non-array fields, aliases and nonempty subcommands. Wrapped arrays supported through schema reader only. Omitted variadic input is always [] (optional/default do not replace it); element transforms and validation remain Zod-owned. Errors keep schema-based argument labels and full element paths. Fixed optional positionals consume first as before. Prerequisite: existing phase 1 public API.

Exclusions: other phases, plan edits, publishing and external repositories. Preserve unrelated work. Worker owns implementation/tests/README and evidence updates; supervisor owns status and acceptance checks.

## Acceptance criteria

- [ ] AC1: Plan variadic bullet and acceptance: fixed + variadic, zero/multiple values, wrapped optional/default arrays, per-element validation/path, extras/passthrough order work. Verify committed parser/run tests for zod and mini.
- [ ] AC2: Plan definition constraints: duplicate/multiple/misplaced/non-array/subcommand/alias configurations fail; schema-key typing and inferred output remain correct. Verify command/type tests and public declarations.
- [ ] AC3: Plan help and parent common policy: variadic syntax and README describe contract; existing positional and routing behavior preserved. Verify focused tests.
- [ ] AC4: Correctness and quality review accepts the issue revision; all required corrections validated.

## Evidence

- Implementation revision: `9026062774a30cc8c504a09f712e1b979c817f2f` (`feat: support
variadic positional arguments`), based on `1b1567a` plus the issue-assignment commit.
- AC1 behavior coverage is committed in `src/parser.test.ts` (fixed/zero/multiple values,
  optional/default wrappers, element transforms and paths, named-option exclusion, extras and
  passthrough), `src/integration.test.ts` (zod and zod/mini execution), and
  `scripts/test-packed-consumers.mjs` (published artifact behavior in both runtimes).
- AC2 definition/type coverage is committed in `src/command.test.ts` and the packed TypeScript
  consumer. It covers unknown/non-array/multiple/misplaced/aliased/subcommand configurations,
  schema-key typing, inferred output, and the emitted `CommandDef.variadic` declaration.
- AC3 usage and documentation coverage is committed in `src/public-api.test.ts`, `README.md`, and
  the existing full regression suite.
- `pnpm exec vp check README.md scripts/test-packed-consumers.mjs src/command.test.ts
src/command.ts src/integration.test.ts src/parser.test.ts src/parser.ts src/public-api.test.ts
src/schema.test.ts src/schema.ts src/usage.ts` — passed; all 11 files formatted, with no lint or
  type errors (pnpm 11.20.0, Node 24.15.0).
- `pnpm test` — passed: 7 files, 73 tests (Node 24.15.0).
- `pnpm build` — passed; target `node22.18.0`, including emitted `dist/index.d.ts` with
  `variadic?: ArgKey<S>` (Node 24.15.0).
- `ZITTY_MINIMUM_NODE="$(mise where node@22.18.0)/bin/node" pnpm test:packed` — passed:
  exact Node 22.18.0 and Deno 2.7.14 consumers, including zod/zod-mini variadic parsing, empty
  collection, transforms, inference, extras, and passthrough.
- `pnpm ready` — source test/build stages are independently green, but the aggregate command stops
  at its formatting check on four pre-existing coordination files outside P2-01:
  `.agents/skills/execute-plan/SKILL.md`, `.agents/skills/execute-plans/SKILL.md`,
  `02-help-and-booleans.md`, and `03-integration.md`. Those unrelated contents were not reformatted
  as part of the implementation.
