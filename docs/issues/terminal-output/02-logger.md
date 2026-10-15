---
id: terminal-output-02-logger
phase: 2
status: review
depends_on: ["terminal-output-01-printer"]
---

# Structured run logger

Plan: `docs/themes/terminal-output.md`, Layers/Rules/Criteria; reference: `0018-run-logger` issue and designs.

Current state: implementation committed at `8c1eb0b`; next action: parent review. Blockers: none.

## Scope and decisions

Implement logger directly on CommandContext: trace/debug/info/warn/error/fatal, step/success, with(properties), getChild(category). Use structured records with level, kind, category, message, rawMessage, properties and timestamp. Template interpolation uses properties; automatic category follows root and resolved subcommand names.

Ownership: related source modules, tests and public documentation for this responsibility; preserve unrelated work. Exclusions: unrelated themes, publication, external consumer edits. Prerequisite contract: completed dependency APIs and tests; coordinate shared files sequentially. Review baseline: `bcc9829`. Initial baseline and immutable hashes: see `06-integration.md`.

## Acceptance criteria

- [ ] AC1: run logs reach the same printer with structured records, interpolation and automatic nested categories; verify runtime and type tests. (plan: layers / `0018-run-logger`).
- [ ] AC2: Bound properties, child categories, Error inputs and asynchronous output work without changing command return values; verify focused tests. (plan: layers / `0018-run-logger`).
- [ ] Review: correctness and quality review accepted; corrections verified.

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
