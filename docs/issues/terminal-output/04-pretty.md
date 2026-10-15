---
id: terminal-output-04-pretty
phase: 4
status: working
depends_on: ["terminal-output-03-output-mode"]
---

# Human-readable rendering

Plan: `docs/themes/terminal-output.md`, Layers/Rules/Criteria; reference: `0020-pretty-output` issue and designs.

Current state: worker `s-terminal-output-04`, pane `w2P:pR`, session `01a13f4c-0bde-74a0-9717-ca95737fe3b8`; implementation `49a45eb`; reviewer `c-review-terminal-output-04`, pane `w2P:pS`; next action: corrections R1–R2 and S1, then re-review. Blockers: none.

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
- `ZITTY_MINIMUM_NODE=/Users/kento/.local/share/mise/installs/node/22.18.0/bin/node pnpm test:packed`: passed; packed Node 22.18.0 and Deno consumers passed with
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

## Review round 1

Reviewer `c-review-terminal-output-04`, session `70bb4484-82eb-4336-bf68-2b26d686cbcf`, reviewed `9a56757..9ad37d0`. R1: multiline log messages and property keys need continuation bars (category first line only). R2: update stale adapter JSDoc and changed test descriptions. Reviewer independently verified styleText support on Node 22.18.0 and Deno and empty NO_COLOR behavior.

Supervisor S1: standalone showUsage without explicit write/printer must use the same automatic output policy as invocation help (pretty normally, JSON when selected by CI/HACKSH_OUTPUT). Preserve explicit legacy write/printer adapters and pure renderUsage; share default printer selection to avoid divergent policies. This implements the theme's consistent help/output rule. S2: retain the documented stdout-TTY-based invocation color policy from issue 03; NO_COLOR controls both streams. Per-stream color selection is outside this plan's chosen contract.

Parent repaired the wrapped packed-command Markdown evidence noted by review.

### Correction evidence

Correction commit: `ca363ba82028083db46024a6a852f34ea63d1cd4`.

Validation snapshot: base `HEAD^{tree}`
`06e5df798bac823feaae0f44880ca95f78adef52`, uncommitted diff object
`07f828b19ba11bb5531533344a28a3573a71e255`. Environment: macOS worktree,
Node `v24.15.0`, pnpm `11.20.0`; minimum-runtime executable reported
`v22.18.0`, and Deno reported `2.7.14`. Committing produced tree
`7a13c3934027fbf1dfe89635022dae09fedf4e81`; `git diff --quiet ca363ba -- .
':!docs/issues'` exited 0, so the validated source is unchanged after commit.

- `pnpm exec vp test src/printer.test.ts src/public-api.test.ts src/run.test.ts`:
  passed, 3 files and 91 focused tests. Regression coverage verifies barred
  multiline log messages, newline-containing property keys, category placement,
  standalone pretty/CI/HACKSH_OUTPUT selection, public standalone configuration,
  and undecorated console/stream compatibility adapters.
- `pnpm check`: passed; all 83 files were formatted and 24 files had no warnings,
  lint errors, or type errors.
- `pnpm test`: passed; 8 files and 142 tests.
- `pnpm build`: passed; ESM JavaScript, source map, and bundled declarations were
  emitted for target Node 22.18.0.
- `ZITTY_MINIMUM_NODE=/Users/kento/.local/share/mise/installs/node/22.18.0/bin/node pnpm test:packed`:
  passed; packed Node 22.18.0 and Deno consumers passed.
- `CI=1 pnpm test`: passed; 8 files and 142 tests.
- `git diff --check` and pre-commit `git diff --cached --check`: passed.

R1 now splits every message line before block rendering and splits the complete
property key/value text, so category text remains on only the first message line
and all continuations receive bars. R2 updates adapter descriptions and the stale
test name. S1 is implemented by one internal automatic-printer selector shared by
invocations and standalone `showUsage`; explicit `write` and `printer` paths,
pure `renderUsage`, and invalid invocation-setting behavior remain compatible.
S2 remains unchanged: stdout TTY and `NO_COLOR` decide color for both streams.
