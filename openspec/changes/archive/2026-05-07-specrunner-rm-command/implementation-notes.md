# Implementation Notes — specrunner-rm-command

## Summary

- **result**: completed
- **tasks_completed**: 12/12

## Files Modified

| Path | Operation | Summary |
|------|-----------|---------|
| `src/state/store.ts` | modified | Added `deleteJobState(jobId)` — `fs.unlink` + ENOENT ignore |
| `src/adapter/managed-agent/sdk/sessions.ts` | modified | Added `deleteSession(client, sessionId)` SDK wrapper |
| `src/core/rm/runner.ts` | created | Core rm logic: `removeSingleJob`, `removeAllTerminated`, `RmResult` type |
| `src/cli/rm.ts` | created | CLI entry `runRm(opts)` — config loading, Anthropic client construction |
| `bin/specrunner.ts` | modified | Added `rm` import, USAGE entry, switch-case with flag parsing |
| `tests/rm.test.ts` | created | 20 tests covering all specified scenarios |
| `openspec/changes/specrunner-rm-command/tasks.md` | modified | All tasks marked `[x]` |

## Implementation Decisions

- **D2 respected**: `SessionClient` port unchanged; runner receives `Anthropic` client directly
- **Best-effort session cleanup**: `deleteSession` wrapped in try-catch; API errors write to stderr and do not abort state file deletion
- **Non-TTY guard**: `removeAllTerminated` without `--yes` checks `isTTY` on stdin; rejects with exit code 1 for non-TTY
- **`--force` on running job**: emits stderr warning but proceeds (D1 risk note in design.md)

## Blocked Tasks

None.
