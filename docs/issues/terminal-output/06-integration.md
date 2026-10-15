---
id: terminal-output-06-integration
phase: 6
status: pending
depends_on: ["terminal-output-05-prompts"]
---

# Full-plan acceptance

Plan: `docs/themes/terminal-output.md`, Layers/Rules/Criteria; reference: `terminal-output` issue and designs.

Current state: worker unassigned; next action: delegate after prerequisites. Blockers: none.

## Scope and decisions

Verify all five layers together, public documentation/examples and package consumers. Obtain full baseline-to-final review. Preserve original theme and design documents. No publishing or consumer repository edits.

Ownership: related source modules, tests and public documentation for this responsibility; preserve unrelated work. Exclusions: unrelated themes, publication, external consumer edits. Prerequisite contract: completed dependency APIs and tests; coordinate shared files sequentially. Review baseline: record at assignment. Initial baseline and immutable hashes: see `06-integration.md`.

## Acceptance criteria

- [ ] AC1: All theme Goal/Rules/Criteria and referenced issue outcomes are covered by the five implementation issues with inspected evidence. (plan: layers / `terminal-output`).
- [ ] AC2: Repository check, tests, build and packed-consumer checks pass on final implementation, including supported Node 22.18 runtime and current runtime. (plan: layers / `terminal-output`).
- [ ] AC3: Real consumers demonstrate unchanged run code in pretty/JSON and noninteractive prompt failure; integration tests cover help/version/errors/logs/prompts through one printer. (plan: layers / `terminal-output`).
- [ ] AC4: Full baseline-to-final correctness and quality review passes; no unresolved required corrections. (plan: layers / `terminal-output`).
- [ ] AC5: Original plan and referenced specification hashes are unchanged; no new runtime dependencies besides existing zod peer. (plan: layers / `terminal-output`).

## Evidence

Pending; record commits, commands, runtime, results and durable test/probe references here.

Initial branch: `main`. Initial base: `656cddfc4c6aabbf2e59cbc1e4e262f45a5bc8e5`. Initial worktree: clean.

Original specification SHA-256:

- `docs/themes/terminal-output.md`: `68700dd10d370e69463c166855930a9b9cae51488302ae30ac10d7758d8a71c2`
- `docs/issues/0010-citty-attribution/issue.md`: `b2fd795d745d54b72731be95db590d2c9738488452718cb0af4d536e6fcf8494`
- `docs/issues/0011-license-file/issue.md`: `155aff20baa0546263519ea57a1d59a428f7a94e2d7bdac46108575a0b31c7a7`
- `docs/issues/0012-package-metadata/issue.md`: `f1fc6be25b9585578731c39dfe5b2fa3202c8e595a8497c7ad40e7199dfa4b9c`
- `docs/issues/0018-run-logger/designs.md`: `22d8e86e1ff7efbef7816ba30368ef105c967b20b1c3695094c3b17b275d9ced`
- `docs/issues/0018-run-logger/issue.md`: `70fd6dd899bd997f17bdcfa33dac7ccb3385a191e1cb50e743d6420c2ed618ad`
- `docs/issues/0019-output-format-selection/designs.md`: `d98557b3b6cd0c23636611123ec7531d18756b8f6c5b6161f4ce12a5c1ea07f3`
- `docs/issues/0019-output-format-selection/issue.md`: `0b4445ff95f9dbc7bebfdd42a825e62f41124dd6ca7aaab9615f7d53af16445e`
- `docs/issues/0020-pretty-output/designs.md`: `0eec55d94b6c02af8a349fcacb7413e92d16b97635e365251320d606ecc9f0f2`
- `docs/issues/0020-pretty-output/issue.md`: `23232e36764511e14cb93fb22c519311f966eea7a4c60dfc80954a961ea5f548`
- `docs/issues/0021-run-prompts/designs.md`: `c335babe59316b48168effc1e96034c5df865854ab5380d5c703874e8f5cb15b`
- `docs/issues/0021-run-prompts/issue.md`: `0ae385e1546dab5da9c62032b2dbbb1ab9ae582c8f0f5ea00cb7a73c6a854820`
- `docs/issues/0022-single-printer/designs.md`: `9137079ffa493f60613943346af07af732bd6113c8ab61aac9d0d430ab19854b`
- `docs/issues/0022-single-printer/issue.md`: `db486f68d6445951b09d755116339b319163627b9ae4a9dd27ae9616b66b7a37`
