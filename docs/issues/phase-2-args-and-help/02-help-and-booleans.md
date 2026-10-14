# P2-02

- Plan: `docs/plan/cli-framework-next/phase-2-args-and-help.md` and parent README common policy/completion.
- Phase: 2
- Status: done
- depends_on: [P2-01]
- Worker: s-p2-help (pane w2P:p9); next action: none; implementation/review complete; blockers: none.
- Baseline: `cd88d4e`; initial baseline/hash in [03-integration.md](03-integration.md).

## Scope and ownership

Own schema enum metadata, command display options, help rendering, boolean token handling, relevant behavior/type tests and README. Proposed API: `argDisplay` schema-keyed map of `{ name?: string, valueName?: string, negatedDescription?: string }`; name is positional label, valueName is named-option value label, negatedDescription renders a --no-flag help row. Display metadata affects help only; error labels and Zod paths remain stable. Read enum choices through schema layer wrappers, never infer from arbitrary unions/refinements. Boolean inline true/false converts only boolean fields; all other strings and any --no-flag=VALUE are validation errors. Keep shared tokenizer and builtin/child boundaries. Prerequisite: P2-01 trailing variadic contract.

Exclusions: other phases, plan edits, publishing and external repositories. Preserve unrelated work. Worker owns implementation/tests/README and evidence updates; supervisor owns status and acceptance checks.

## Acceptance criteria

- [x] AC1: Plan enum/display/negative-description bullets: descriptions, wrapped enum choices, fixed/variadic names and named value names render for zod and mini; union/refine choices are not inferred. Verify help/schema tests.
- [x] AC2: Plan typed metadata: display map keys checked against schema; output inference preserved; display metadata leaves error labels/paths unchanged. Verify type and validation tests.
- [x] AC3: Plan boolean bullet and explicit decision: --flag=true/false accepted, other strings and --no-flag=VALUE rejected, nonboolean inputs untouched, old boolean regression updated; routing/help boundaries and aliases remain correct. Verify parser/run tests.
- [x] AC4: Plan NO_COLOR/CI bullet: rendered and emitted help contains no ANSI under either environment. Verify tests.
- [x] AC5: Correctness and quality review accepts revision; required corrections validated.

## Evidence

- Implementation revision: `641fd494ce2640ea5697a2d689f65efd7bbceb1b` (`feat: expand
help and boolean arguments`), based on accepted P2-01 revision `cd88d4e` plus the issue-assignment
  commit.
- AC1 behavior coverage is committed in `src/schema.test.ts` and `src/public-api.test.ts`. It
  covers enum choices through supported wrappers and variadic array elements for zod and zod/mini,
  excludes arbitrary unions/literals/refinements, and renders descriptions, fixed/variadic display
  names, named-option value names, and dedicated negated descriptions.
- AC2 type/runtime coverage is committed in `src/command.test.ts`, `src/parser.test.ts`, and the
  emitted `dist/index.d.ts`. `argDisplay` keys are schema-keyed, invalid runtime keys fail during
  definition, output inference is unchanged, and custom help metadata leaves Zod paths and CLI
  error labels unchanged.
- AC3 parser coverage is committed in `src/parser.test.ts`; the packed regression is updated in
  `scripts/test-packed-consumers.mjs`. Explicit `true`/`false` is converted only for boolean
  fields, other inline strings and valued negations fail validation, and nonboolean `false` remains
  a string. Existing tokenizer routing, passthrough, builtin, alias, and negation tests remain green.
- AC4 coverage is committed in `src/public-api.test.ts`: both rendered and emitted help is asserted
  ANSI-free with `NO_COLOR` and `CI`. The renderer remains plain text and adds no color path.
- README documents enum help, the `argDisplay` API, stable parsing/error semantics, explicit
  boolean values, valued-negation errors, and the `NO_COLOR`/`CI` guarantee.
- `/usr/bin/time -p pnpm exec vp check README.md scripts/test-packed-consumers.mjs
src/command.test.ts src/command.ts src/index.ts src/parser.test.ts src/parser.ts
src/public-api.test.ts src/schema.test.ts src/schema.ts src/usage.ts` — passed: all 11 files
  formatted and no lint/type errors; 1.09s (pnpm 11.20.0, Node 24.15.0).
- `/usr/bin/time -p pnpm test` — passed: 7 files, 81 tests; Vitest 364ms, command 0.93s
  (Node 24.15.0).
- `/usr/bin/time -p pnpm build` — passed in 0.75s; target `node22.18.0`, including emitted public
  `ArgDisplay`, `ArgDisplayMap`, and `CommandDef.argDisplay` declarations (Node 24.15.0).
- `/usr/bin/time -p env
ZITTY_MINIMUM_NODE=/Users/kento/.local/share/mise/installs/node/22.18.0/bin/node pnpm
test:packed` — passed in 3.52s: exact Node 22.18.0 and Deno 2.7.14 consumers, including explicit
  boolean false and valued-negation rejection.
- `/usr/bin/time -p pnpm ready` — stops in the global formatting check after 1.04s on the four
  previously assigned coordination files: `.agents/skills/execute-plan/SKILL.md`,
  `.agents/skills/execute-plans/SKILL.md`, this issue file, and `03-integration.md`. Per assignment,
  those global Markdown formatting corrections remain P2-03 work; the equivalent scoped check,
  full tests, build, and packed consumers above pass.
- Review correction revision: `f98d91716b1637462446a20b8ee4e3d389b7778d` (`fix: enforce
boolean token syntax`) addresses c-review-p2-02 findings W1 and W2 without amending the reviewed
  implementation.
- W1: tokenizer-owned indexed issues now reject every invalid inline boolean and every valued
  negation before Zod parsing. Issues survive catch-wrapped schemas and later valid assignments,
  retain typed labels (`--flag` / `--no-flag`) and dedicated messages, and are filtered with their
  command segment. Coverage is committed in `src/parser.test.ts` and `src/run.test.ts`, including
  catch schemas, invalid-then-valid input, multiple issues, child boundaries, and help/version
  builtin bypasses. The nested value-selection ternary was replaced by explicit branches.
- W2: enum help reads the schema core accepted-value set, excluding numeric native enum reverse
  mappings. `src/schema.test.ts` and `src/public-api.test.ts` verify the equivalent
  `{ A: 0, B: 1, 0: "A", 1: "B" }` shape for zod and zod/mini and render only choices `0, 1`.
- Latest correction validation: `/usr/bin/time -p pnpm exec vp check
scripts/test-packed-consumers.mjs src/parser.test.ts src/parser.ts src/public-api.test.ts
src/run.test.ts src/schema.test.ts src/schema.ts` passed all 7 files with no formatting,
  lint, or type errors in 0.82s; `/usr/bin/time -p pnpm test` passed 7 files and 85 tests in
  0.92s; `/usr/bin/time -p pnpm build` passed in 0.74s targeting Node 22.18.0; and
  `/usr/bin/time -p env
ZITTY_MINIMUM_NODE=/Users/kento/.local/share/mise/installs/node/22.18.0/bin/node pnpm
test:packed` passed exact Node 22.18.0 and Deno 2.7.14 consumers in 3.09s.

- Review acceptance: c-review-p2-02 accepted `eab6916` after correction `f98d917`, no remaining findings. W1/W2 resolved; reviewer checked issue scoping, builtin bypass and accepted enum values, reusing verified 85-test/build/packed evidence.
