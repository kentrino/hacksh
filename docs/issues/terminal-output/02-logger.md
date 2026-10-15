---
id: terminal-output-02-logger
phase: 2
status: done
depends_on: ["terminal-output-01-printer"]
---

# Structured run logger

Plan: `docs/themes/terminal-output.md`, Layers/Rules/Criteria; reference: `0018-run-logger` issue and designs.

Current state: implementation and review accepted at `5cb1a78`; next action: issue 03. Blockers: none. Worker `s-terminal-output-02` (session `01a13f0b-35e7-7430-b883-7de71a1216d8`) and reviewer `c-review-terminal-output-02` (session `ad6d287b-4d3e-4926-bed5-f426732bcb64`) completed.

## Scope and decisions

Implement logger directly on CommandContext: trace/debug/info/warn/error/fatal, step/success, with(properties), getChild(category). Use structured records with level, kind, category, message, rawMessage, properties and timestamp. Template interpolation uses properties; automatic category follows root and resolved subcommand names.

Ownership: related source modules, tests and public documentation for this responsibility; preserve unrelated work. Exclusions: unrelated themes, publication, external consumer edits. Prerequisite contract: completed dependency APIs and tests; coordinate shared files sequentially. Review baseline: `bcc9829`. Initial baseline and immutable hashes: see `06-integration.md`.

## Acceptance criteria

- [x] AC1: run logs reach the same printer with structured records, interpolation and automatic nested categories; verify runtime and type tests. (plan: layers / `0018-run-logger`).
- [x] AC2: Bound properties, child categories, Error inputs and asynchronous output work without changing command return values; verify focused tests. (plan: layers / `0018-run-logger`).
- [x] Review: correctness and quality review accepted; corrections verified.

## Evidence

Implementation commit: `8c1eb0bf6fb57bbdcaa8c7daafb099b1effd5545`.

Implementation validation snapshot: assignment `HEAD^{tree}`
`06a0ef826fdb81055b80d17d5624c6a0119585f9`, uncommitted diff object
`f60a3efe1de1219ed6ed144f90a013fefea655aa`. Environment: macOS worktree, Node
`v24.15.0`, pnpm `11.20.0`. Committing produced tree
`e1b5f7f6fe24af5bdbbdc8dffb9ce7bbf4921efe`; `git diff --quiet 8c1eb0b -- .
':!docs/issues'` exited 0, so the passing source results remain reusable after commit.

- `pnpm check`: passed; all 79 files formatted and no warnings, lint errors, or type errors in 20 files.
- `pnpm test`: passed; 7 files and 102 tests. Durable runtime coverage in `src/run.test.ts` exercises all severity levels and info kinds, interpolation, property precedence, automatic and child categories, retained Error objects, unchanged return identity, serialized asynchronous writes, drain-before-return, and rejected writes. Durable type coverage in `src/public-api.test.ts` verifies the inferred context logger, method parameters, record unions, and exported logger/event types.
- `pnpm build`: passed; `vp pack` emitted ESM JavaScript, source map, and bundled declarations targeting Node 22.18.0.
- `ZITTY_MINIMUM_NODE=/Users/kento/.local/share/mise/installs/node/22.18.0/bin/node pnpm test:packed`: passed; packed consumers passed on Node 22.18.0 and Deno.
- `git diff --check`: passed after the implementation commit on `HEAD^{tree}` `e1b5f7f6fe24af5bdbbdc8dffb9ce7bbf4921efe` plus uncommitted diff object `3132bb64488965ebc82f4223a9e144a87cf8957c`.

Original specifications remain unchanged: theme SHA-256
`68700dd10d370e69463c166855930a9b9cae51488302ae30ac10d7758d8a71c2`, 0018
issue `70fd6dd899bd997f17bdcfa33dac7ccb3385a191e1cb50e743d6420c2ed618ad`, and
0018 designs `22d8e86e1ff7efbef7816ba30368ef105c967b20b1c3695094c3b17b275d9ced`.

## Review round 1

Reviewer `c-review-terminal-output-02`, session `ad6d287b-4d3e-4926-bed5-f426732bcb64`, reviewed `bcc9829..4216a58`. R1: interpolation String conversion can throw for null-prototype objects or throwing coercion methods; leave the placeholder intact on conversion failure, preserving the record and run result, with regression tests. Other behavior/type/quality acceptance passed.

Supervisor decision R2: all levels are emitted/displayed by default. No hidden threshold or new verbose flag is introduced; filtering is outside this plan. Document this policy. Pretty output (issue 04) owns property display; JSON (issue 03) preserves structured data.

### Correction evidence

Correction commit: `5e4bde0f82f05a28f40d917a0593b7fbba48b59d`.

Correction validation snapshot: base `HEAD^{tree}`
`f69e5be0c819d7b2b4892417773bb85d28816a7d`, uncommitted diff object
`da103a98a09c578e9efefd57884d38b2640317c4`. Environment: macOS worktree, Node
`v24.15.0`, pnpm `11.20.0`; minimum-runtime executable reported `v22.18.0`.
Committing produced tree `7a4c2f09c48f897715ed18d513c956112cd3f8b8`; `git diff --quiet
5e4bde0 -- . ':!docs/issues'` exited 0, so the validated source is unchanged after
commit.

- `pnpm exec vp test src/run.test.ts`: passed, 1 file and 34 tests. The focused regression verifies null-prototype properties and values with throwing `toString` leave their placeholders unchanged, retain the original property objects in both emitted records, and preserve the exact `run` return object.
- `pnpm check`: passed; all 79 files formatted and no warnings, lint errors, or type errors in 20 files.
- `pnpm test`: passed; 7 files and 103 tests.
- `pnpm build`: passed; ESM JavaScript, source map, and declarations emitted for the Node 22.18.0 target.
- `ZITTY_MINIMUM_NODE=/Users/kento/.local/share/mise/installs/node/22.18.0/bin/node pnpm test:packed`: passed; packed consumers passed on Node 22.18.0 and Deno.
- `git diff --check`: passed on the correction validation snapshot.

R1 is corrected by containing property string conversion failures within interpolation; the
record still emits with the original property and unchanged placeholder. R2 is documented in
the public logger API: every level is emitted and displayed by default, with no built-in severity
threshold or verbose flag. No unresolved worker items remain pending re-review.

## Acceptance

Parent inspected committed logger/runtime/type coverage and correction evidence for AC1–AC2. Reviewer accepted full `bcc9829..5cb1a78` scope after independently rerunning coercion probes on Node v24.15.0: both formerly throwing values yield unchanged placeholders, preserving records and return behavior. No required findings remain. Final source validation: 103 tests, check, build and Node 22.18.0/Deno packed consumers passed; evidence above identifies source snapshots and committed repeatable tests.
