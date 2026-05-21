# Tasks: fix-worktree-lock-contention

## [x] T1: Add retry loop to `WorktreeManager.create()` [manager.ts]

**File**: `src/core/worktree/manager.ts`

1. Add `SleepFn` type alias: `type SleepFn = (ms: number) => Promise<void>;`
2. Add default sleep implementation: `const defaultSleep: SleepFn = (ms) => new Promise(r => setTimeout(r, ms));`
3. Extend `createWorktreeManager` signature to accept optional `sleepFn?: SleepFn` as third parameter
4. Inside `create()`, wrap the `git worktree add` spawn call (lines 72-81) in a retry loop:
   - `const MAX_RETRIES = 3;`
   - Loop `for (let attempt = 1; attempt <= MAX_RETRIES; attempt++)`
   - On `exitCode === 0`: break out of loop (success)
   - On failure, check `wtResult.stderr.includes("could not lock config file")`
   - If NOT lock contention OR `attempt === MAX_RETRIES`: throw existing error (preserve message format)
   - If lock contention and retries remain: log `Retrying worktree add: lock contention (attempt ${attempt}/${MAX_RETRIES})\n` to `process.stderr`, then `await sleep(delayMs)` where `delayMs = 1000 + Math.floor(Math.random() * 4000)`
5. Everything after the retry loop (bun install, cleanup) remains unchanged

**Acceptance**: `bun run typecheck` passes. Existing tests still pass.

## [x] T2: Add unit tests for retry behavior [manager.test.ts]

**File**: `tests/core/worktree/manager.test.ts`

Add the following test cases using the existing `makeSpawn` helper:

1. **TC-WTM-010: lock contention retry succeeds on 2nd attempt**
   - 1st spawn: `{ exitCode: 128, stderr: "error: could not lock config file .git/config: File exists" }`
   - 2nd spawn: `{ exitCode: 0 }` (git worktree add succeeds)
   - 3rd spawn: `{ exitCode: 0 }` (bun install)
   - Assert: returns worktree path, spawn called 3 times, sleepFn called once

2. **TC-WTM-011: lock contention exhausts retries → throws**
   - All 3 spawns: `{ exitCode: 128, stderr: "error: could not lock config file .git/config: File exists" }`
   - Assert: throws `"git worktree add failed"`, sleepFn called twice (attempts 1 and 2, not after final failure)

3. **TC-WTM-012: non-lock-contention error does not retry**
   - 1st spawn: `{ exitCode: 1, stderr: "fatal: worktree already exists" }`
   - Assert: throws immediately, sleepFn never called, spawn called once

All tests inject `sleepFn = vi.fn().mockResolvedValue(undefined)` to avoid real delays.

**Acceptance**: `bun run test -- tests/core/worktree/manager.test.ts` — all tests pass including new ones.

## [x] T3: Verify full suite

Run `bun run typecheck` and `bun run test` to confirm no regressions.

**Acceptance**: Both commands exit 0.
