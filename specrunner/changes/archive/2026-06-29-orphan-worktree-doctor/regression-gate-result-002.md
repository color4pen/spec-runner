# Regression Gate Result — Iteration 2

- **verdict**: approved

## Finding Verification

### [MEDIUM] `removed` counter increments and `info` says "Removed:" even when `worktreeManager.remove` throws

**Status**: ✅ Fixed — still present

`src/core/prune/runner.ts` lines 154–183 introduce a `worktreeRemoved = false` flag before the try block. The flag is only set to `true` when `worktreeManager.remove` resolves without throwing. Both `info.push("Removed: ...")` and `removed++` are guarded by `if (worktreeRemoved)` (lines 179–182), so a throw leaves `removed` at 0 and `info` empty for that orphan while still appending the warning.

### [LOW] Test `"continues with warning when worktreeManager.prune fails"` never actually calls `worktreeManager.prune`

**Status**: ✅ Fixed — still present

`tests/unit/core/prune/runner.test.ts` line 277: the test now sets `mockScan.mockResolvedValue([makeOrphan()])` (with one orphan) instead of `[]`. This prevents the early-return path, ensuring `worktreeManager.prune()` is reached and the rejection is exercised. The assertion at lines 287–289 also validates the warning content (`"git worktree prune failed"`), not just the exitCode.

## Regressions

None.

## Contradictions

None.
