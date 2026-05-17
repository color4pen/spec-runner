# Implementation Notes: dsv-specs-presence-check

## Summary

- **result**: completed
- **tasks_completed**: 7/7

## Files Modified

| File | Operation | Summary |
|------|-----------|---------|
| `src/core/spec/delta-spec-validator.ts` | MODIFIED | Added `"no-specs-for-required-type"` to `DeltaSpecViolationReason` union; added `requestType?: string` parameter to `validateDeltaSpecPaths`; added Step 5 (specs/ presence check) before existing Step 1, with 2-level .md scan and early-return violation |
| `src/core/step/delta-spec-validation.ts` | MODIFIED | Passed `deps.request.type` as third argument to `validateDeltaSpecPaths` |
| `src/core/step/delta-spec-fixer.ts` | MODIFIED | Added step 3 to `buildDeltaSpecFixerInitialMessage` prompt: create new delta spec when specs/ is absent; renumbered steps 3→4, 4→5, 5→6 |
| `tests/unit/core/spec/delta-spec-validator.test.ts` | MODIFIED | Added TC-V-11 through TC-V-15 covering spec-change/new-feature with 0 .md files, bug-fix/refactoring skipping the check, and spec-change with valid spec passing through |
| `tests/unit/step/delta-spec-validation.test.ts` | MODIFIED | Added TC-DSV-04: validator returning `no-specs-for-required-type` violation → result file contains `needs-fix` verdict and the new reason string |
| `specrunner/changes/dsv-specs-presence-check/tasks.md` | MODIFIED | Marked all 7 tasks as [x] completed |

## Blocked Tasks

None.

## Key Implementation Decisions

- Step 5 is placed **before** Step 1 (not after Step 4) because the existing Step 3 has an early-return path when `specs/` is absent — placing Step 5 after Step 3 would make it unreachable when `specs/` doesn't exist.
- The 2-level scan (`readdir(specs/)` then `readdir(specs/entry)`) covers both flat `.md` files directly in `specs/` (non-canonical but present) and canonical `specs/<cap>/spec.md` paths.
- `requestType` is optional, preserving full backward compatibility with existing tests that don't pass the argument.
- Task 7 (delta spec) was already present in the change folder at `specrunner/changes/dsv-specs-presence-check/specs/pipeline-orchestrator/spec.md`.
