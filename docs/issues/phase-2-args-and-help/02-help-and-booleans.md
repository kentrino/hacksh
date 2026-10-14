# P2-02

- Plan: `docs/plan/cli-framework-next/phase-2-args-and-help.md` and parent README common policy/completion.
- Phase: 2
- Status: pending
- depends_on: [P2-01]
- Worker: unassigned; next action: delegate when ready; blockers: none.
- Baseline: recorded at assignment; initial baseline/hash in [03-integration.md](03-integration.md).

## Scope and ownership
Own schema enum metadata, command display options, help rendering, boolean token handling, relevant behavior/type tests and README. Proposed API: `argDisplay` schema-keyed map of `{ name?: string, valueName?: string, negatedDescription?: string }`; name is positional label, valueName is named-option value label, negatedDescription renders a --no-flag help row. Display metadata affects help only; error labels and Zod paths remain stable. Read enum choices through schema layer wrappers, never infer from arbitrary unions/refinements. Boolean inline true/false converts only boolean fields; all other strings and any --no-flag=VALUE are validation errors. Keep shared tokenizer and builtin/child boundaries. Prerequisite: P2-01 trailing variadic contract.

Exclusions: other phases, plan edits, publishing and external repositories. Preserve unrelated work. Worker owns implementation/tests/README and evidence updates; supervisor owns status and acceptance checks.

## Acceptance criteria
- [ ] AC1: Plan enum/display/negative-description bullets: descriptions, wrapped enum choices, fixed/variadic names and named value names render for zod and mini; union/refine choices are not inferred. Verify help/schema tests.
- [ ] AC2: Plan typed metadata: display map keys checked against schema; output inference preserved; display metadata leaves error labels/paths unchanged. Verify type and validation tests.
- [ ] AC3: Plan boolean bullet and explicit decision: --flag=true/false accepted, other strings and --no-flag=VALUE rejected, nonboolean inputs untouched, old boolean regression updated; routing/help boundaries and aliases remain correct. Verify parser/run tests.
- [ ] AC4: Plan NO_COLOR/CI bullet: rendered and emitted help contains no ANSI under either environment. Verify tests.
- [ ] AC5: Correctness and quality review accepts revision; required corrections validated.

## Evidence
Pending implementation and verification.
