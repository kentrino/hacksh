# P2-03

- Plan: `docs/plan/cli-framework-next/phase-2-args-and-help.md` and parent README common policy/completion.
- Phase: 2
- Status: working
- depends_on: [P2-01, P2-02]
- Worker: s-p2-integration (pane w2P:pB); next action: integration validation then full review; blockers: none.
- Baseline: `757f077` for integration additions; full review baseline `0655f46`; initial baseline/hash in [03-integration.md](03-integration.md).

## Scope and ownership

Own cross-task integration tests, packed consumer fixtures/scripts, final README coherence and validation. Full baseline review includes all phase 2 changes. Implementation remains delegated. Prerequisite: both feature issues accepted.

Exclusions: other phases, plan edits, publishing and external repositories. Preserve unrelated work. Worker owns implementation/tests/README and evidence updates; supervisor owns status and acceptance checks.

## Acceptance criteria

- [ ] AC1: Every phase 2 bullet, kickoff decision and acceptance condition has direct final evidence in P2-01/P2-02 or this issue; reconcile explicitly.
- [ ] AC2: Parent completion: pnpm ready and pnpm test:packed pass final code; actual new-feature consumers run on Node 22.18.0 and Deno npm, tarball/types verified. Record exact commands/runtimes/results and test references.
- [ ] AC3: Full change correctness/quality review from initial baseline accepts final implementation and task interactions.
- [ ] AC4: Original plan hash unchanged; all active implementation issues accepted and no unresolved requirements.

## Evidence

Pending implementation and verification.

## Initial state

- Branch: main; clean working tree.
- Base: `0655f46f5a701c320fe961196b84923b12268891`.
- Original plan SHA-256: `0739c6e72102289a04a21fc533745ae5e37da06880a3201c7679859242a4fbef`.
- No applicable AGENTS.md found in repository or ancestor paths.
- Decisions: use plan proposal [] for absent variadic (Zod defaults/optional see []), reject values on negated flags, keep help display names separate from stable error names/paths.
- Coverage: P2-01 owns variadic bullet and corresponding acceptance; P2-02 owns remaining six bullets, typed display options and schema enum boundary; P2-03 owns common packaging/environment/final-review obligations. Dependencies are acyclic.
- Issue location follows task-requested phase-specific directory; historical phase 1 records remain untouched.

## Integration preparation

- P2-01 reviewed by c-review-p2-01 at 1f317a6, accepted without required corrections. Low cleanup nit dropped.
- P2-02 reviewer c-review-p2-02 (pane w2P:pA) reviewed fc052d9 and sent W1 (tokenizer-owned invalid-boolean errors) and W2 (numeric enum reverse mappings) to s-p2-help for correction. Reviewer remains available.
- Formatting prerequisite: pnpm ready detects pre-existing formatting in `.agents/skills/execute-plan/SKILL.md` and `.agents/skills/execute-plans/SKILL.md`, plus phase 2 issue Markdown. P2-03 owns formatting-only cleanup of these files; no instruction changes or plan edits.
