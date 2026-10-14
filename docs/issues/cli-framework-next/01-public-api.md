# Phase 1 public API implementation

Implementation worker, not supervisor. Implement directly; parent owns orchestration and review. Read the Phase 1 plan, its parent README, execution.md API decisions and applicable repository instructions. Do not invoke execute-plan. You are not alone in the codebase: preserve unrelated edits and accommodate others' changes.

Own src implementation and tests, README, scripts/test-packed-consumers.mjs and necessary fixtures/configuration. Do not edit plan files or execution.md. Cover P1–P6 and C1–C3 from execution.md; this is one task because parser, execution, usage and public types share dependent contracts. No later phases.

Implement the recorded API contracts, with meaningful behavior and type assertions, including both schema variants, output and error boundaries, callbacks and return values. Extend actual packed consumers for new APIs under minimum Node and Deno npm. Keep internal tokenizer types private. Document typed usage examples and sync/async contracts. Follow existing repository conventions.

Implementation-and-review mode: make reviewable commits containing only owned changes, run pnpm ready and pnpm test:packed, including minimum supported Node 22.18.0. Retain detailed logs in /tmp and report their paths, runtime versions, exact commits, coverage and unresolved items. Send ISSUE_DONE after implementation and remain available for correction rounds; parent will launch review. Do not publish or edit external consumer repositories.
