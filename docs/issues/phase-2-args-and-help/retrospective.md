# Phase 2 retrospective

## Rework

- Three implementation issues and four review rounds (variadic, help/booleans, its correction, full integration). The help review found two defects: schema validation allowed malformed boolean syntax through `.catch()` or later assignments, and raw enum entries included numeric reverse mappings. `f98d917` added tokenizer-owned errors and used accepted enum values; the same reviewer accepted both fixes. Full review accepted `58888b1` without findings.
- A low-priority variadic cleanup suggestion was dropped under the review workflow. No implementation approach was reverted; the boolean error mechanism was corrected before acceptance.

## Questions

- No coordinator or worker clarification was needed. The plan's suggested empty-array and negated-value behavior, plus existing error conventions, resolved kickoff decisions. Issues recorded the chosen help-only display metadata contract before delegation.

## Friction

- `python` was unavailable; `python3` worked for issue setup.
- `pnpm ready` initially failed formatting in two pre-existing local skill files and new issue Markdown. Scoped checks/tests/build/packed consumers passed; integration applied formatting-only cleanup in `9a1b015`, then the full gate passed.
- Markdown-only `vp check` invocations with inappropriate lint options failed during evidence preparation; `vp check --fix <markdown-path>` worked.
- Reviewer probes launched outside the repository could not resolve dependencies; temporary in-repository probes worked and were removed. A TypeScript enum probe needed an equivalent object shape under native Node type stripping.
- No unavailable runtime: Node 22.18.0 and Deno 2.7.14 packed consumers passed. The build retained a non-failing TypeScript 7 experimental API warning.

## Instruction proposals

- Target: `execute-plan`. Add: “Format newly created issue Markdown with the repository formatter before the initial issue commit; record pre-existing check failures separately.” Evidence: unformatted coordination files repeatedly blocked the aggregate gate despite passing code checks.
- Target: external `review-correctness` skill. Add: “For CLI syntax errors, test recovery wrappers and repeated assignments; invalid syntax must not disappear through schema fallback or a later valid token.” Evidence: W1 escaped the original boolean tests and required a correction round.
- Target: external `review-correctness` skill. Add: “When exposing enum choices, test numeric enum reverse mappings against the schema's accepted values.” Evidence: W2 displayed rejected names until schema-reader correction.

## Applied

- Applied `fc61228` to the repository execute-plan skill: format new issue Markdown before its initial commit and distinguish pre-existing check failures. This addresses the repeated aggregate-check friction without weakening verification.
- External review-correctness proposals remain recommendations for the user; no external skills were edited. They cover malformed boolean syntax through recovery/reassignment and numeric enum reverse mappings.
- No repository-wide or file-scoped instruction change was warranted beyond that workflow correction.
