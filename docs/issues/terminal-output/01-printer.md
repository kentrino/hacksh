---
id: terminal-output-01-printer
phase: 1
status: pending
depends_on: []
---

# Shared structured printer

Plan: `docs/themes/terminal-output.md`, Layers/Rules/Criteria; reference: `0022-single-printer` issue and designs.

Current state: worker unassigned; next action: delegate implementation. Blockers: none.

## Scope and decisions

Implement structured PrintEvent/Printer, invocation injection in runCommand/runMain/createMain, and route version, usage and errors through it. Keep renderUsage pure. Preserve legacy showUsage write/callback and onError APIs through documented adapters; library-owned output must use the selected printer. Input remains outside printer.

Ownership: related source modules, tests and public documentation for this responsibility; preserve unrelated work. Exclusions: unrelated themes, publication, external consumer edits. Prerequisite contract: completed dependency APIs and tests; coordinate shared files sequentially. Review baseline: record at assignment. Initial baseline and immutable hashes: see `06-integration.md`.

## Acceptance criteria

- [ ] AC1: All library output paths use the invocation printer, including help/version/errors and direct showUsage; verify event capture and error-path tests. (plan: layers / `0022-single-printer`).
- [ ] AC2: Async printer events preserve order and are drained before invocation completion/exit; verify delayed printer and rejection tests. (plan: layers / `0022-single-printer`).
- [ ] AC3: Existing APIs remain compatible through documented adapters; verify behavior and public type tests. (plan: layers / `0022-single-printer`).
- [ ] Review: correctness and quality review accepted; corrections verified.

## Evidence

Pending; record commits, commands, runtime, results and durable test/probe references here.
