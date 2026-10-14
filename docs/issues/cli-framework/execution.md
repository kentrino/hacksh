# CLI framework execution

- Plan: `docs/plan/cli-framework.md`; all first-release requirements, excluding unchecked features and explicitly excluded features.
- Initial SHA-256: `83825f8688dd1055c19af65300161bf6e12588a0e4e5813bd6dae87a8b2077b4`.
- Initial revision: `ef5268080a5e9a61eebfc4b49c02939f10a7313d`.
- Scope: local implementation, tests, documentation, packaging verification and review. No publishing or consumer repository edits.
- Status: initial mapping complete; implementation pending.

## Requirement mapping

All requirements belong to [01-release.md](01-release.md). One worker owns implementation across the dependent layers; a full-base review covers their interactions.

| ID | Requirements | Acceptance evidence required |
| --- | --- | --- |
| R1 | zod/v4/core-only introspection and public types; zod and mini; boolean detection; optional/default requiredness; defaults/descriptions across optional/default/nullable/pipe/transform/catch; unions treated as values | Wrapper matrix tests on both schema APIs |
| R2 | defineCommand, optional metadata/args, z.output context, typed alias/positional keys, mutable output; definition errors for invalid/duplicate positional, optional ordering, boolean positional, positional aliases, invalid/duplicate aliases, no-prefix names, positional plus subcommands | Runtime definition tests and compile-time assertions |
| R3 | node:util parser; named values/flags/negation, original and kebab spelling, aliases, equals form; fixed positional assignment and missing fields; unknown tokens/overflow ordered in extraArgs; separator passthrough; missing values | Parser and integration cases; unknown values consume no following token |
| R4 | Async validation, all zod issues mapped to named/positional fields, structured exported usage/validation errors, schema output unchanged | Async refinement/output/mutation and multi-issue tests |
| R5 | Static nested subcommands, fallback name, parent value/alias skipping, parent prefix validation, unknown/missing command errors, parent run only without child, child rawArgs and return values | Routing and parent/child isolation tests |
| R6 | Help/version builtins, short alias overrides, long builtins always available, deepest help, root-only version, generated metadata/multiline descriptions/required/default/positional/options/child list | Captured help/version assertions including invalid-required bypass |
| R7 | runCommand argv/result/no exit; runMain process argv, usage vs ordinary error reporting, async onError replacement, exit 1 confined to outer boundary | Execution tests including real subprocess exit/output |
| R8 | sanitize-branch, cdx, git-worktree, gh-pr-commits equivalents, multiple named positional, --repo x new | Named consumer-equivalent integration scenarios |
| R9 | ESM package, zod ^4 peer, public declarations, Deno npm consumer compatibility; repository check/test/build; no out-of-scope public APIs | Build/package inspection, Node built-package and Deno packaged-consumer smoke tests |
| R10 | Preserve plan, full implementation review and corrections | Final plan hash, review report relative to initial revision, clean required validation |

## Execution history

Initial records precede delegation. Worker/reviewer identifiers, handles, implementation revisions, verification results and next actions will be appended as observed.
