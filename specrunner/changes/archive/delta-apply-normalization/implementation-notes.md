# Implementation Notes: delta-apply-normalization

## Summary

- **result**: completed
- **tasks_completed**: 7/7

## Files Modified

| File | Operation | Summary |
|------|-----------|---------|
| `src/core/finish/spec-merge.ts` | MODIFIED | Added request.md reading, type validation against TYPE_CONFIG, type-based skip/fail logic for SPEC_REQUIRED_TYPES vs SPEC_OPTIONAL_TYPES, and empty delta detection before validateDeltaSpec |
| `tests/finish-spec-merge.test.ts` | MODIFIED | Updated TC-SM-070 to fix readFile count assertion; updated TC-SM-071 to TC-SM-082 mock readFile to distinguish request.md from delta specs; added TC-SM-090 through TC-SM-102 |
| `tests/finish-orchestrator.test.ts` | MODIFIED | Added STUB_REQUEST_MD constant and updated makeStubFs.readFile mock to return valid request.md content when path ends with "request.md" |
| `specrunner/specs/spec-merge/spec.md` | CREATED | New baseline capability spec with 4 Requirements + 4 Scenarios |
| `specrunner/specs/cli-finish-command/spec.md` | MODIFIED | Removed Phase 0 checks 5 and 6, removed openspec from check 7, renumbered old 7→5, 8→6, 9→7; removed openspec validate Scenario; updated "全 check 通過" Scenario to reference new check numbers |
| `src/prompts/spec-fixer-system.ts` | MODIFIED | Updated ファイル配置 section to clarify canonical path and list 3 prohibited non-canonical paths |
| `specrunner/changes/delta-apply-normalization/specs/spec-merge/spec.md` | CREATED | Delta spec (ADDED) for new spec-merge capability |
| `specrunner/changes/delta-apply-normalization/specs/cli-finish-command/spec.md` | CREATED | Delta spec (MODIFIED) for cli-finish-command Phase 0 check table changes |
| `specrunner/changes/delta-apply-normalization/tasks.md` | MODIFIED | Marked all acceptance criteria as completed |

## Blocked Tasks

None.

## Key Implementation Decisions

- `mergeSpecsForChange` reads `request.md` via `fs.readFile` (using the existing `FinishFs` abstraction) before checking `specs/` existence. This preserves the existing params signature unchanged.
- `parseRequestMdContent` warns but does not throw for unknown types; `spec-merge.ts` independently validates against `TYPE_CONFIG` keys.
- The defense-in-depth check (SPEC_REQUIRED_TYPES + SPEC_OPTIONAL_TYPES must cover all TYPE_CONFIG keys) is currently in code but not exhaustively enforced at startup — if TYPE_CONFIG gains a new type not in either set, it will fail at runtime with a clear error.
- Existing TC-SM-070 assertion `readFile called 0 times` was correctly removed since request.md is now read before the specs/ check.
- finish-orchestrator tests needed STUB_REQUEST_MD because the test fs mock returned `""` for all readFile calls, causing parseRequestMdContent to throw on the missing title.
