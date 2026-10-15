---
id: terminal-output-05-prompts
phase: 5
status: working
depends_on: ["terminal-output-04-pretty"]
---

# Interactive input

Plan: `docs/themes/terminal-output.md`, Layers/Rules/Criteria; reference: `0021-run-prompts` issue and designs.

Current state: worker implementation complete at `7a9c73c`; next action: parent review and acceptance checks. Blockers: none.

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
