# Implementation Notes: implement-delta-merge

## Summary

- **result**: completed
- **tasks_completed**: 8/8
- **blocked**: none
- **test_cases_skipped**: none

## Files Modified

| Path | Operation | Summary |
|------|-----------|---------|
| `src/core/finish/types.ts` | modified | Added `readFile(path: string): Promise<string>` to `FinishFs` interface |
| `src/cli/finish.ts` | modified | Added `readFile` implementation to `buildRealFs()` |
| `src/util/paths.ts` | modified | Added `specsDirRel()` and `baselineSpecPath(capability)` functions |
| `src/core/finish/spec-merge.ts` | created | Delta spec parser, baseline spec parser, validation, merge logic, render, `mergeSpecsForChange()` |
| `src/core/finish/orchestrator.ts` | modified | Integrated `mergeSpecsForChange()` before `archiveChangeFolder()` in Phase 1 |
| `tests/finish-spec-merge.test.ts` | created | Full test coverage for all parser, merge, and orchestration functions (TC-SM-002 to TC-SM-082) |
| `tests/finish-archive-change-folder.test.ts` | modified | Added `readFile` mock to `makeFs()` helper |
| `tests/finish-move-requests-dir.test.ts` | modified | Added `readFile` mock to `makeFs()` helper |
| `tests/finish-orchestrator.test.ts` | modified | Added `readFile` mock + `specs/` path guard to `makeStubFs()` |
| `tests/finish-adversarial.test.ts` | modified | Added `readFile` mock + `specs/` path guard to `makeStubFs()` |
| `tests/unit/core/finish/preflight.test.ts` | modified | Added `readFile` mock to `makeFs()` helper |
| `specrunner/changes/implement-delta-merge/tasks.md` | modified | Marked all tasks as complete |

## Implementation Details

### spec-merge.ts

Implements the full delta spec → baseline spec merge pipeline:

- `parseDeltaSpec()`: line-based regex parser. Finds `## ADDED/MODIFIED/REMOVED Requirements` sections, then splits each section by `### Requirement:` headers.
- `parseBaselineSpec()`: finds `## Requirements` section, splits preamble/requirements/postamble. Handles missing Requirements section and postamble sections (e.g. `## See Also`).
- `validateDeltaSpec()`: checks for duplicate names within each section and cross-section conflicts across all three sections.
- `applyMerge()`: applies REMOVED → MODIFIED → ADDED in order. Accumulates all errors before returning (does not short-circuit).
- `renderBaselineSpec()`: reconstructs text as preamble + `## Requirements\n\n` + blocks + postamble. Guarantees trailing newline.
- `createNewBaselineSpec()`: wraps ADDED blocks in a new baseline with `## Purpose\n\nTBD\n\n`.
- `mergeSpecsForChange()`: 2-pass implementation. Pass 1 validates + computes merged content for all capabilities. Pass 2 writes only if all pass 1 succeed.

### orchestrator.ts change

Phase 1 order is now: **merge → archive → move → commit**. If merge returns `ok: false`, Phase 1 returns escalation immediately without calling `archiveChangeFolder`.

### Spec reviewer MEDIUM finding addressed (finding #1)

The `readdir` result is filtered through `fs.stat().isDirectory()` before treating entries as capability directories, preventing stray files in `specs/` from causing parse errors.

## Blocked Tasks

None.
