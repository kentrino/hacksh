---
id: terminal-output-01-printer
phase: 1
status: done
depends_on: []
---

# Shared structured printer

Plan: `docs/themes/terminal-output.md`, Layers/Rules/Criteria; reference: `0022-single-printer` issue and designs.

Current state: implementation and review accepted at `46b7574`; next action: issue 02. Blockers: none. Worker `s-terminal-output-01` (session `01a13efe-12bd-7343-922c-b371c60c69e4`) and reviewer `c-review-terminal-output-01` (session `20039c18-da41-4a43-9baa-a68a81ce665a`) completed.

## Scope and decisions

Implement structured PrintEvent/Printer, invocation injection in runCommand/runMain/createMain, and route version, usage and errors through it. Keep renderUsage pure. Preserve legacy showUsage write/callback and onError APIs through documented adapters; library-owned output must use the selected printer. Input remains outside printer.

Ownership: related source modules, tests and public documentation for this responsibility; preserve unrelated work. Exclusions: unrelated themes, publication, external consumer edits. Prerequisite contract: completed dependency APIs and tests; coordinate shared files sequentially. Review baseline: `d0126c0`. Initial baseline and immutable hashes: see `06-integration.md`.

## Acceptance criteria

- [x] AC1: All library output paths use the invocation printer, including help/version/errors and direct showUsage; verify event capture and error-path tests. (plan: layers / `0022-single-printer`).
- [x] AC2: Async printer events preserve order and are drained before invocation completion/exit; verify delayed printer and rejection tests. (plan: layers / `0022-single-printer`).
- [x] AC3: Existing APIs remain compatible through documented adapters; verify behavior and public type tests. (plan: layers / `0022-single-printer`).
- [x] Review: correctness and quality review accepted; corrections verified.

## Evidence

Implementation validation tree: base `HEAD^{tree}` `40dd1e2177a5d80b48e21c2144ed7c5c17c79697`, uncommitted diff object `31f78bad1a26da238ca551780c021f53c504df3f`. Environment: macOS worktree, Node `v24.15.0`, pnpm `11.20.0`.

Implementation commit: `6b75c1c084dd6fe9fbbc246e74ec38fe335769ea`.

- `pnpm test`: passed, 7 files and 94 tests. Durable coverage: `src/run.test.ts` captures structured help/version/error events, legacy callback routing, ordered delayed printers, drain-before-exit, and printer rejection; `src/public-api.test.ts` covers direct `showUsage` printer output and public option types.
- `pnpm check`: passed; all 78 files formatted and no lint or type errors in 19 files.
- `pnpm build`: passed; `vp pack` emitted ESM JavaScript, source map, and bundled declarations for target Node 22.18.0.
- `git diff --check`: passed on committed tree `5399e692fac3c950b0b0082a53df5fbf9c504b26` with empty diff object `e69de29bb2d1d6434b8b29ae775ad8c2e48c5391` after the implementation and initial evidence commit.
- Original specifications remained unchanged: theme SHA-256 `68700dd10d370e69463c166855930a9b9cae51488302ae30ac10d7758d8a71c2`, 0022 issue `db486f68d6445951b09d755116339b319163627b9ae4a9dd27ae9616b66b7a37`, and 0022 designs `9137079ffa493f60613943346af07af732bd6113c8ab61aac9d0d430ab19854b`.

## Review round 1

Reviewer `c-review-terminal-output-01`, session `20039c18-da41-4a43-9baa-a68a81ce665a`, reviewed `d0126c0..a0be591` and independently probed output routing and error paths on Node v24.15.0. Required worker corrections: R1 preserve immediate writes/order for synchronous legacy callbacks; R2 drain failure after a successful onError callback must still exit 1, preserving existing onError-rejection semantics; R3 make README printer snippet self-contained.

Supervisor decision R4: raw command/error event payloads are intermediate contracts for this local unreleased sequence. Issue 03 owns canonical structured JSON summaries and public documentation; it must avoid serializing executable command/schema objects directly. Original design documents are alternatives, not fixed type signatures. Full-plan review must check the final contract.

### Correction evidence

Correction validation tree: base `HEAD^{tree}` `0e67a5643b0873e18ac877c4dd9921f952743603`, uncommitted diff object `f79c2c9ad87792e4180611de5fc3f41c3d3b0b05`. Environment: macOS worktree, Node `v24.15.0`, pnpm `11.20.0`.

Correction commit: `8444ab21e9c432af10d7efc203d5ce8696130ac2`.

- `pnpm test`: passed, 7 files and 96 tests. Added regression coverage for immediate synchronous legacy callback order and exit-after-successful-`onError` when pending printer output rejects; the existing `onError` rejection test still passes.
- `pnpm check`: passed; all 78 files formatted and no lint or type errors in 19 files.
- `pnpm build`: passed; `vp pack` emitted ESM JavaScript, source map, and bundled declarations for target Node 22.18.0.
- `git diff --check`: passed on committed correction tree `5d8c14c3b22016d802d96c5de03c46db24305fd4` with empty diff object `e69de29bb2d1d6434b8b29ae775ad8c2e48c5391`.
- R3 documentation correction makes the standalone `showUsage` snippet import and use `consolePrinter` directly. R4 required no source or public-contract expansion in this issue.

## Acceptance

Parent inspected the implementation artifacts, issue evidence, and committed runtime/type regression coverage for AC1–AC3. Reviewer accepted full `d0126c0..46b7574` scope after correction review, with no remaining findings. Independent Node v24.15.0 probes verified immediate legacy callback order, async serialization and return to immediate writes after drain, synchronous printer failure propagation, successful onError exit despite drain failure, and onError rejection compatibility. These are repeatable through the regression tests in `src/run.test.ts` and public API tests; 96 tests, check and build passed for the accepted source. Review R4 is explicitly owned by issue 03, not silently discarded.
