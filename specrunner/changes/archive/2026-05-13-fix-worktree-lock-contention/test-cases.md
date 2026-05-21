# Test Cases: fix-worktree-lock-contention

Generated from: request.md, design.md, tasks.md

---

## TC-WTM-010: Lock contention resolves on 2nd attempt

- **Category**: Unit / Retry Logic
- **Priority**: must
- **Source**: T2 / 受け入れ基準「ロック競合時に自動リトライが動作する」

**GIVEN** `WorktreeManager.create()` is called with a mocked `sleepFn`
**AND** the 1st `git worktree add` spawn returns `{ exitCode: 128, stderr: "error: could not lock config file .git/config: File exists" }`
**AND** the 2nd `git worktree add` spawn returns `{ exitCode: 0 }`
**AND** the subsequent `bun install` spawn returns `{ exitCode: 0 }`

**WHEN** `create()` resolves

**THEN** it returns the expected worktree path
**AND** spawn is called exactly 3 times (worktree attempt 1, worktree attempt 2, bun install)
**AND** `sleepFn` is called exactly once

---

## TC-WTM-011: Lock contention exhausts all 3 retries → throws

- **Category**: Unit / Retry Exhaustion
- **Priority**: must
- **Source**: T2 / 受け入れ基準「3回リトライ後に失敗した場合はエラーが throw される」

**GIVEN** `WorktreeManager.create()` is called with a mocked `sleepFn`
**AND** all 3 `git worktree add` spawns return `{ exitCode: 128, stderr: "error: could not lock config file .git/config: File exists" }`

**WHEN** `create()` is awaited

**THEN** it throws an error whose message includes `"git worktree add failed"`
**AND** `sleepFn` is called exactly twice (after attempt 1 and attempt 2, but not after the final failure)
**AND** spawn is called exactly 3 times

---

## TC-WTM-012: Non-lock-contention error does not retry

- **Category**: Unit / Error Classification
- **Priority**: must
- **Source**: T2 / design.md D3「lock contention 以外の失敗はリトライせず即 throw」

**GIVEN** `WorktreeManager.create()` is called with a mocked `sleepFn`
**AND** the 1st `git worktree add` spawn returns `{ exitCode: 1, stderr: "fatal: worktree already exists" }`

**WHEN** `create()` is awaited

**THEN** it throws immediately with a message including `"git worktree add failed"`
**AND** `sleepFn` is never called
**AND** spawn is called exactly once

---

## TC-WTM-013: Normal success path is unaffected

- **Category**: Unit / Regression
- **Priority**: must
- **Source**: 受け入れ基準「正常な worktree 作成に影響しない」

**GIVEN** `WorktreeManager.create()` is called with a mocked `sleepFn`
**AND** the 1st `git worktree add` spawn returns `{ exitCode: 0 }`
**AND** the `bun install` spawn returns `{ exitCode: 0 }`

**WHEN** `create()` resolves

**THEN** it returns the expected worktree path
**AND** `sleepFn` is never called
**AND** spawn is called exactly twice (worktree add + bun install)

---

## TC-WTM-014: Retry log message format is correct

- **Category**: Unit / Logging
- **Priority**: must
- **Source**: 要件4「リトライの経過をログ出力する」/ 受け入れ基準「リトライのログが出力される」

**GIVEN** `WorktreeManager.create()` is called
**AND** the 1st `git worktree add` spawn returns a lock contention error
**AND** the 2nd spawn succeeds

**WHEN** `create()` resolves

**THEN** `process.stderr` receives exactly one write containing `"Retrying worktree add: lock contention (attempt 1/3)"`

---

## TC-WTM-015: Sleep delay is within 1-5 second range

- **Category**: Unit / Jitter
- **Priority**: should
- **Source**: design.md D1「delayMs = 1000 + Math.floor(Math.random() * 4000)」

**GIVEN** `WorktreeManager.create()` is called with a `sleepFn` that records its argument
**AND** the 1st spawn returns a lock contention error
**AND** the 2nd spawn succeeds

**WHEN** `create()` resolves

**THEN** the value passed to `sleepFn` is ≥ 1000 and ≤ 5000 (milliseconds)

---

## TC-WTM-016: 2nd attempt also fails with lock contention, 3rd succeeds

- **Category**: Unit / Retry Logic (multi-failure)
- **Priority**: should
- **Source**: design.md「最大3回リトライ」

**GIVEN** `WorktreeManager.create()` is called with a mocked `sleepFn`
**AND** the 1st and 2nd spawns return `{ exitCode: 128, stderr: "error: could not lock config file .git/config: File exists" }`
**AND** the 3rd spawn returns `{ exitCode: 0 }`
**AND** the subsequent `bun install` spawn returns `{ exitCode: 0 }`

**WHEN** `create()` resolves

**THEN** it returns the expected worktree path
**AND** `sleepFn` is called exactly twice
**AND** spawn is called exactly 4 times

---

## TC-WTM-017: `sleepFn` defaults to real `setTimeout`-based sleep in production

- **Category**: Unit / Dependency Injection
- **Priority**: should
- **Source**: design.md D2「production では defaultSleep を使用」

**GIVEN** `createWorktreeManager()` is called without providing a `sleepFn` argument

**WHEN** the returned manager's internal sleep function is inspected

**THEN** it falls back to the `defaultSleep` implementation (i.e., `(ms) => new Promise(r => setTimeout(r, ms))`)
**AND** no `TypeError` is thrown during creation

---

## TC-WTM-018: `bun run typecheck` passes after changes

- **Category**: Build / Type Safety
- **Priority**: must
- **Source**: 受け入れ基準「bun run typecheck が全 pass」/ T1 Acceptance / T3 Acceptance

**GIVEN** the retry loop and `SleepFn` type alias have been added to `manager.ts`

**WHEN** `bun run typecheck` is executed

**THEN** it exits with code 0 with no TypeScript errors

---

## TC-WTM-019: `bun run test` full suite passes

- **Category**: Build / Regression
- **Priority**: must
- **Source**: 受け入れ基準「bun run test が全 pass」/ T3 Acceptance

**GIVEN** all implementation changes are applied

**WHEN** `bun run test` is executed

**THEN** it exits with code 0 with no failing tests (including new TC-WTM-010/011/012)

---

## TC-WTM-020: Error message format is preserved for non-retry failures

- **Category**: Unit / Error Contract
- **Priority**: should
- **Source**: tasks.md T1「preserve message format」/ design.md D3

**GIVEN** `WorktreeManager.create()` encounters a non-lock-contention error

**WHEN** the thrown error is inspected

**THEN** its message matches the format `"git worktree add failed (exit <code>): <stderr>"`
**AND** the format is identical to the pre-fix behavior

---

## TC-WTM-021: Error message format is preserved when retries are exhausted

- **Category**: Unit / Error Contract
- **Priority**: must
- **Source**: tasks.md T1「preserve message format」

**GIVEN** all 3 retry attempts return lock contention errors

**WHEN** the thrown error is inspected

**THEN** its message matches `"git worktree add failed (exit 128): error: could not lock config file ..."`
**AND** the format is identical to a non-retry throw

---

## TC-WTM-022: Lock contention detection is substring match only

- **Category**: Unit / Error Classification Edge Case
- **Priority**: could
- **Source**: design.md D3「stderr に "could not lock config file" が含まれるかで判定」

**GIVEN** the 1st spawn returns stderr containing `"could not lock config file"` preceded or followed by other text

**WHEN** lock contention is evaluated

**THEN** it is correctly identified as a retryable error
