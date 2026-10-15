---
id: terminal-output-03-output-mode
phase: 3
status: working
depends_on: ["terminal-output-02-logger"]
---

# Output mode and JSON

Plan: `docs/themes/terminal-output.md`, Layers/Rules/Criteria; reference: `0019-output-format-selection` issue and designs.

Current state: worker `s-terminal-output-03`, pane `w2P:pP`; implementation committed at `1f57c43`, correction committed at `9b9767c`, session `01a13f15-9f63-7cb1-9ba6-069a8c304efb`; reviewer `c-review-terminal-output-03`, pane `w2P:pQ`; next action: re-review. Blockers: none.

## Scope and decisions

Choose design B: HACKSH_OUTPUT overrides options.output (auto/pretty/json), auto uses CI only; non-TTY alone keeps pretty. Reject invalid settings explicitly. No new reserved flags. Resolve once before execution. Interactive requires pretty, non-CI and input/output TTY; color requires pretty, output TTY and no non-empty NO_COLOR. JSON is one event per line, logs/help/version on stdout and errors/warning+ logs on stderr. Define documented structured usage/error summaries without implementing unrelated 0008/0009 scope. Review decision R4 from issue 01: its raw command/error event payloads are intermediate unreleased contracts. This issue owns canonical summaries, final public event types/documentation, and must not serialize executable commands or schemas directly.

Ownership: related source modules, tests and public documentation for this responsibility; preserve unrelated work. Exclusions: unrelated themes, publication, external consumer edits. Prerequisite contract: completed dependency APIs and tests; coordinate shared files sequentially. Review baseline: `43cdf76`. Initial baseline and immutable hashes: see `06-integration.md`.

## Acceptance criteria

- [ ] AC1: Mode priority, CI, TTY, NO_COLOR and invalid settings behave as documented; verify matrix tests and early-error paths. (plan: layers / `0019-output-format-selection`).
- [ ] AC2: All event kinds serialize as parseable JSON lines without ANSI; preserve structured usage and error information and robust unknown property serialization; verify tests. (plan: layers / `0019-output-format-selection`).
- [ ] AC3: No argument namespace changes and run code is identical across formats; verify behavior/type tests. (plan: layers / `0019-output-format-selection`).
- [ ] Review: correctness and quality review accepted; corrections verified.

## Evidence

Implementation commit: `1f57c43e02f72af85dc4bf1510aec9b2ac4ae692`.

Final validation snapshot: assignment `HEAD^{tree}`
`264ab833f89c254cb83d7e472979a4a0b66bfb07`, uncommitted diff object
`d10a725993d7bc1a7a8871c9ddaabd45640bf982`. Environment: macOS worktree, Node
`v24.15.0`, pnpm `11.20.0`; minimum-runtime executable reported `v22.18.0`, and
Deno reported `2.7.14`. Committing produced tree
`987d17f6bce8555a9bb80a84d7e4e76c367f5c47`; `git diff --quiet 1f57c43 -- .
':!docs/issues'` exited 0, so the validated source is unchanged after commit.

- `pnpm check`: passed; all 80 files were formatted and 21 files had no warnings,
  lint errors, or type errors.
- `pnpm test`: passed; 8 files and 122 tests. Durable coverage in
  `src/printer.test.ts`, `src/run.test.ts`, and `src/public-api.test.ts` exercises
  the precedence/CI/TTY/NO_COLOR matrix, invalid settings before execution, no
  reserved flag conflicts, stable run code, early JSON validation errors, every
  event kind, stdout/stderr routing, ANSI removal, canonical help/error data, and
  cycles, BigInt, Error causes, hostile properties, and denied environment access.
- `pnpm build`: passed; ESM JavaScript, source map, and bundled declarations were
  emitted for target Node 22.18.0.
- `ZITTY_MINIMUM_NODE=/Users/kento/.local/share/mise/installs/node/22.18.0/bin/node
pnpm test:packed`: passed; packed Node 22.18.0 and no-env-permission Deno
  consumers passed. The first packed run exposed Deno's denied `process.env`
  proxy; the resolver was corrected to treat inaccessible environment values as
  absent before this passing final snapshot.
- `CI=1 pnpm test`: passed, 8 files and 122 tests, verifying compatibility tests
  remain deterministic while automatic invocation output selects JSON in CI.
- `git diff --check && git diff --cached --check`: passed on the final validation
  snapshot.

Original specifications remain unchanged: theme SHA-256
`68700dd10d370e69463c166855930a9b9cae51488302ae30ac10d7758d8a71c2`, 0019
issue `0b4445ff95f9dbc7bebfdd42a825e62f41124dd6ca7aaab9615f7d53af16445e`, 0019
designs `d98557b3b6cd0c23636611123ec7531d18756b8f6c5b6161f4ce12a5c1ea07f3`,
0022 issue `db486f68d6445951b09d755116339b319163627b9ae4a9dd27ae9616b66b7a37`,
and 0022 designs `9137079ffa493f60613943346af07af732bd6113c8ab61aac9d0d430ab19854b`.

## Review round 1

Reviewer `c-review-terminal-output-03`, session `ecab4332-f6b8-405e-bd47-f371e3313656`, reviewed `43cdf76..a37d91d` with Node v24.15.0 probes. Required corrections: R1 canonical nested errors without command/schema leakage; R2 robust toJSON/URL/Buffer/typed-array/key and per-property normalization; R3 derive text help from one usage summary; R4 explicit error kind instead of name-prefix inference; R5 shared stream routing/text rendering and separated normalizer; R6 non-empty NO_COLOR disables color.

Supervisor decision S1: invalid output settings never execute the command. `runCommand` rejects as before. `runMain` honors onError if supplied; otherwise emits a structured error through the supplied printer, or a dedicated JSON error printer when no invocation mode can be established, then exits 1 using existing drain semantics. This is error reporting only, not fallback execution. Document and test. Case-sensitive output values and any non-empty CI selecting JSON remain intentional. NO_COLOR follows the non-empty-value convention (clarification for issue 04).

### Correction evidence

Correction commit: `9b9767c50407b3b8eec14abdca0a3c058e398bef`.

Correction validation snapshot: base `HEAD^{tree}`
`8b0fa65ada3f8c5a0003f78e78552b422c60a59e`, uncommitted diff object
`434072caf00fd9f7c28cdbe36f81cb4d9864a350`. Environment: macOS worktree, Node
`v24.15.0`, pnpm `11.20.0`; minimum-runtime executable reported `v22.18.0`, and
Deno reported `2.7.14`. Committing produced tree
`2020f3bf748cf44a94303bc887fe71c3d6e65ba1`; `git diff --quiet 9b9767c -- .
':!docs/issues'` exited 0, so the validated source is unchanged after commit.

- `pnpm exec vp test src/printer.test.ts src/run.test.ts src/public-api.test.ts
  src/process.test.ts`: passed, 4 files and 86 focused tests. Durable regressions
  cover actual validation errors nested in causes and log properties, custom
  printer canonical cycles, URL/Buffer/typed-array/toJSON values, ANSI keys,
  independently hostile Error properties, explicit error kinds, summary-derived
  usage text, empty/non-empty NO_COLOR, and every invalid-runMain reporting path.
  The process test proves malformed HACKSH_OUTPUT exits 1 with exactly one
  machine-readable error line and no command execution or native uncaught output.
- `pnpm check`: passed; all 81 files were formatted and 22 files had no warnings,
  lint errors, or type errors.
- `pnpm test`: passed; 8 files and 133 tests.
- `pnpm build`: passed; ESM JavaScript, source map, and bundled declarations were
  emitted for target Node 22.18.0.
- `ZITTY_MINIMUM_NODE=/Users/kento/.local/share/mise/installs/node/22.18.0/bin/node
  pnpm test:packed`: passed; packed Node 22.18.0 and Deno consumers passed.
- `CI=1 pnpm test`: passed, 8 files and 133 tests.
- `git diff --check && git diff --cached --check`: passed on the correction
  validation snapshot.

R1–R6 are corrected in committed source and tests: recursive summaries remove
commands/schemas before all printers; JSON normalization is isolated and preserves
guarded platform data; usage text renders from its canonical summary; error kind
controls historical prefixes; printers share routing/text policy; and only non-empty
NO_COLOR disables color. S1 is implemented with queued custom/default JSON reporting,
onError compatibility, guaranteed non-execution, and exit-after-drain behavior.
