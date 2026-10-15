---
id: terminal-output-03-output-mode
phase: 3
status: pending
depends_on: ["terminal-output-02-logger"]
---

# Output mode and JSON

Plan: `docs/themes/terminal-output.md`, Layers/Rules/Criteria; reference: `0019-output-format-selection` issue and designs.

Current state: worker unassigned; next action: delegate after prerequisites. Blockers: none.

## Scope and decisions

Choose design B: HACKSH_OUTPUT overrides options.output (auto/pretty/json), auto uses CI only; non-TTY alone keeps pretty. Reject invalid settings explicitly. No new reserved flags. Resolve once before execution. Interactive requires pretty, non-CI and input/output TTY; color requires pretty, output TTY and no NO_COLOR. JSON is one event per line, logs/help/version on stdout and errors/warning+ logs on stderr. Define documented structured usage/error summaries without implementing unrelated 0008/0009 scope. Review decision R4 from issue 01: its raw command/error event payloads are intermediate unreleased contracts. This issue owns canonical summaries, final public event types/documentation, and must not serialize executable commands or schemas directly.

Ownership: related source modules, tests and public documentation for this responsibility; preserve unrelated work. Exclusions: unrelated themes, publication, external consumer edits. Prerequisite contract: completed dependency APIs and tests; coordinate shared files sequentially. Review baseline: record at assignment. Initial baseline and immutable hashes: see `06-integration.md`.

## Acceptance criteria

- [ ] AC1: Mode priority, CI, TTY, NO_COLOR and invalid settings behave as documented; verify matrix tests and early-error paths. (plan: layers / `0019-output-format-selection`).
- [ ] AC2: All event kinds serialize as parseable JSON lines without ANSI; preserve structured usage and error information and robust unknown property serialization; verify tests. (plan: layers / `0019-output-format-selection`).
- [ ] AC3: No argument namespace changes and run code is identical across formats; verify behavior/type tests. (plan: layers / `0019-output-format-selection`).
- [ ] Review: correctness and quality review accepted; corrections verified.

## Evidence

Pending; record commits, commands, runtime, results and durable test/probe references here.
