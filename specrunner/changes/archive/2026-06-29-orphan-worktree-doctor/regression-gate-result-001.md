# Regression Gate Result — Iteration 1

- **verdict**: needs-fix

## Ledger Verification

### [MEDIUM] `removed` counter increments and `info` says "Removed:" even when `worktreeManager.remove` throws
- **File**: src/core/prune/runner.ts:179
- **Status**: FIXED
- **Evidence**: A `worktreeRemoved` boolean flag is set to `true` only when `worktreeManager.remove()` succeeds (line 161). Both `info.push("Removed: ...")` and `removed++` are guarded by `if (worktreeRemoved)` (line 179). When the call throws, the flag stays `false`, so neither the "Removed:" entry nor the counter increment fires. Output no longer contradicts warnings.

### [LOW] Test `"continues with warning when worktreeManager.prune fails"` never actually calls `worktreeManager.prune`
- **File**: tests/unit/core/prune/runner.test.ts:276
- **Status**: REGRESSION — still present
- **Evidence**: The test at line 276 still uses `mockScan.mockResolvedValue([])`. The runner returns early at lines 81–86 when `orphans.length === 0`, which is before `worktreeManager.prune` is called (line 90). The test comment on line 285 even states *"No orphans → early return before prune is called"*, confirming the mock rejection is never triggered. The graceful-handling path — where orphans exist and `prune` throws — remains untested.

## Required Fix

Replace the test body so that `mockScan` returns at least one orphan and `mockInspect` returns `{ hasWork: false }`, then verify that the result still has `exitCode: 0` and that `result.warnings` contains the prune-failure message. Example:

```typescript
it("continues with warning when worktreeManager.prune fails", async () => {
  mockScan.mockResolvedValue([makeOrphan()]);
  mockInspect.mockResolvedValue({ hasWork: false, reasons: [] });
  manager.prune.mockRejectedValue(new Error("prune failed"));

  const result = await pruneOrphanWorktrees({
    force: false,
    deps: { repoRoot: REPO_ROOT, spawn, worktreeManager: manager },
  });

  expect(result.exitCode).toBe(0);
  expect(result.warnings).toBeDefined();
  expect(result.warnings!.some((w) => w.includes("prune failed"))).toBe(true);
});
```
