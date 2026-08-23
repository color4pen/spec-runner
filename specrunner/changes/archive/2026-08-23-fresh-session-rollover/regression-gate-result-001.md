# Regression Gate Result — fresh-session-rollover (Iteration 1)

## Verification Summary

- **Checked**: 11 ledger findings
- **Regressions found**: 1 (finding [11])
- **Fixed / closed**: 10

---

## Per-Finding Verification

### [1] [MEDIUM] T-04 Acceptance Criteria が存在しないテストパスを参照している
- **Provenance Ref**: `50ac5402`
- **Status**: FIXED
- **Evidence**: `tasks.md` T-04 Acceptance Criteria (line 75) now uses correct paths:
  `src/adapter/claude-code/__tests__/agent-runner-transient-retry.test.ts` and
  `src/adapter/claude-code/__tests__/agent-runner-report-settles.test.ts`.
  Both files confirmed present at those paths via Glob.

---

### [2] [LOW] T-04 と T-05 にまたがる rollover 実行シーケンスの暗黙的な順序依存
- **Provenance Ref**: `5c9da054`
- **Status**: FIXED
- **Evidence**: `tasks.md` T-04 line 62 now states explicitly:
  "まず **T-05 の `snapshot()` と sessionId キャプチャを先行させてから**（順序依存: T-05 参照）, `extractedSessionId = undefined`…"
  T-05 line 82 adds the matching constraint:
  "**この `snapshot()` および `extractedSessionId` からの sessionId キャプチャは、T-04 の `extractedSessionId = undefined` リセットより必ず前に実行すること**".
  Order dependency is now bidirectionally explicit.

---

### [3] [LOW] throw 経路の error 詳細保全を検証する TC が存在しない
- **Provenance Ref**: `25102dba`
- **Status**: FIXED
- **Evidence**: `test-cases.md` now has TC-035 (lines 427–438):
  "throw 経路で exhaustion と判定された場合 error.message と cause チェーンが保全される"
  with GIVEN/WHEN/THEN that checks `error.message` contents and `cause` chain preservation.

---

### [4] [HIGH] executor.ts の agent step 成功経路に sessionRollovers の pass-through が欠落
- **Provenance Ref**: `7d4bb838`
- **Status**: FIXED
- **Evidence**: `src/core/step/executor.ts` diff shows (line ~529):
  ```ts
  ...(runResult.sessionRollovers && runResult.sessionRollovers.length > 0 ? { sessionRollovers: runResult.sessionRollovers } : {}),
  ```
  added to the success `StepExecutionResult` return block, immediately after the contextMetrics spread.

---

### [5] [HIGH] SDK throw 経路のコンテキスト枯渇が rollover ループを素通りする
- **Provenance Ref**: `fb5eacfa`
- **Status**: FIXED
- **Evidence**: `src/adapter/claude-code/agent-runner.ts` lines 1007–1125 now wrap both
  `runMainWorkTurn()` and `retryWithBackoff(runMainWorkTurn, …)` in a try-catch block
  inside the rollover for-loop. Caught exhaustion errors (verified via `collectCauseText` +
  `isContextExhaustionError`) are routed through the rollover logic. Non-exhaustion throws
  and abort-triggered throws re-throw unchanged.

---

### [6] [MEDIUM] rollover budget 枯渇時に contextObserver.observeResult + markExhaustion が二重呼出しされる
- **Provenance Ref**: `0e1ba369`
- **Status**: FIXED
- **Evidence**: `agent-runner.ts` post-loop handler (lines 1255–1259) now guards with
  `if (!rolloverExhausted)` before calling `contextObserver.observeResult()` and
  `contextObserver.markExhaustion()`. When rolloverExhausted=true (budget exhausted),
  only the calls made inside the loop body execute; the post-loop calls are skipped,
  eliminating the double-write.

---

### [7] [LOW] sessionLogWriter.writeSummary がロールオーバー済みセッションの usage を最終 session ID に紐付ける
- **Provenance Ref**: `83c09936`
- **Status**: FIXED
- **Evidence**: `agent-runner.ts` lines 1503–1508:
  ```ts
  sessionLogWriter.writeSummary({
    sessionId: sessionRollovers.length > 0 ? undefined : extractedSessionId,
    model: resolvedConfig.model,
    modelUsage: extractedModelUsage,
  });
  ```
  When rollovers occurred, `sessionId` is passed as `undefined` to prevent misattributing
  multi-session cumulative cost to a single session ID.

---

### [8] [HIGH] SDK throw 経路のコンテキスト枯渇が rollover ループを素通りする（未修正）
- **Provenance Ref**: `11515924`
- **Status**: FIXED (same fix as [5])
- **Evidence**: Same implementation as finding [5] — rollover loop try-catch now covers
  both the `runMainWorkTurn()` direct call and `retryWithBackoff(runMainWorkTurn, …)`.

---

### [9] [MEDIUM] rollover budget 枯渇時に contextObserver.observeResult + markExhaustion が二重呼出しされる（未修正）
- **Provenance Ref**: `c8c4a458`
- **Status**: FIXED (same fix as [6])
- **Evidence**: Same `rolloverExhausted` guard as finding [6]. Confirmed in post-loop handler.

---

### [10] [LOW] sessionLogWriter.writeSummary がロールオーバー済みセッションの usage を最終 session ID に紐付ける（未修正）
- **Provenance Ref**: `cf5ad0dd`
- **Status**: FIXED (same fix as [7])
- **Evidence**: Same `sessionRollovers.length > 0 ? undefined : extractedSessionId` fix as [7].

---

### [11] [MEDIUM] post-success halt 3 種が runResult.sessionRollovers を転記しない
- **Provenance Ref**: `f404ce08`
- **Status**: **REGRESSION — STILL PRESENT**
- **Evidence**:
  - `src/core/step/step-halt.ts`: `makeDriftHalt`, `makeOutputGateHalt`, and `makeCommitFailHalt`
    do NOT have a `sessionRollovers` parameter and do NOT spread `sessionRollovers` into the
    returned StepHalt object. Only `makeTimeoutHalt` and `makeNonSuccessHalt` were updated.
  - `src/core/step/executor.ts` (lines 404, 424, 462): The three call sites pass only
    `runResult.contextMetrics` — no `runResult.sessionRollovers`:
    ```ts
    makeDriftHalt(drift, step.name, deps.slug, { startedAt }, runResult.contextMetrics);
    makeOutputGateHalt(allViolations, step.name, state.branch ?? null, { startedAt }, runResult.contextMetrics);
    makeCommitFailHalt(finalizeError, step.name, { startedAt }, runResult.contextMetrics);
    ```
  - Although `CommitOrchestrator.commitHalt` (in the diff) does have code to process
    `halt.sessionRollovers`, it will always see `undefined` for these 3 halt types because
    the factory functions never populate the field.
  - Design invariant D7 "rollover 発生は usage.json の contextOnly エントリとして必ず残る"
    is violated when drift / output-gate / commit-fail halts occur after a rollover.
