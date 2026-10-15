---
id: terminal-output-05-prompts
phase: 5
status: pending
depends_on: ["terminal-output-04-pretty"]
---

# Interactive input

Plan: `docs/themes/terminal-output.md`, Layers/Rules/Criteria; reference: `0021-run-prompts` issue and designs.

Current state: worker unassigned; next action: delegate after prerequisites. Blockers: none.

## Scope and decisions

Implement design A: logger.select/confirm/text with generic select return types and node:readline input. Noninteractive always throws even with defaults; HackshPromptError identifies reason and prompt details, cancellation distinguishable (runMain exit 130). No multiselect or schema-driven prompting. Render every prompt state through the invocation printer; own input reading separately and clean up listeners/raw mode on all paths.

Ownership: related source modules, tests and public documentation for this responsibility; preserve unrelated work. Exclusions: unrelated themes, publication, external consumer edits. Prerequisite contract: completed dependency APIs and tests; coordinate shared files sequentially. Review baseline: record at assignment. Initial baseline and immutable hashes: see `06-integration.md`.

## Acceptance criteria

- [ ] AC1: select/confirm/text work interactively with validation, choices/defaults and typed select values; verify input simulation, real terminal probe and type tests. (plan: layers / `0021-run-prompts`).
- [ ] AC2: Noninteractive/CI/JSON prompts fail immediately with structured identifying errors even with defaults; verify subprocess timeout tests. (plan: layers / `0021-run-prompts`).
- [ ] AC3: Cancellation, EOF, rendering/input failures and overlapping prompts have explicit behavior and clean up terminal/listeners; verify lifecycle tests. (plan: layers / `0021-run-prompts`).
- [ ] Review: correctness and quality review accepted; corrections verified.

## Evidence

Pending; record commits, commands, runtime, results and durable test/probe references here.
