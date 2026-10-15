---
id: terminal-output-01-printer
phase: 1
status: working
depends_on: []
---

# Shared structured printer

Plan: `docs/themes/terminal-output.md`, Layers/Rules/Criteria; reference: `0022-single-printer` issue and designs.

Current state: worker `s-terminal-output-01`, pane `w2P:pJ`; implementation complete, next action: await parent review. Blockers: none.

## Scope and decisions

Implement structured PrintEvent/Printer, invocation injection in runCommand/runMain/createMain, and route version, usage and errors through it. Keep renderUsage pure. Preserve legacy showUsage write/callback and onError APIs through documented adapters; library-owned output must use the selected printer. Input remains outside printer.

Ownership: related source modules, tests and public documentation for this responsibility; preserve unrelated work. Exclusions: unrelated themes, publication, external consumer edits. Prerequisite contract: completed dependency APIs and tests; coordinate shared files sequentially. Review baseline: `d0126c0`. Initial baseline and immutable hashes: see `06-integration.md`.

## Acceptance criteria

- [ ] AC1: All library output paths use the invocation printer, including help/version/errors and direct showUsage; verify event capture and error-path tests. (plan: layers / `0022-single-printer`).
- [ ] AC2: Async printer events preserve order and are drained before invocation completion/exit; verify delayed printer and rejection tests. (plan: layers / `0022-single-printer`).
- [ ] AC3: Existing APIs remain compatible through documented adapters; verify behavior and public type tests. (plan: layers / `0022-single-printer`).
- [ ] Review: correctness and quality review accepted; corrections verified.

## Evidence

Implementation validation tree: base `HEAD^{tree}` `40dd1e2177a5d80b48e21c2144ed7c5c17c79697`, uncommitted diff object `31f78bad1a26da238ca551780c021f53c504df3f`. Environment: macOS worktree, Node `v24.15.0`, pnpm `11.20.0`.

Implementation commit: `6b75c1c084dd6fe9fbbc246e74ec38fe335769ea`.

- `pnpm test`: passed, 7 files and 94 tests. Durable coverage: `src/run.test.ts` captures structured help/version/error events, legacy callback routing, ordered delayed printers, drain-before-exit, and printer rejection; `src/public-api.test.ts` covers direct `showUsage` printer output and public option types.
- `pnpm check`: passed; all 78 files formatted and no lint or type errors in 19 files.
- `pnpm build`: passed; `vp pack` emitted ESM JavaScript, source map, and bundled declarations for target Node 22.18.0.
- `git diff --check`: passed on committed tree `5399e692fac3c950b0b0082a53df5fbf9c504b26` with empty diff object `e69de29bb2d1d6434b8b29ae775ad8c2e48c5391` after the implementation and initial evidence commit.
- Original specifications remained unchanged: theme SHA-256 `68700dd10d370e69463c166855930a9b9cae51488302ae30ac10d7758d8a71c2`, 0022 issue `db486f68d6445951b09d755116339b319163627b9ae4a9dd27ae9616b66b7a37`, and 0022 designs `9137079ffa493f60613943346af07af732bd6113c8ab61aac9d0d430ab19854b`.
