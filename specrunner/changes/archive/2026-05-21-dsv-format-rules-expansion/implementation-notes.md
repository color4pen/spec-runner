# Implementation Notes: dsv-format-rules-expansion

## Summary

- **result**: completed
- **tasks_completed**: 11/11

## Files Modified

### Source Files

| Path | Operation | Summary |
|---|---|---|
| `src/core/spec/rules/types.ts` | Modified | Added 6 new names to `DeltaSpecRuleName` union; added optional `baselineSpecLoader` field to `DeltaSpecRuleInput` |
| `src/core/spec/delta-spec-validator.ts` | Modified | Added 6 new reasons to `DeltaSpecViolationReason` union; added optional `baselineSpecLoader` 4th parameter (default `async () => null`) to `validateDeltaSpecPaths` |
| `src/core/spec/rules/index.ts` | Modified | Registered 6 new rules in `createDeltaSpecRegistry()` (3 → 9 rules) |
| `src/core/step/delta-spec-validation.ts` | Modified | Injected real `baselineSpecLoader` that reads `specrunner/specs/<capability>/spec.md` |
| `src/core/spec/rules/spec-content-parser.ts` | Created | Shared helpers: `loadSpecFiles`, `extractSection`, `parseRequirementBlocks` |
| `src/core/spec/rules/removed-section-format.ts` | Created | `## Removed` section line format rule |
| `src/core/spec/rules/renamed-section-format.ts` | Created | `## Renamed` section line format rule |
| `src/core/spec/rules/requirement-header-required.ts` | Created | `### Requirement:` prefix enforcement rule |
| `src/core/spec/rules/scenario-required-per-requirement.ts` | Created | `#### Scenario:` presence per Requirement rule |
| `src/core/spec/rules/normative-keyword-required.ts` | Created | `SHALL`/`MUST` keyword in Requirement body rule |
| `src/core/spec/rules/baseline-header-match.ts` | Created | Baseline header exact-match / normalized-match detection rule |

### Tests

| Path | Operation | Summary |
|---|---|---|
| `tests/unit/core/spec/rules/spec-content-parser.test.ts` | Created | TC-010 through TC-019: loadSpecFiles, extractSection, parseRequirementBlocks |
| `tests/unit/core/spec/rules/removed-section-format.test.ts` | Created | TC-020 through TC-026 incl. PR #359 regression |
| `tests/unit/core/spec/rules/renamed-section-format.test.ts` | Created | TC-030 through TC-037 |
| `tests/unit/core/spec/rules/requirement-header-required.test.ts` | Created | TC-040 through TC-045 |
| `tests/unit/core/spec/rules/scenario-required-per-requirement.test.ts` | Created | TC-050 through TC-054 |
| `tests/unit/core/spec/rules/normative-keyword-required.test.ts` | Created | TC-060 through TC-066 |
| `tests/unit/core/spec/rules/baseline-header-match.test.ts` | Created | TC-070 through TC-077 |

### Delta Specs

| Path | Operation | Summary |
|---|---|---|
| `specrunner/changes/dsv-format-rules-expansion/specs/delta-spec-rule/spec.md` | Already existed | Delta spec with 11 ADDED Requirements covering the 6 new rules and plumbing changes |

## Blocked Tasks

None.

## Notes

- `bun run typecheck` exits 0 (no type errors)
- `bun run test` exits 0: 2516 tests pass across 233 test files
- `extractSection` uses regex-based extraction (not split/join) to correctly handle trailing newlines and multi-section Markdown
- The `## Removed` / `## Renamed` rules check all non-empty lines (including heading-style lines like `### Removed: name`) — this catches the PR #359 regression pattern
- `baseline-header-match` detects case mismatches and extra whitespace via normalized comparison (lowercase + whitespace collapse), while treating genuinely new requirements (ADDED) as passing
