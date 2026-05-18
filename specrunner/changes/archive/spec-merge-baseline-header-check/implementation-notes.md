# Implementation Notes: spec-merge-baseline-header-check

## result

completed

## tasks_completed

7/7

## Files Modified

| Path | Operation | Summary |
|------|-----------|---------|
| `src/core/finish/baseline-headers.ts` | CREATE | `normalizeRequirementHeader` — strips bold/italic/inline-code markdown decoration, trims whitespace, case-preserving |
| `src/core/finish/spec-merge.ts` | MODIFY | Import `normalizeRequirementHeader`; add exported `checkBaselineHeaderConsistency`; refactor `mergeSpecsForChange` per-capability loop to hoist baseline read and call pre-check before `applyMerge` |
| `tests/unit/core/finish/spec-merge-baseline-check.test.ts` | CREATE | TC-SMB-01 through TC-SMB-09, TC-NRM-01 through TC-NRM-06 — all green |
| `specrunner/changes/spec-merge-baseline-header-check/specs/spec-merge/spec.md` | CREATE | Delta spec — ADDED requirement "baseline header consistency check before merge application" |
| `specrunner/adr/ADR-0004-2026-05-19-baseline-header-consistency-check.md` | CREATE | ADR recording decision to add normalization-aware pre-check as defense-in-depth layer |
| `specrunner/changes/spec-merge-baseline-header-check/tasks.md` | MODIFY | Marked all 7 tasks [x] |

## Blocked Tasks

None.

## Verification

`bun run typecheck && bun run test`: 195 test files, 2209 tests — all passed.
