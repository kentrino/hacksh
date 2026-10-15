---
id: terminal-output-04-pretty
phase: 4
status: working
depends_on: ["terminal-output-03-output-mode"]
---

# Human-readable rendering

Plan: `docs/themes/terminal-output.md`, Layers/Rules/Criteria; reference: `0020-pretty-output` issue and designs.

Current state: worker implementation committed at `49a45eb`; next action: parent review. Blockers: none.

## Scope and decisions

Choose fixed rendering (design C), with color and Unicode/ASCII configuration. Use node:util styleText, no dependencies. NO_COLOR disables color only when non-empty (issue 03 review clarification); use the resolved mode consistently. Give records level/kind symbols and consistent bars; render multiline usage/errors in the same style. Avoid implicit start/end output for invocations; use consistent per-event rendering and document this decision.

Ownership: related source modules, tests and public documentation for this responsibility; preserve unrelated work. Exclusions: unrelated themes, publication, external consumer edits. Prerequisite contract: completed dependency APIs and tests; coordinate shared files sequentially. Review baseline: `9a56757`. Initial baseline and immutable hashes: see `06-integration.md`.

## Acceptance criteria

- [ ] AC1: Human output distinguishes levels, step and success with symbols, even without color; verify rendering snapshots/assertions. (plan: layers / `0020-pretty-output`).
- [ ] AC2: Multiline help/errors/log properties use consistent rendering; color/ASCII options and NO_COLOR work without corrupting JSON; verify tests. (plan: layers / `0020-pretty-output`).
- [ ] Review: correctness and quality review accepted; corrections verified.

## Evidence

Implementation commit: `49a45eb43c88a6f8c091217daa28a1950e6455b6`.

Final validation snapshot: assignment `HEAD^{tree}`
`e6e4ee35e5f96e749e04e0f255eabc6dcd0f3c57`, uncommitted diff object
`6ce6a4ae5754c275357ec59c4b509a1dc87f6d54`. Environment: macOS worktree,
Node `v24.15.0`, pnpm `11.20.0`; minimum-runtime executable reported
`v22.18.0`, and Deno reported `2.7.14`. Committing produced tree
`25fc0cf3499607f1983f2c6d06d69e41594d5fb8`; `git diff --quiet 49a45eb -- .
':!docs/issues'` exited 0, so the validated source is unchanged after commit.

- `pnpm check`: passed; all 82 files were formatted and 23 files had no warnings,
  lint errors, or type errors.
- `pnpm test`: passed; 8 files and 139 tests. Durable rendering coverage in
  `src/printer.test.ts` distinguishes all six levels plus step/success without
  color, exercises Unicode/ASCII symbols, ANSI color, categories, multiline
  properties/help/errors, consistent bars, and stdout/stderr routing.
  `src/run.test.ts` verifies resolved TTY color, non-empty `NO_COLOR`, invocation
  ASCII configuration, selected-printer behavior, and unchanged JSON events.
  `src/public-api.test.ts` covers the exported pretty-printer configuration.
- `pnpm build`: passed; ESM JavaScript, source map, and bundled declarations were
  emitted for target Node 22.18.0.
- `ZITTY_MINIMUM_NODE=/Users/kento/.local/share/mise/installs/node/22.18.0/bin/node
  pnpm test:packed`: passed; packed Node 22.18.0 and Deno consumers passed with
  intentional pretty help, version, and error assertions.
- `CI=1 pnpm test`: passed; 8 files and 139 tests, including unchanged JSON-mode
  behavior and ANSI-free serialization.
- `git diff --check`: passed on the final validation snapshot; after the source
  commit, `git diff --cached --check` also passed before commit.

The fixed renderer exposes only color and Unicode selection, retains the legacy
undecorated adapters and pure `renderUsage`, emits no automatic invocation
start/end messages, and keeps its semantic mark/bar tables internal so later
prompt states can extend the same rendering boundary without a public theme API.
Original specifications remain unchanged: theme SHA-256
`68700dd10d370e69463c166855930a9b9cae51488302ae30ac10d7758d8a71c2`, 0020
issue `23232e36764511e14cb93fb22c519311f966eea7a4c60dfc80954a961ea5f548`, and
0020 designs `0eec55d94b6c02af8a349fcacb7413e92d16b97635e365251320d606ecc9f0f2`.
