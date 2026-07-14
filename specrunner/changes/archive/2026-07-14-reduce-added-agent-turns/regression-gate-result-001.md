# Regression Gate — reduce-added-agent-turns — Iteration 1

- **verdict**: approved
- **iteration**: 001

## Ledger Items

### Item 1: ADDED_TURNS_ZERO が production コードで未使用

- **File**: `src/core/port/agent-runner.ts:241`
- **Source finding severity**: low

**Verification**: The constant `ADDED_TURNS_ZERO` is still exported from `src/core/port/agent-runner.ts` and is still not imported in production code. The adapter (`src/adapter/claude-code/agent-runner.ts`) initialises per-type counters as individual `let` variables (`let reportRetry = 0; let postWork = 0; let outputRepair = 0;`). The constant is used only in `src/core/port/__tests__/agent-runner.test.ts`.

**Regression assessment**: NOT a regression. This finding was never fixed. The code-fixer explicitly declined to address it ("All findings are LOW severity — no fixes required per instructions"). The code is in the same state as when the code-reviewer flagged it. No new change has re-introduced or worsened this issue.

---

### Item 2: result file not found エラー返却パスに addedTurns が含まれない

- **File**: `src/adapter/claude-code/agent-runner.ts:884`
- **Source finding severity**: low

**Verification**: The `catch` block for `result file not found` (lines 884–894) still does not include `addedTurns`. The success path (line 908) and the follow-up-query-failed early return (around line 768) both include `addedTurns: { reportRetry, postWork, outputRepair }`, but this specific error path does not.

**Regression assessment**: NOT a regression. This finding was never fixed. The code-fixer explicitly declined to address it ("All findings are LOW severity — no fixes required per instructions"). The code is in the same state as when the code-reviewer flagged it. No new change has re-introduced or worsened this issue.

---

## Summary

Both ledger items are still present in the current code. Neither was fixed during this job — the code-fixer consciously chose not to address them (LOW severity, `Fix: no` in the review table). No regressions have occurred: the code has not regressed with respect to these findings because they were never in a "fixed" state to begin with.

No new fixable findings were detected. No contradictions (fixing A re-introducing B) were observed.

- **verdict**: approved
