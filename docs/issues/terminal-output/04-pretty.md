---
id: terminal-output-04-pretty
phase: 4
status: pending
depends_on: ["terminal-output-03-output-mode"]
---

# Human-readable rendering

Plan: `docs/themes/terminal-output.md`, Layers/Rules/Criteria; reference: `0020-pretty-output` issue and designs.

Current state: worker unassigned; next action: delegate after prerequisites. Blockers: none.

## Scope and decisions

Choose fixed rendering (design C), with color and Unicode/ASCII configuration. Use node:util styleText, no dependencies. Give records level/kind symbols and consistent bars; render multiline usage/errors in the same style. Avoid implicit start/end output for invocations; use consistent per-event rendering and document this decision.

Ownership: related source modules, tests and public documentation for this responsibility; preserve unrelated work. Exclusions: unrelated themes, publication, external consumer edits. Prerequisite contract: completed dependency APIs and tests; coordinate shared files sequentially. Review baseline: record at assignment. Initial baseline and immutable hashes: see `06-integration.md`.

## Acceptance criteria

- [ ] AC1: Human output distinguishes levels, step and success with symbols, even without color; verify rendering snapshots/assertions. (plan: layers / `0020-pretty-output`).
- [ ] AC2: Multiline help/errors/log properties use consistent rendering; color/ASCII options and NO_COLOR work without corrupting JSON; verify tests. (plan: layers / `0020-pretty-output`).
- [ ] Review: correctness and quality review accepted; corrections verified.

## Evidence

Pending; record commits, commands, runtime, results and durable test/probe references here.
