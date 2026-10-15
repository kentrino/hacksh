---
id: terminal-output-06-integration
phase: 6
status: done
depends_on: ["terminal-output-05-prompts"]
---

# Full-plan acceptance

Plan: `docs/themes/terminal-output.md`, Layers/Rules/Criteria; reference: `terminal-output` issue and designs.

Current state: implementation and full-plan review accepted through `26b3cae` (source correction `c963362`). All six issues complete; no next implementation action or blockers. Worker `s-terminal-output-06` (session `01a13f7d-a618-7803-bb56-a6da221b2b11`) and reviewer `c-review-terminal-output-final` (session `95ecdd82-dd46-4989-88b3-48ce95d629f4`) completed their work.

## Scope and decisions

Verify all five layers together, public documentation/examples and package consumers. Obtain full baseline-to-final review. Preserve original theme and design documents. No publishing or consumer repository edits.

Ownership: related source modules, tests and public documentation for this responsibility; preserve unrelated work. Exclusions: unrelated themes, publication, external consumer edits. Prerequisite contract: completed dependency APIs and tests; coordinate shared files sequentially. Assignment baseline: `432f2f7`; full review baseline: `656cddfc4c6aabbf2e59cbc1e4e262f45a5bc8e5`. Initial baseline and immutable hashes: see `06-integration.md`.

## Acceptance criteria

- [x] AC1: All theme Goal/Rules/Criteria and referenced issue outcomes are covered by the five implementation issues with inspected evidence. (plan: layers / `terminal-output`).
- [x] AC2: Repository check, tests, build and packed-consumer checks pass on final implementation, including supported Node 22.18 runtime and current runtime. (plan: layers / `terminal-output`).
- [x] AC3: Real consumers demonstrate unchanged run code in pretty/JSON and noninteractive prompt failure; integration tests cover help/version/errors/logs/prompts through one printer. (plan: layers / `terminal-output`).
- [x] AC4: Full baseline-to-final correctness and quality review passes; no unresolved required corrections. (plan: layers / `terminal-output`).
- [x] AC5: Original plan and referenced specification hashes are unchanged; no new runtime dependencies besides existing zod peer. (plan: layers / `terminal-output`).

## Evidence

Baseline `656cddf`: `pnpm check` passed on Node v24.15.0 (71 formatted files, no lint/type errors). No pre-existing check failures observed.

Verified runtime executables: `/Users/kento/.local/share/mise/installs/node/22.18.0/bin/node --version` returned `v22.18.0`; `deno --version` returned `2.7.14`. Packed verification command: `ZITTY_MINIMUM_NODE=/Users/kento/.local/share/mise/installs/node/22.18.0/bin/node pnpm test:packed`.

Integration commit: `22ed34fb9d9aee50cc74271be7514b61b16a348a` (`test: verify
terminal output integration`), tree
`a6ad00cefed675178c29dfd0cecfa186d6ad66f1`. Final source validation used
assignment `HEAD^{tree}` `8b2840cbcf7bbd04e5353675b6b446fe0a14ce6c` plus
uncommitted diff object `9b34238a7bc41c1719816b763af5afaf7db41f5d`; committing
the source and public documentation produced the integration tree above.
`git diff --quiet 22ed34f -- . ':!docs/issues'` exited 0 after commit, so only
issue evidence changed after the checks.

Environment: macOS arm64; host Node `v24.15.0`, pnpm `11.20.0`; minimum
runtime `/Users/kento/.local/share/mise/installs/node/22.18.0/bin/node`
reported `v22.18.0`; Deno reported `2.7.14`.

- `pnpm check`: passed; all 88 files were formatted and 29 files had no
  warnings, lint errors, or type errors.
- `pnpm test`: passed; 9 files and 168 tests.
- `CI=1 pnpm test`: passed; 9 files and 168 tests under automatic JSON mode.
- `pnpm build`: passed; emitted ESM JavaScript, source map, and bundled
  declarations for target Node 22.18.0.
- `ZITTY_MINIMUM_NODE=/Users/kento/.local/share/mise/installs/node/22.18.0/bin/node pnpm test:packed`: passed. `scripts/test-packed-consumers.mjs` installs the
  tarball and runs the complete behavior matrix on Node 22.18.0, host Node
  24.15.0, and Deno 2.7.14; a separate Deno invocation also passes without
  environment permission.
- `pnpm test:prompt-pty`: passed the durable real-terminal probe for closing,
  20-column redraw, multiline and long input, caught/uncaught cancellation,
  later output, and raw-mode/listener restoration. `git diff --quiet 46c2ec3
-- scripts/probe-prompts-pty.mjs scripts/prompt-prompts-pty.exp
src/fixtures/prompt-pty-cli.ts src/prompts.ts src/pretty.ts` exited 0, so
  this also reconfirms the exact issue-05 accepted prompt/PTY sources.
- `git diff --check`: passed on the validation snapshot; pre-commit
  `git diff --cached --check` also passed.

## Requirement coverage

This is source/test traceability for the theme, not a second progress ledger:

- One output path: `src/integration.test.ts` reuses one invocation printer and
  observes every public `PrintEvent` kind (`log`, active/submitted `prompt`,
  `usage`, `version`, and structured validation/routing/runtime/prompt
  `error`). It also checks prompt cleanup. The implementation boundary remains
  `src/run.ts`, `src/output.ts`, `src/usage.ts`, and `src/prompts.ts`; no
  component implementation was duplicated.
- Same run code in both formats: the integration test invokes one handler
  unchanged through pretty and JSON printers. The installed-package probe runs
  the same zod and zod/mini terminal handlers in both modes and asserts all six
  log levels plus step/success, structured properties/categories, stream
  routing, ANSI-free JSON, and consistent non-colored human output.
- Complete library output and errors: the packed probe verifies structured
  standalone and invocation help, version, validation, unknown-command and
  thrown runtime errors. Standalone `showUsage` is called without an explicit
  printer and follows HACKSH_OUTPUT in both pretty and JSON modes. Existing
  focused `src/run.test.ts`, `src/printer.test.ts`, and `src/process.test.ts`
  retain deeper ordering, summary normalization, stream, and adapter coverage.
- Machine-safe prompts: each packed runtime invokes a select with an
  `initialValue` under JSON, enforces a two-second kill deadline, and observes
  an immediate identifying `HackshPromptError` summary with reason, kind,
  message, and choices. `src/prompts.test.ts` covers all noninteractive modes
  and lifecycle failures; the fresh PTY probe covers cancellation exit 130 and
  terminal cleanup.
- Installed types and schema variants: the packed TypeScript consumer checks
  inferred select literal unions, prompt error reasons, `runCommand`, custom
  `Printer`, and explicit legacy `consolePrinter`/`createStreamPrinter`
  adapters. Runtime/help/validation scenarios execute with both `zod` and
  `zod/mini` schemas.
- Deliberate policies: packed commands use application-owned `--json`,
  `--output`, and `--log-format`, proving no new reserved flags. They verify
  HACKSH_OUTPUT overrides automatic policy, values are case-sensitive, and
  nonempty `CI="0"` and `NO_COLOR="0"` are active. Committed mode/printer
  tests retain the stdout-TTY color policy for both streams. README documents
  all-level emission, explicit legacy adapters, automatic standalone help, and
  the intentional select/confirm/text-only API with no multiselect.
- Dependency/runtime constraint: `package.json` has no `dependencies` entry
  and only `zod: ^4.0.0` in `peerDependencies`; the lockfile was unchanged.
  The packed probe executes behavior on the exact minimum Node runtime, not
  only transpilation, and repeats it on current Node and Deno.

`sha256sum` over the theme, 0010-0012 issues, and every 0018-0022
issue/design matched all immutable values recorded below. No original
plan/specification file changed.
Final acceptance is recorded below.

## Full-plan review round 1

Reviewer inspected `656cddf..0605203` and reported two worker corrections: R1 default console writers append a newline to erase-only prompt writes, leaving blank rows on close and log interleaving; PTY assertions currently filter empty rows and miss this. Add exact default-writer byte regressions and retain internal blank rows in PTY assertions. R2 split the logger and output-mode/invalid-setting suites out of the 1296-line `src/run.test.ts`, preserving coverage. No supervisor findings; prior integration evidence remains valid except for R1 rendering coverage, which requires correction and fresh validation.

### Correction evidence

Correction commit: `c963362cc3a0671ec2e8c0329629fe3709c41f9e` (`fix:
preserve prompt erasure rows`), tree
`f03ace420c3cdde3f0ceb39d576f73634f34db61`. Validation used base
`HEAD^{tree}` `d61b3c129639e9f196a205e73a40b4fc6e256f5c` plus uncommitted
diff object `c7092ab018e68b17541b62cf757b30b25a8054e7`. Committing
produced the correction tree above; `git diff --quiet c963362 -- .
':!docs/issues'` exited 0, so only evidence Markdown changed afterward.

Environment: macOS arm64, host Node `v24.15.0`, pnpm `11.20.0`, minimum
Node `v22.18.0` at
`/Users/kento/.local/share/mise/installs/node/22.18.0/bin/node`, and Deno
`2.7.14`.

- `pnpm check`: passed; all 90 files were formatted and 31 files had no
  warnings, lint errors, or type errors.
- `pnpm test`: passed; 11 files and 170 tests.
- `CI=1 pnpm test`: passed; 11 files and 170 tests.
- `pnpm build`: passed; ESM JavaScript, source map, and bundled declarations
  were emitted for target Node 22.18.0.
- `pnpm test:prompt-pty`: passed; terminal reconstruction now retains internal
  empty rows and explicitly rejects them after caught cancellation before
  verifying both later logs, prompt removal, exit 130, and terminal cleanup.
- `ZITTY_MINIMUM_NODE=/Users/kento/.local/share/mise/installs/node/22.18.0/bin/node pnpm test:packed`: passed on Node 22.18.0, host Node 24.15.0, and
  Deno 2.7.14, including the denied-environment Deno smoke check.
- `git diff --check` and pre-commit `git diff --cached --check`: passed.

R1 is corrected in `src/output.ts`: newline-terminated complete output still
uses `console.log`/`console.error`, while erase-only control bytes use the
underlying terminal stream unchanged. `src/output.test.ts` asserts exact
default-writer bytes for close and interleaved-log sequences, and both the
deterministic renderer helper and durable PTY probe retain internal empty
rows instead of filtering them away.

R2 moves the unchanged logger suite to `src/logger.test.ts` and the
output-mode/invalid-setting cases to `src/output.test.ts`. Final sizes are
706 lines for `src/run.test.ts`, 317 for `src/logger.test.ts`, and 355 for
`src/output.test.ts`; the original 168 tests remain and the two R1
regressions bring the total to 170. Parent inspected this correction evidence before final acceptance.

## Final acceptance

Reviewer accepted the complete `656cddf..26b3cae` scope after reviewing
`c963362` against the earlier full-branch audit. No required worker or
supervisor findings remain. The independent default-writer terminal probe now
shows the initial log, two interleaved logs, and the final log on consecutive
rows with no empty rows. Reviewer verified all 17 relocated tests and their
bodies are preserved, plus the two new exact-byte regressions.

Parent reconciled the theme Goal, five Layers, Rules and Criteria with the
requirement coverage above and inspected evidence in issues 01–05 and this
issue. AC1–AC3 are supported by the committed integration, focused, installed
consumer and PTY tests; normal/CI tests, checks, build and three-runtime
consumer validation all cover final source `c963362`. The full review and
correction acceptance satisfy AC4. Parent rechecked all 14 original SHA-256
values, unchanged lockfile, dependency/peer/optional declarations and engines
against `656cddf`, satisfying AC5. `git diff --quiet c963362 -- .
':!docs/issues'` exited 0; only acceptance documentation changed after final
source verification. No unmet plan requirements remain. No publication or
external consumer changes were performed.

Initial branch: `main`. Initial base: `656cddfc4c6aabbf2e59cbc1e4e262f45a5bc8e5`. Initial worktree: clean.

Original specification SHA-256:

- `docs/themes/terminal-output.md`: `68700dd10d370e69463c166855930a9b9cae51488302ae30ac10d7758d8a71c2`
- `docs/issues/0010-citty-attribution/issue.md`: `b2fd795d745d54b72731be95db590d2c9738488452718cb0af4d536e6fcf8494`
- `docs/issues/0011-license-file/issue.md`: `155aff20baa0546263519ea57a1d59a428f7a94e2d7bdac46108575a0b31c7a7`
- `docs/issues/0012-package-metadata/issue.md`: `f1fc6be25b9585578731c39dfe5b2fa3202c8e595a8497c7ad40e7199dfa4b9c`
- `docs/issues/0018-run-logger/designs.md`: `22d8e86e1ff7efbef7816ba30368ef105c967b20b1c3695094c3b17b275d9ced`
- `docs/issues/0018-run-logger/issue.md`: `70fd6dd899bd997f17bdcfa33dac7ccb3385a191e1cb50e743d6420c2ed618ad`
- `docs/issues/0019-output-format-selection/designs.md`: `d98557b3b6cd0c23636611123ec7531d18756b8f6c5b6161f4ce12a5c1ea07f3`
- `docs/issues/0019-output-format-selection/issue.md`: `0b4445ff95f9dbc7bebfdd42a825e62f41124dd6ca7aaab9615f7d53af16445e`
- `docs/issues/0020-pretty-output/designs.md`: `0eec55d94b6c02af8a349fcacb7413e92d16b97635e365251320d606ecc9f0f2`
- `docs/issues/0020-pretty-output/issue.md`: `23232e36764511e14cb93fb22c519311f966eea7a4c60dfc80954a961ea5f548`
- `docs/issues/0021-run-prompts/designs.md`: `c335babe59316b48168effc1e96034c5df865854ab5380d5c703874e8f5cb15b`
- `docs/issues/0021-run-prompts/issue.md`: `0ae385e1546dab5da9c62032b2dbbb1ab9ae582c8f0f5ea00cb7a73c6a854820`
- `docs/issues/0022-single-printer/designs.md`: `9137079ffa493f60613943346af07af732bd6113c8ab61aac9d0d430ab19854b`
- `docs/issues/0022-single-printer/issue.md`: `db486f68d6445951b09d755116339b319163627b9ae4a9dd27ae9616b66b7a37`
