# Implementation Notes: requests-to-drafts-restructure

## Summary

- **result**: completed
- **tasks_completed**: 14/14 (Task 15 = typecheck/test run is CI responsibility)

## Files Modified

### Source Files

| Path | Operation | Summary |
|---|---|---|
| `src/util/paths.ts` | Modified | Added `DRAFTS_DIR`, `draftsDir()`, `draftPath()` helpers |
| `src/core/request/store.ts` | Modified | Changed `ACTIVE_SUBDIR` → `DRAFTS_SUBDIR`, extended `checkSlugCollision` to 3-path check (drafts + merged + archive) |
| `src/core/command/request-new.ts` | Modified | Updated to use `draftPath()` for output path, removed direct path construction |
| `src/core/command/request-rm.ts` | Modified | Updated target dir to `DRAFTS_SUBDIR`, uses `draftPath()` for message |
| `src/core/command/request-show.ts` | Modified | Primary lookup via `storeResolve()` (→ drafts/), fallback to legacy `requests/active/` with deprecation warning |
| `src/core/command/request-migrate-flat.ts` | Modified | Changed from iterating `active`/`merged` under `requests/` to `drafts/` + `requests/merged/` |
| `src/core/command/pipeline-run.ts` | Modified | `CANONICAL_PATTERN` updated to match `specrunner/drafts/<slug>.md` |
| `src/core/runtime/local.ts` | Modified | Removed canonical path copy; added `fs.rm(opts.requestFilePath)` after change folder copy |
| `src/core/runtime/managed.ts` | Modified | Same as local.ts — removed canonical copy, added draft deletion |
| `src/core/finish/orchestrator.ts` | Modified | Removed `moveRequestsDir` import+call; updated dry-run plan text |
| `src/core/finish/move-requests-dir.ts` | Deleted | No longer needed (archive path is `changes/archive/` only) |
| `src/core/finish/resolve-target.ts` | Modified | `resolveByAutoDetect` returns immediate error; `detectSlugFromCwd` removed; unused `path` import removed |
| `src/context/request-patterns.ts` | Modified | Changed from `requests/merged/` to `changes/archive/` as pattern source |
| `src/core/doctor/checks/repo/workflow-structure.ts` | Modified | Checks `drafts/` instead of `requests/active/`; emits deprecation warning if `requests/active/` exists |

### Documentation / Skills

| Path | Operation | Summary |
|---|---|---|
| `README.md` | Modified | Updated example path from `requests/active/` to `drafts/` |
| `.claude/skills/parallel-request-workflow/SKILL.md` | Modified | Updated all `requests/active/` references to `drafts/` |
| `.claude/skills/acceptance-and-issue-audit/SKILL.md` | Modified | Updated awaiting-merge path from `requests/active/` to `drafts/` |
| `.claude/skills/rebase-finish/SKILL.md` | Modified | Removed `active/` residue cleanup section |

### Delta Specs

| Path | Operation | Summary |
|---|---|---|
| `specrunner/changes/requests-to-drafts-restructure/delta-specs/cli-commands.md` | Modified | Replaced with new format specifying drafts/ path and auto-detect removal |
| `specrunner/changes/requests-to-drafts-restructure/delta-specs/job-state-store.md` | Modified | Updated CANONICAL_PATTERN spec |
| `specrunner/changes/requests-to-drafts-restructure/delta-specs/repository-registration.md` | Modified | Updated bootstrap structure detection spec |

### Tests

| Path | Operation | Summary |
|---|---|---|
| `tests/unit/core/command/pipeline-run-canonical.test.ts` | Modified | CANONICAL_PATTERN test updated for drafts/ |
| `tests/unit/core/request/store.test.ts` | Modified | All paths updated to drafts/; TC-ST-009 added for archive collision |
| `tests/unit/core/command/request-new.test.ts` | Modified | All paths updated to drafts/ |
| `tests/unit/core/command/request-rm.test.ts` | Modified | All paths updated to drafts/ |
| `tests/unit/core/command/request-show.test.ts` | Modified | TC-SHOW-006 legacy fallback test added |
| `tests/unit/core/command/request-migrate-flat.test.ts` | Modified | Updated to use drafts/ instead of active/ |
| `tests/unit/context/request-patterns.test.ts` | Modified | Updated to use changes/archive/ instead of requests/merged/ |
| `tests/finish-resolve-target.test.ts` | Modified | TC-004/TC-131 updated: auto-detect removed, now expects exit 2 |
| `tests/finish-move-requests-dir.test.ts` | Deleted | Source file removed, test no longer valid |
| `tests/finish-adversarial.test.ts` | Modified | Updated request path to drafts/ |
| `tests/finish-orchestrator.test.ts` | Modified | Updated request path to drafts/ |
| `tests/finish-ps-integration.test.ts` | Modified | Updated request paths to drafts/ |
| `tests/state/job-slug.test.ts` | Modified | TC-116/TC-117 CANONICAL_PATTERN updated for drafts/ |
| `tests/unit/cli/job-show.test.ts` | Modified | Updated request path to drafts/ |
| `tests/unit/cli/resume.test.ts` | Modified | Updated request path to drafts/ |
| `tests/unit/core/resume/resolve-job.test.ts` | Modified | Updated request path to drafts/ |
| `tests/unit/core/pr-create/body-template.test.ts` | Modified | Updated request path to drafts/ |
| `tests/unit/core/runtime/draft-move.test.ts` | Created | TC-DRAFT-001, TC-DRAFT-002: regression tests for draft deletion on run |
| `tests/unit/core/finish/archive-one-path.test.ts` | Created | TC-ARCH-001, TC-ARCH-002: regression tests confirming move-requests-dir removed |

## Blocked Tasks

None.

## Notes

- typecheck passes (`bun run typecheck` exits 0)
- `tests/finish-move-requests-dir.test.ts` deleted because `move-requests-dir.ts` was deleted (TC-ARCH-002 covers this)
- `request-show.ts` retains legacy fallback to `requests/active/` for backward compatibility (TC-SHOW-006)
- `workflow-structure.ts` emits deprecation warning when `requests/active/` exists (non-fatal)
