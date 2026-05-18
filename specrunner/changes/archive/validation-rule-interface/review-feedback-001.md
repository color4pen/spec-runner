# Code Review: validation-rule-interface — Iteration 1

## Summary

Parser layer and DSV layer validation rules are extracted from inline procedural code into a `ValidationRule` / `RuleRegistry` pattern. Implementation is structurally correct, type-safe, and all 2174 tests pass (verified). Two minor issues found: a comment/label mismatch in one test, and TC-MIG-P-03/TC-MIG-P-04 have no dedicated test coverage (they pass implicitly through existing unchanged tests but are not explicitly named).

## Findings

| # | Severity | File | Line | Finding |
|---|----------|------|------|---------|
| 1 | warning | `tests/unit/core/validation/registry.test.ts` | L55–56 | Comment says `TC-REG-04` but `describe` string says `TC-REG-05`. TC-REG-04 (type-safety compile check) from test-cases.md has no runtime test — acceptable because it is a TypeScript type-check concern, but the label mismatch is confusing. |
| 2 | info | `tests/unit/parser/rules/` | — | TC-MIG-P-03 (warning-severity → stderr, no throw) and TC-MIG-P-04 (`parseRequestMdRaw` export + full field extraction) have no dedicated test files. Both are covered implicitly: TC-MIG-P-03 by the `type-known` warning visible in `verification-result.md` stderr output; TC-MIG-P-04 by the `makeRaw` helper in parser rule tests exercising `ParsedRequestRaw`. Not a regression risk, but test-cases.md marks both `must`/`should`. |
| 3 | info | `src/core/spec/delta-spec-validator.ts` | L59–61 | `noSpecsForRequiredType` is called directly (not via registry) per D9. The pattern is documented and intentional, but a comment on the `noSpecsForRequiredType` export in `index.ts` noting "called directly in validateDeltaSpecPaths per D9" would improve discoverability. |
| 4 | info | `src/parser/rules/index.ts` | L23 | Re-exports `ParsedRequestRaw` and `RequestMdViolation` from `types.ts` — creates a second import path. Not harmful, but could cause confusion about canonical import location. |

## Test Coverage

Covered:
- TC-REG-01, TC-REG-02, TC-REG-03, TC-REG-05 — RuleRegistry behaviour (register, aggregate, duplicate-throw, empty)
- TC-PR-01 through TC-PR-13 — all 7 parser rules, both pass and violation paths
- TC-PR-14 — registry integration (all required violations on null input)
- TC-DSV-01 through TC-DSV-07 — no-legacy-flat-file, no-legacy-flat-dir, no-specs-for-required-type
- TC-DSV-08 through TC-DSV-12 — canonical-spec-structure (.delta.md, non-canonical, missing-section, empty-section, pass)
- TC-REG-END-01 through TC-REG-END-03 — full regression (all 2174 tests green, unchanged test files pass)
- TC-SPEC-01, TC-SPEC-02 — delta spec files present with correct ADDED/MODIFIED sections

Not covered by dedicated tests (but passing implicitly):
- TC-REG-04 — type-safety of `ValidationRule` interface (compile-time only; typecheck passes)
- TC-MIG-P-03 — warning-severity path emitting to stderr (no explicit test; warning visible in verification stderr output)
- TC-MIG-P-04 — `parseRequestMdRaw` export with full field extraction (no dedicated test; exercised indirectly through parser rule helpers)
- TC-MIG-D-02, TC-MIG-D-03, TC-MIG-D-04 — DSV migration behavioral properties (covered by existing `delta-spec-validator.test.ts`)

## Verdict

- **verdict**: approved

All `must`-priority scenarios pass. The two `info` items are cosmetic. Warning #1 (label mismatch) is the only item worth fixing in a follow-up but does not block merge.
