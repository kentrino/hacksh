---
id: terminal-output-05-prompts
phase: 5
status: working
depends_on: ["terminal-output-04-pretty"]
---

# Interactive input

Plan: `docs/themes/terminal-output.md`, Layers/Rules/Criteria; reference: `0021-run-prompts` issue and designs.

Current state: worker `s-terminal-output-05`, pane `w2P:pT`, session `01a13f58-b9c5-7f11-aafe-8ebc8bf95029`; reviewer `c-review-terminal-output-05`, pane `w2P:pV`, session `1eb5f30a-3738-49b3-a2b4-a8c823bd02a5`; next action: re-review correction round 2. Blockers: none.

## Scope and decisions

Implement design A: logger.select/confirm/text with generic select return types and node:readline input. Noninteractive always throws even with defaults; HackshPromptError identifies reason and prompt details, cancellation distinguishable (runMain exit 130). No multiselect or schema-driven prompting. Render every prompt state through the invocation printer; own input reading separately and clean up listeners/raw mode on all paths.

Ownership: related source modules, tests and public documentation for this responsibility; preserve unrelated work. Exclusions: unrelated themes, publication, external consumer edits. Prerequisite contract: completed dependency APIs and tests; coordinate shared files sequentially. Assignment baseline: commit `608724287870963c90f66041c43256a73853417d`, tree `d2b2ff6aa84e12628708a784314dd0789dcace42`. Initial baseline and immutable hashes: see `06-integration.md`.

## Acceptance criteria

- [ ] AC1: select/confirm/text work interactively with validation, choices/defaults and typed select values; verify input simulation, real terminal probe and type tests. (plan: layers / `0021-run-prompts`).
- [ ] AC2: Noninteractive/CI/JSON prompts fail immediately with structured identifying errors even with defaults; verify subprocess timeout tests. (plan: layers / `0021-run-prompts`).
- [ ] AC3: Cancellation, EOF, rendering/input failures and overlapping prompts have explicit behavior and clean up terminal/listeners; verify lifecycle tests. (plan: layers / `0021-run-prompts`).
- [ ] Review: correctness and quality review accepted; corrections verified.

## Evidence

Implementation commits: `2e4a5cd946f88a0a9fe5610f7c42efc07f2b34a7` (`feat: add interactive logger prompts`) and lifecycle correction `7a9c73cdf8048927eb492e608ab3082a3991fb45` (`fix: serialize prompt state rendering`). Final validated implementation tree: `c3f780d33a26fa0abca1e423b6f267337ddfb2dd`. The final validation commands ran with HEAD tree `ab19598aabfa19824f3513327f85f4a0d47b0212` and uncommitted source diff hash `1c1b90afb9eb2fad8068695f8d045b3bfdce83f6`; committing that identical content produced the final tree without requiring another run.

- `pnpm check` — macOS arm64, Node `v24.15.0`, pnpm `11.20.0`: passed; all 88 files formatted, no lint warnings, lint errors, or type errors.
- `pnpm test` — macOS arm64, Node `v24.15.0`, pnpm `11.20.0`: passed; 9 files and 154 tests.
- `pnpm test:prompt-pty` — macOS arm64, Node `v24.15.0`, `/usr/bin/expect`: passed; real PTY select, confirm, text validation retry, cancellation, and terminal/listener restoration. Durable driver: `scripts/probe-prompts-pty.mjs` with `scripts/prompt-prompts-pty.exp` and `src/fixtures/prompt-pty-cli.ts`.
- `pnpm build` — macOS arm64, Node `v24.15.0`, pnpm `11.20.0`: passed; target `node22.18.0`, ESM and declarations emitted.
- `ZITTY_MINIMUM_NODE=/Users/kento/.local/share/mise/installs/node/22.18.0/bin/node pnpm test:packed` — macOS arm64, pnpm host Node `v24.15.0`; packed consumers used Node `v22.18.0` and Deno `2.7.14`: passed.
- Noninteractive subprocess coverage in `src/prompts.test.ts` uses a 2-second timeout for JSON, CI, and non-TTY modes and verifies structured required-input identification. Deterministic stream tests cover defaults, typed selection, placeholder/validation retry, EOF, cancellation, overlap, invalid options, input failure, printer failure, and cleanup.

## Review round 1

Reviewer `c-review-terminal-output-05`, session `1eb5f30a-3738-49b3-a2b4-a8c823bd02a5`, reviewed `6087242..9dea2ce` with independent stream and PTY probes. Required corrections: R1 f/F filtering bug; R2 in-place pretty prompt redraw and collapsed submitted state with log interleaving support; R3 explicit safe type-ahead/empty-validation/Unicode backspace behavior; R4 discriminated PromptState and honest input stream types; R5 remove duplicate mode resolution/queue logic/dead branches and simplify internal option contracts. Existing noninteractive failure, cancellation/EOF, overlap and terminal cleanup behavior passed probes; corrections must preserve them.

R3 decisions for implementation: retain trailing input for sequential prompts rather than silently dropping a pasted chunk; an empty validation message means no error (only a non-empty string rejects); backspace must remove a full Unicode character without leaving an unpaired surrogate. Document and test these semantics.

Correction commit: `2668e9425ee777df8010cd847e9a63b7601636ea` (`fix: refine interactive prompt lifecycle`). R1–R5 addressed: printable `f/F` and function keys are distinguished; active pretty prompts redraw in place, collapse on submission, and survive interleaved logs; prompt-to-prompt type-ahead is buffered; empty validation messages succeed; Unicode backspace removes a code point; prompt states and terminal input are accurately typed; mode resolution, queue tracking, confirm handling, logger dependencies, and cancellation exit selection are simplified.

Final correction validation used HEAD tree `525aa9cc1dfe4834b93cc4c52dee79947f0e14bf` plus uncommitted diff hash `473e47fddeadda6559838baff86f89d8f3706d86`. Committing the identical non-evidence files produced implementation tree `b099d8db38ce55bb137f4f2682ea003eae21b734`.

- `pnpm check` — macOS arm64, Node `v24.15.0`, pnpm `11.20.0`: passed; all 88 files formatted, with no warnings, lint errors, or type errors.
- `pnpm test` — macOS arm64, Node `v24.15.0`, pnpm `11.20.0`: passed; 9 files and 161 tests.
- `pnpm test:prompt-pty` — macOS arm64, Node `v24.15.0`, `/usr/bin/expect`: passed; effective terminal-state checks cover in-place redraw/collapse, select, confirm-to-text type-ahead, `f/F`, validation retry, cancellation, and restoration.
- `pnpm build` — macOS arm64, Node `v24.15.0`, pnpm `11.20.0`: passed; target `node22.18.0`, ESM and declarations emitted.
- `ZITTY_MINIMUM_NODE=/Users/kento/.local/share/mise/installs/node/22.18.0/bin/node pnpm test:packed` — macOS arm64, pnpm host Node `v24.15.0`; packed consumers used Node `v22.18.0` and Deno `2.7.14`: passed.
- `git diff --check` — same tree/diff and environment: passed.

## Review round 2

Reviewer independently verified all prior R1–R5 fixes at `23792dd`. Remaining corrections: R6 close active rendering on every prompt termination (including caught cancellation/EOF/input/printer failure); R7 count actual displayed rows, including explicit newlines and terminal wrapping, when clearing/redrawing. Probes at 20 columns exposed stale rows for long input and multiline messages. Add deterministic printer tests and real PTY final-screen regressions for caught cancellation followed by logging and narrow-terminal long input.

Correction commit: `9ba033a24116503be11bdb7ec892c999370ec03c` (`fix: close and size interactive prompt rendering`). R6–R7 addressed: unsuccessful prompts send a non-visible closing state through the invocation printer while preserving the original failure; later logs cannot redraw a dead prompt. Pretty rendering tracks physical rows using explicit newlines, ANSI-free grapheme display widths, and the output writer's terminal columns, with explicit-line fallback when width is unavailable. Default console adapters preserve terminal metadata. Deterministic tests cover cancellation, EOF, input and printer failures, caught cancellation followed by logs, narrow wrapping, multiline messages, ANSI, wide characters, and unknown-width fallback. The durable PTY probe now exercises a 20-column terminal, long text, multiline select output, caught cancellation, subsequent logs, and terminal restoration.

Correction-round validation used HEAD tree `3d23b619b03ece4032919e22cf7cfebec3d399a4` plus uncommitted diff hash `f28a2cad551c8e7048eb2731753bc25ee110b583`. Committing the identical non-evidence files produced implementation tree `46e54108f9465f1a763e28130763fccde5c64ccb`.

- `pnpm check` — macOS arm64, Node `v24.15.0`, pnpm `11.20.0`: passed; all 88 files formatted, with no warnings, lint errors, or type errors.
- `pnpm test` — macOS arm64, Node `v24.15.0`, pnpm `11.20.0`: passed; 9 files and 166 tests.
- `pnpm build` — macOS arm64, Node `v24.15.0`, pnpm `11.20.0`: passed; target `node22.18.0`, ESM and declarations emitted.
- `pnpm test:prompt-pty` — macOS arm64, Node `v24.15.0`, `/usr/bin/expect`: passed; real 20-column PTY final-screen checks cover closing, narrow redraw, multiline output, long input, caught and uncaught cancellation, later logs, and restoration.
- `ZITTY_MINIMUM_NODE=/Users/kento/.local/share/mise/installs/node/22.18.0/bin/node pnpm test:packed` — macOS arm64, pnpm host Node `v24.15.0`; packed consumers used Node `v22.18.0` and Deno `2.7.14`: passed.
- `git diff --check` — same tree/diff and environment: passed.
