# 01 — Complete the initial CLI framework release

Status: ready. Depends on initial execution-record commit only.

Source: `docs/plan/cli-framework.md`, all first-release scope and decisions. Requirement IDs R1–R10 are mapped in `execution.md`; the plan remains authoritative and unchanged.

Ownership: implementation worker owns `src/`, package/dependency/build configuration, tests and README. Supervisor owns execution records. Preserve unrelated changes; others may share this codebase.

Implement in dependent stages: schema reading and definition types/guards; parsing and validation; command routing/help/entrypoints; integration/type/package coverage and usage documentation. Keep reviewable commits per meaningful stage. Do not publish or edit external consumers.

Acceptance: every mapped requirement has direct evidence. Include zod and mini wrapper tests, compile-time misuse assertions, process exit behavior, the four consumer-equivalent scenarios, ESM built-package consumption, and Deno npm-style packaged consumption. Required repository check, test and build pass on final state. Inspect package output so zod stays external and only intended APIs are exported. Keep the plan unchanged.

Verification: record exact commands/results, test locations mapped to requirement IDs, runtime versions, actual commits and any unresolved gaps. Full-base combined review must pass and corrections use additional commits.

Delegation mode: implementation-and-review. Keep the same worker alive after initial ISSUE_DONE for review corrections. If blocked, report concrete evidence and ask rather than narrowing requirements.
