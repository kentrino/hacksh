# P2-01

- Plan: `docs/plan/cli-framework-next/phase-2-args-and-help.md` and parent README common policy/completion.
- Phase: 2
- Status: pending
- depends_on: []
- Worker: unassigned; next action: delegate when ready; blockers: none.
- Baseline: recorded at assignment; initial baseline/hash in [03-integration.md](03-integration.md).

## Scope and ownership
Own variadic command contract, schema-reader array recognition, common parser collection, usage syntax, related type/behavior tests and README. API: `variadic` is one schema key separate from fixed `positional`, hence always trailing. Reject multiple keys at runtime, duplicates/placement in fixed positionals, non-array fields, aliases and nonempty subcommands. Wrapped arrays supported through schema reader only. Omitted variadic input is always [] (optional/default do not replace it); element transforms and validation remain Zod-owned. Errors keep schema-based argument labels and full element paths. Fixed optional positionals consume first as before. Prerequisite: existing phase 1 public API.

Exclusions: other phases, plan edits, publishing and external repositories. Preserve unrelated work. Worker owns implementation/tests/README and evidence updates; supervisor owns status and acceptance checks.

## Acceptance criteria
- [ ] AC1: Plan variadic bullet and acceptance: fixed + variadic, zero/multiple values, wrapped optional/default arrays, per-element validation/path, extras/passthrough order work. Verify committed parser/run tests for zod and mini.
- [ ] AC2: Plan definition constraints: duplicate/multiple/misplaced/non-array/subcommand/alias configurations fail; schema-key typing and inferred output remain correct. Verify command/type tests and public declarations.
- [ ] AC3: Plan help and parent common policy: variadic syntax and README describe contract; existing positional and routing behavior preserved. Verify focused tests.
- [ ] AC4: Correctness and quality review accepts the issue revision; all required corrections validated.

## Evidence
Pending implementation and verification.
