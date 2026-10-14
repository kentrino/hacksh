# First-release acceptance evidence

Plan: `docs/plan/cli-framework.md`. This document records evidence, not changes to scope. Final acceptance remains pending review and final command results.

## Requirement coverage

| Requirement | Authoritative implementation and verification |
| --- | --- |
| R1: shared core-only schema reading | `src/schema.ts` imports core types/globalRegistry and isolates `_zod.def` access; `src/schema.test.ts` exercises zod and mini APIs. |
| R1: boolean versus value, optional/default requiredness, default value, inner/outer description | Reader unwraps optional/default/nullable/pipe/catch and gathers registry description; schema tests cover wrappers, pipe/transform description, default/required state and union value fallback. |
| R2: output inference, optional args, mutable context | `src/command.ts` uses core output<S>, EmptyArgs default, named context fields; command type assertions and parser mutation/transformation tests. |
| R2: typed alias/positional keys | Shape-derived ArgKey and AliasMap; `@ts-expect-error` assertions in command tests checked by type checking. |
| R2: positional definition guards | Runtime matrix tests cover unknown/duplicate keys, optional-before-required, boolean positional, alias on positional, and positional plus subcommands. |
| R2: aliases and negation conflicts | Runtime tests cover non-single-character/duplicate aliases and both noFocus/no-focus; parser tests exercise multiple aliases. |
| R3: names, kebab, flags, negation, equals and aliases | `src/parser.ts` owns option metadata and parseArgs tokenization; parser tests cover original/camel/kebab names, negation, primary/secondary aliases, equals and single-character long names. |
| R3: fixed positional and ordered leftovers | Parser tests and multiple-positional integration case cover assignment, optional omission, overflow, unknown options consuming no following value, preserved original strings/order and separator passthrough. |
| R3: value omission | Parser missing-value tests cover end-of-input and following option; real packed-consumer tests verify validation error, usage and exit 1 on Node/Deno. |
| R4: async validation and structured issues | safeParseAsync in parser; async refinement and multi-issue test asserts named/positional mapping. `src/errors.ts` preserves underlying issue objects and usage-error command. |
| R4: unchanged schema output | Parser returns result.data; tests assert coercion, transformation/defaults and mutation. Unknown arguments are kept separately. |
| R5: routing and parent validation | `src/run.ts` resolves static child definitions using tokenized parent args, parses parent prefix, passes only child suffix, and invokes only leaf run. Routing tests cover parent values/aliases/attached values, parent fallback, child result, unknown/no-run errors. |
| R5: child names and nested commands | namedChild supplements omitted names; routing loop traverses nested children. Child-help test verifies fallback name and usage. |
| R6: help/version dispatch | Run tests assert long builtins, alias overrides for h/v, root-only version, help bypass of required validation and root/child passthrough exclusion. |
| R6: generated usage | `src/usage.ts` renders metadata/multiline description, positional required/optional syntax, option aliases/value syntax, description/required/default details and subcommand list; captured-output assertions verify these representations. |
| R7: execution boundary | runCommand returns command result and never exits. runMain reads process argv and catches failures; tests verify async onError replacement, ordinary versus usage error reporting, exit 1 and real subprocess success/failure. |
| R8: named consumer cases | `src/integration.test.ts` contains sanitize-branch, cdx, git-worktree, gh-pr-commits and multiple positional scenarios; routing test explicitly covers --repo x new. |
| R9: package/type boundary | package.json ESM export and zod ^4 peer; src/index.ts public exports; generated dist imports/declarations and archive must be inspected against final build. |
| R9: runtime compatibility | Committed `scripts/test-packed-consumers.mjs`, run by pnpm test:packed, builds/packs, installs tarball in isolated Node consumer, and serves identical tarball to fresh-cache Deno npm:zitty consumer. Both exercise negation, aliases, equals, extras, passthrough, version and missing-value exit/usage. |
| R10: full review and unchanged plan | Original base/hash in execution.md; review results and final hash comparison must be recorded after corrections. |

## Corrections covered

`b30133a` consolidates token interpretation and adds regressions for attached short values, grouped unknown extras and root/child builtin passthrough. `a236dc3` adds repeatable real-package checks. The original Deno smoke was insufficient: round 1 review exposed negative-flag failure, now explicitly exercised by the committed packed tests.

## Remaining final gates

- Review corrected full implementation against original base.
- Run required ready checks on accepted final code.
- Run packed Node/Deno scenarios on accepted final code, including minimum declared Node version where available.
- Inspect exports/declarations/archive and compare original plan hash.
- Record final revisions, validation and worker/reviewer lifecycle completion.
