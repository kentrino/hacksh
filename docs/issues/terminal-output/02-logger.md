---
id: terminal-output-02-logger
phase: 2
status: pending
depends_on: ["terminal-output-01-printer"]
---

# Structured run logger

Plan: `docs/themes/terminal-output.md`, Layers/Rules/Criteria; reference: `0018-run-logger` issue and designs.

Current state: worker unassigned; next action: delegate after prerequisites. Blockers: none.

## Scope and decisions

Implement logger directly on CommandContext: trace/debug/info/warn/error/fatal, step/success, with(properties), getChild(category). Use structured records with level, kind, category, message, rawMessage, properties and timestamp. Template interpolation uses properties; automatic category follows root and resolved subcommand names.

Ownership: related source modules, tests and public documentation for this responsibility; preserve unrelated work. Exclusions: unrelated themes, publication, external consumer edits. Prerequisite contract: completed dependency APIs and tests; coordinate shared files sequentially. Review baseline: record at assignment. Initial baseline and immutable hashes: see `06-integration.md`.

## Acceptance criteria

- [ ] AC1: run logs reach the same printer with structured records, interpolation and automatic nested categories; verify runtime and type tests. (plan: layers / `0018-run-logger`).
- [ ] AC2: Bound properties, child categories, Error inputs and asynchronous output work without changing command return values; verify focused tests. (plan: layers / `0018-run-logger`).
- [ ] Review: correctness and quality review accepted; corrections verified.

## Evidence

Pending; record commits, commands, runtime, results and durable test/probe references here.
