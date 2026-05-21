# Implementation Notes: validation-rule-interface

## Summary

- **result**: completed
- **tasks_completed**: 7/7
- **test_suite**: 2174 passed (189 test files), 0 type errors

## Files Modified

| Path | Operation | Description |
|---|---|---|
| `src/core/validation/types.ts` | ADDED | `ValidationRule<TInput, TViolation>` interface |
| `src/core/validation/registry.ts` | ADDED | `RuleRegistry<TInput, TViolation>` class with duplicate-name guard |
| `src/parser/rules/types.ts` | ADDED | `ParsedRequestRaw`, `RequestMdViolation` types |
| `src/parser/rules/title-required.ts` | ADDED | Rule: title field presence check |
| `src/parser/rules/type-required.ts` | ADDED | Rule: type field presence check |
| `src/parser/rules/type-known.ts` | ADDED | Rule: type allowlist check (warning) |
| `src/parser/rules/slug-required.ts` | ADDED | Rule: slug field presence check |
| `src/parser/rules/base-branch-required.ts` | ADDED | Rule: base-branch field presence check |
| `src/parser/rules/adr-required.ts` | ADDED | Rule: adr field presence check |
| `src/parser/rules/adr-valid.ts` | ADDED | Rule: adr value validity check |
| `src/parser/rules/index.ts` | ADDED | `createRequestMdRegistry()` factory |
| `src/parser/request-md.ts` | MODIFIED | Refactored to parse/validate separation; added `parseRequestMdRaw` export |
| `src/core/spec/rules/types.ts` | ADDED | `DeltaSpecRule`, `DeltaSpecRuleInput` types |
| `src/core/spec/rules/registry.ts` | ADDED | `DeltaSpecRuleRegistry` async registry |
| `src/core/spec/rules/no-specs-for-required-type.ts` | ADDED | Rule: spec presence for required types |
| `src/core/spec/rules/no-legacy-flat-file.ts` | ADDED | Rule: delta-spec.md detection |
| `src/core/spec/rules/no-legacy-flat-dir.ts` | ADDED | Rule: delta-spec/*.md detection |
| `src/core/spec/rules/canonical-spec-structure.ts` | ADDED | Rule: Step 3+4 unified (specs/ entry scan + content validation) |
| `src/core/spec/rules/index.ts` | ADDED | `createDeltaSpecRegistry()` factory; re-exports `noSpecsForRequiredType` |
| `src/core/spec/delta-spec-validator.ts` | MODIFIED | Refactored to DeltaSpecRuleRegistry; early-return for no-specs-for-required-type (D9) |
| `specrunner/changes/validation-rule-interface/specs/validation-rule-interface/spec.md` | ADDED | Delta spec: 4 ADDED Requirements |
| `specrunner/changes/validation-rule-interface/specs/request-md-parser/spec.md` | ADDED | Delta spec: MODIFIED Requirements for registry routing |

## Test Files Added

| Path | Coverage |
|---|---|
| `tests/unit/core/validation/registry.test.ts` | TC-REG-01/02/03/05 |
| `tests/unit/parser/rules/title-required.test.ts` | TC-PR-01/02 |
| `tests/unit/parser/rules/type-required.test.ts` | TC-PR-03/04 |
| `tests/unit/parser/rules/type-known.test.ts` | TC-PR-05/06 |
| `tests/unit/parser/rules/slug-required.test.ts` | TC-PR-07 |
| `tests/unit/parser/rules/base-branch-required.test.ts` | TC-PR-08 |
| `tests/unit/parser/rules/adr-required.test.ts` | TC-PR-09/10 |
| `tests/unit/parser/rules/adr-valid.test.ts` | TC-PR-11/12/13 |
| `tests/unit/parser/rules/registry-integration.test.ts` | TC-PR-14 |
| `tests/unit/core/spec/rules/no-legacy-flat-file.test.ts` | TC-DSV-01/02 |
| `tests/unit/core/spec/rules/no-legacy-flat-dir.test.ts` | TC-DSV-03/04 |
| `tests/unit/core/spec/rules/no-specs-for-required-type.test.ts` | TC-DSV-05/06/07 |
| `tests/unit/core/spec/rules/canonical-spec-structure.test.ts` | TC-DSV-08/09/10/11/12 |

## Blocked Tasks

None.

## Design Notes

- D9 (early return for `no-specs-for-required-type`) preserved: the rule runs standalone before `createDeltaSpecRegistry()` in `validateDeltaSpecPaths`.
- `DeltaSpecRuleRegistry` is a standalone async class (not extending `RuleRegistry`) per D6.
- Existing tests (`request-md.test.ts`, `delta-spec-validator.test.ts`) pass without modification — regression guard satisfied.
