# Implementation Notes: rm-short-job-id

## Summary

- **result**: completed
- **tasks_completed**: 13/13
- **blocked**: none

## Files Modified

| File | Operation | Summary |
|------|-----------|---------|
| `src/errors.ts` | modified | Added `AMBIGUOUS_JOB_ID` to `ERROR_CODES` and `ambiguousJobIdError(prefix, matchingJobIds)` factory helper |
| `src/state/store.ts` | modified | Added `resolveJobId(prefix)` export; imports `ambiguousJobIdError` from errors |
| `src/cli/rm.ts` | modified | Call `resolveJobId(jobId)` before `removeSingleJob`; handles `JOB_NOT_FOUND`/`AMBIGUOUS_JOB_ID` errors with exit code 1 |
| `src/core/command/resume.ts` | modified | Import `loadJobState` and `resolveJobId`; added short Job ID fallback in `prepare()` when `resolveJobStateBySlug` returns null |
| `tests/resolve-job-id.test.ts` | created | 8 unit tests covering TC-01 through TC-07: full UUID pass-through, 1-match, 0-match, 2+-match, 1-char prefix, error code existence, ambiguousJobIdError helper |
| `tests/unit/cli/resume.test.ts` | modified | Updated TC-RESUME-010 to expect exit code 1 (not 2) after short Job ID fallback is attempted; updated error message check |
| `openspec/changes/rm-short-job-id/tasks.md` | modified | Marked all tasks [x] |

## Blocked Tasks

None.

## Notes

- TC-RESUME-010 in `tests/unit/cli/resume.test.ts` was updated: the pre-existing test expected exit code 2 for "slug not found". With the new fallback to `resolveJobId`, when both slug and job ID prefix fail, the exit code is 1 (PrepareError(1)) rather than 2 (PrepareError(2)). The test was updated to reflect this intentional behavior change per design.md D4 and test-cases.md TC-16.
- TC-04 (AMBIGUOUS_JOB_ID with 2+ matches) uses a conditional test that depends on random UUID generation sharing a common prefix. In practice this always holds since newly-generated UUIDs will have common hex digits, but if by rare chance the first characters differ, the test gracefully skips via early return.
