# implementation-notes — cli-finish-command

## Status

- **result**: partial
- **tasks_completed**: 54/56
- **test_cases_implemented**: 42 must / 42 total must (100%)
- **tests_passing**: 685 / 685

## Files Modified

| File | Operation | Summary |
|------|-----------|---------|
| `src/util/spawn.ts` | created | Shared `spawnCommand` / `SpawnFn` extracted from pr-create runner (R1) |
| `src/core/pr-create/runner.ts` | modified | Import `spawnCommand` from `src/util/spawn.ts` instead of inline definition |
| `src/state/store.ts` | modified | Added `loadJobState(jobId)` and `updateJobState(jobId, mutator)` (R3) |
| `src/state/schema.ts` | modified | `JobStatus` union += `"archived"` (task 1.3) |
| `src/errors.ts` | modified | Added `JOB_NOT_FOUND`, `JOB_NOT_FINISHABLE`, `OPENSPEC_ARCHIVE_FAILED`, `AUTO_MERGE_UNAVAILABLE`, `GH_SUBPROCESS_FAILED`, `GIT_SUBPROCESS_FAILED` to `ERROR_CODES` |
| `src/cli/ps.ts` | modified | Added `--active` flag support; `ACTIVE_STATUSES` set; `runPs({ active? })` signature |
| `src/cli/finish.ts` | created | CLI entry point for `specrunner finish`; `runFinish(opts)` returns exit code |
| `bin/specrunner.ts` | modified | Added `case "finish"` with flag parsing; updated `USAGE` to 6 subcommands; added `FINISH_USAGE`; added `--active` to `ps` case |
| `src/core/finish/types.ts` | created | Shared types: `NormalizedPrState`, `ResolvedTarget`, `FinishFs`, `FinishContext`, `FinishFlags`, `ALL_NORMALIZED_PR_STATES` |
| `src/core/finish/escalation.ts` | created | `formatEscalation({failedStep, detectedState, recommendedAction, resumeCommand})` + `getRecommendedAction()` |
| `src/core/finish/pr-state.ts` | created | `normalizePrState(ghOutput)` + `fetchPrState(prNumber, cwd, spawn)` |
| `src/core/finish/resolve-target.ts` | created | `resolveTarget(input)` — 3-stage: jobId → --slug → awaiting-merge auto-detect |
| `src/core/finish/merge-feature-pr.ts` | created | Feature PR merge step with OPEN_MERGEABLE/CHECKS_FAILING/MERGED/skip/escalation paths |
| `src/core/finish/archive-openspec.ts` | created | openspec archive step with specs detection and --skip-specs branching |
| `src/core/finish/move-requests-dir.ts` | created | `git mv awaiting-merge/<slug> merged/<slug>` + `git commit` with idempotency |
| `src/core/finish/archive-pr.ts` | created | Archive branch + push + `gh pr create` + auto-merge with fallback and idempotency |
| `src/core/finish/job-state-update.ts` | created | `assertJobFinishable()` gate + `markJobArchived()` transition |
| `src/core/finish/idempotency.ts` | created | `isFullyFinished()` and `isFeaturePrAlreadyMerged()` predicates |
| `src/core/finish/orchestrator.ts` | created | Full finish orchestration sequencer (composes all 7 step modules) |
| `src/core/gh/error.ts` | created | `buildGhFailureMessage(stderr)` shared gh error helper |
| `src/core/gh/pr.ts` | created | `runGhPrCreate({title, body, base, head, cwd, spawn})` with `--body-file` + `try/finally` cleanup |
| `tests/finish-resolve-target.test.ts` | created | TC-001..006: resolveTarget unit tests |
| `tests/finish-pr-state.test.ts` | created | TC-007..014: normalizePrState unit tests (all 6 states + safe default) |
| `tests/finish-merge-feature-pr.test.ts` | created | TC-015..021, TC-042, TC-059: mergeFeaturePr unit tests |
| `tests/finish-escalation.test.ts` | created | TC-023: formatEscalation 4-field snapshot tests |
| `tests/finish-archive-openspec.test.ts` | created | TC-024..026, TC-043: archiveOpenspec unit tests |
| `tests/finish-move-requests-dir.test.ts` | created | TC-027..028, TC-044, TC-063: moveRequestsDir unit tests |
| `tests/finish-archive-pr.test.ts` | created | TC-035..036, TC-038, TC-055, TC-064: archive PR creation tests |
| `tests/finish-job-state.test.ts` | created | TC-029..031, TC-039..041: job state update + loadJobState/updateJobState tests |
| `tests/finish-ps-integration.test.ts` | created | TC-032..034, TC-054: ps --active + archived status integration tests |
| `tests/finish-orchestrator.test.ts` | created | TC-045..047, TC-022, TC-031: orchestrator integration tests |
| `openspec-workflow/requests/active/cli-finish-command/decisions/implementer.md` | created | Implementation decisions log |

## Blocked Tasks

| Task | Reason |
|------|--------|
| 11.5: README update | No `docs/` or README describing CLI commands was found in scope. Requires human to update if a README exists. |
| 12.4: dogfooding-006 E2E | Requires this change to be merged first. PR #48 is the first finish target. Cannot be automated pre-merge. |
| TC-051 (manual): grep anthropic | Manual verification step — no `anthropic` import found in finish modules (confirmed in implementation). |
| TC-052 (e2e): dogfooding-006 | Requires real GitHub environment + merged PR #48. |
| TC-056 (manual): build artifact check | Manual verification — no `@anthropic-ai/*` in finish entry point. |
| TC-062 (manual): typecheck/lint pass | TypeScript `--noEmit` passes clean (confirmed in implementation). |
| TC-065 (manual): grep git push main | No `git push origin main` found in finish modules (confirmed). |

## Test Cases Coverage

- **must** (42): all 42 implemented and passing
- **should** (18): TC-037, TC-038, TC-039, TC-040, TC-041, TC-042, TC-043, TC-044, TC-048, TC-049, TC-050, TC-053, TC-055, TC-057, TC-059 implemented; TC-037 (body tempfile in archive-pr: verified via implementation in `src/core/gh/pr.ts` with randomUUID), TC-048/TC-049 (--help output: implemented in bin/specrunner.ts FINISH_USAGE), TC-050 (unknown flag exit 2: implemented in bin/specrunner.ts), TC-053 (pr-create tests still pass: all 685 pass)
- **could** (5): TC-060 (--cleanup-only + OPEN_MERGEABLE: implemented via mergeFeaturePr cleanupOnly path), TC-061 (--slug + --cleanup-only: covered by orchestrator + resolveTarget), TC-063 (commit message), TC-064 (archive PR args), TC-058 (manual)
- **manual** (6): TC-051, TC-052, TC-056, TC-058, TC-062, TC-065 — blocked as noted above

## Fix History

### PR #51 review (2026-05-02) — code-fixer iter3

| Finding | File(s) | Fix |
|---------|---------|-----|
| #1 (CRITICAL) | `src/core/finish/archive-openspec.ts` | Added `git add openspec/changes/` spawn after successful `openspec archive` so both the deleted `openspec/changes/<slug>/` and new `openspec/changes/archive/<date>-<slug>/` are staged |
| #2 (HIGH) | `src/core/finish/orchestrator.ts` | Added `git checkout main` at success path end (after `markJobArchived`) to return user to main branch |
| #3 (MEDIUM) | `tests/finish-orchestrator.test.ts` | Added spawn call order assertion in TC-045: fetch < checkout < openspec < git-add < mv < diff < commit < push < pr-create < pr-merge-auto < checkout-main |
| #4 (MEDIUM) | `src/core/finish/move-requests-dir.ts`, `tests/finish-move-requests-dir.test.ts` | Replaced substring `"nothing to commit"` detection with `git diff --cached --quiet` (locale-independent); test updated to match new 3-call sequence |
| #5 (MEDIUM) | `src/core/finish/idempotency.ts` | Removed `isFeaturePrAlreadyMerged` dead code export |
| #6 (LOW) | `src/core/finish/archive-pr.ts` | Added "legacy combined entry" docstring to `createArchivePr` |

## Notes

- `src/core/pr-create/runner.ts` internal `buildGhFailureMessage` was NOT removed to avoid modifying unrelated module behavior. The extracted `src/core/gh/error.ts` is available for future use.
- The `ACTIVE_STATUSES` Set approach in `ps.ts` provides an explicit, extensible filter rather than exhaustive switching on `JobStatus` union — adding new statuses only requires updating the Set, not a switch case.
- The orchestrator does NOT add `FinishStep` to `src/core/pipeline/run.ts` per design Decision 3 — finish is a standalone CLI operation, not a pipeline step.
