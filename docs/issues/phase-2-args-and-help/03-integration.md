# P2-03

- Plan: `docs/plan/cli-framework-next/phase-2-args-and-help.md` and parent README common policy/completion.
- Phase: 2
- Status: working
- depends_on: [P2-01, P2-02]
- Worker: s-p2-integration (pane w2P:pB); next action: integration validation then full review; blockers: none.
- Baseline: `757f077` for integration additions; full review baseline `0655f46`; initial baseline/hash in [03-integration.md](03-integration.md).

## Scope and ownership

Own cross-task integration tests, packed consumer fixtures/scripts, final README coherence and validation. Full baseline review includes all phase 2 changes. Implementation remains delegated. Prerequisite: both feature issues accepted.

Exclusions: other phases, plan edits, publishing and external repositories. Preserve unrelated work. Worker owns implementation/tests/README and evidence updates; supervisor owns status and acceptance checks.

## Acceptance criteria

- [ ] AC1: Every phase 2 bullet, kickoff decision and acceptance condition has direct final evidence in P2-01/P2-02 or this issue; reconcile explicitly.
- [ ] AC2: Parent completion: pnpm ready and pnpm test:packed pass final code; actual new-feature consumers run on Node 22.18.0 and Deno npm, tarball/types verified. Record exact commands/runtimes/results and test references.
- [ ] AC3: Full change correctness/quality review from initial baseline accepts final implementation and task interactions.
- [ ] AC4: Original plan hash unchanged; all active implementation issues accepted and no unresolved requirements.

## Evidence

### Coverage reconciliation

| Requirement                        | Direct final evidence                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                       |
| ---------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Variadic definition and behavior   | P2-01 AC1-AC3 records `src/command.test.ts`, `src/parser.test.ts`, `src/integration.test.ts`, and `src/public-api.test.ts` coverage for fixed plus trailing variadic arguments, zero/multiple values, optional/default array wrappers, transforms, element error paths, definition failures, usage, extras order, and the `--` boundary.                                                                                                                                                                                    |
| Enum help boundary                 | P2-02 AC1 records `src/schema.test.ts` and `src/public-api.test.ts` coverage for zod and zod/mini enums through supported wrappers and variadic elements, numeric enum reverse-map filtering, and no inference from arbitrary unions, literals, or refinements.                                                                                                                                                                                                                                                             |
| Display names and descriptions     | P2-02 AC1-AC2 records schema-keyed `argDisplay` type/runtime tests and stable validation labels/paths. The packed consumer at `c94f5dc` jointly renders a fixed `<MODE>`, variadic `[INPUT...]`, named `--format=<FORMAT>`, schema descriptions, wrapped enum choices, and a dedicated negated description with zod and zod/mini.                                                                                                                                                                                           |
| Boolean syntax                     | P2-02 AC3 records parser/run coverage for explicit `true`/`false`, invalid inline values, valued negations, catch schemas, repeated values, command boundaries, builtin bypass, and non-boolean strings. The packed zod and zod/mini commands at `c94f5dc` accept both explicit values and assert typed `ZittyValidationError` failures for `--enabled=maybe` and `--no-enabled=false`.                                                                                                                                     |
| Plain help                         | P2-02 AC4 records direct rendered/emitted help tests under `NO_COLOR` and `CI`. The packed Node and Deno consumers at `c94f5dc` also execute help with each environment variable and reject ANSI output.                                                                                                                                                                                                                                                                                                                    |
| Kickoff decisions                  | P2-01 parser tests and the packed consumer prove absent variadics become `[]`, including optional/default wrappers. P2-02 parser/help tests prove display metadata does not change schema-based error labels or paths and valued negations are rejected.                                                                                                                                                                                                                                                                    |
| Common policy and phase acceptance | The existing regression suite covers shared tokenization, parent/child routing, unknown ordering, passthrough, aliases, help/version boundaries, zod output inference, and both schema flavors. `README.md` documents the final public contract. The packed TypeScript consumer imports `ArgDisplay`, `ArgDisplayMap`, and `CommandDef`, compiles schema-keyed metadata and inferred outputs for zod and zod/mini against the installed tarball, and the runtime consumers load that ESM tarball through Node and Deno npm. |

All seven phase bullets, the three kickoff decisions, the phase acceptance paragraph, and the
parent common packaging/environment requirements therefore have direct committed coverage. P2-01
and P2-02 are accepted; the remaining supervisor action is the full-baseline correctness/quality
review and acceptance-checkbox update.

### Integration implementation and final gates

- Formatting-only prerequisite revision: `9a1b015` (`style: format phase 2 coordination docs`). It
  changes only Markdown layout in the two named skill files and phase issue records; no plan file
  or instruction semantics changed.
- Packed integration revision: `c94f5dc734ead8ccef40dfb757c8606c87cafbd7` (`test: integrate
phase 2 packed consumers`). `scripts/test-packed-consumers.mjs` installs the generated tarball,
  compiles its public types, and runs the combined zod and zod/mini features through Node and Deno.
- `/usr/bin/time -p pnpm ready` at `c94f5dc` — passed in 2.31s on host Node 24.15.0 and pnpm
  11.20.0: all 40 files formatted, 18 lint/type targets clean, 7 test files and 85 tests passed,
  and the ESM build plus declarations completed for target Node 22.18.0.
- `/usr/bin/time -p env
ZITTY_MINIMUM_NODE=/Users/kento/.local/share/mise/installs/node/22.18.0/bin/node pnpm
test:packed` at `c94f5dc` — passed in 3.21s. The installed-tarball consumers ran under exact Node
  22.18.0 and Deno 2.7.14 via the npm registry path; combined phase 2 behavior, plain help, and the
  packed public type consumer all passed.
- `sha256sum docs/plan/cli-framework-next/phase-2-args-and-help.md` after the final gates returned
  `0739c6e72102289a04a21fc533745ae5e37da06880a3201c7679859242a4fbef`, exactly the initial
  plan hash. No plan file was edited.

## Initial state

- Branch: main; clean working tree.
- Base: `0655f46f5a701c320fe961196b84923b12268891`.
- Original plan SHA-256: `0739c6e72102289a04a21fc533745ae5e37da06880a3201c7679859242a4fbef`.
- No applicable AGENTS.md found in repository or ancestor paths.
- Decisions: use plan proposal [] for absent variadic (Zod defaults/optional see []), reject values on negated flags, keep help display names separate from stable error names/paths.
- Coverage: P2-01 owns variadic bullet and corresponding acceptance; P2-02 owns remaining six bullets, typed display options and schema enum boundary; P2-03 owns common packaging/environment/final-review obligations. Dependencies are acyclic.
- Issue location follows task-requested phase-specific directory; historical phase 1 records remain untouched.

## Integration preparation

- P2-01 reviewed by c-review-p2-01 at 1f317a6, accepted without required corrections. Low cleanup nit dropped.
- P2-02 reviewer c-review-p2-02 (pane w2P:pA) reviewed fc052d9 and sent W1 (tokenizer-owned invalid-boolean errors) and W2 (numeric enum reverse mappings) to s-p2-help for correction. Reviewer remains available.
- Formatting prerequisite: pnpm ready detects pre-existing formatting in `.agents/skills/execute-plan/SKILL.md` and `.agents/skills/execute-plans/SKILL.md`, plus phase 2 issue Markdown. P2-03 owns formatting-only cleanup of these files; no instruction changes or plan edits.
