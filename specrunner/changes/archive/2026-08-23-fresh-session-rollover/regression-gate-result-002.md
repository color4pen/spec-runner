# Regression Gate Result — fresh-session-rollover (Iteration 2)

## Verification Summary

- **Checked**: 11 ledger findings
- **Regressions found**: 0
- **Fixed / closed**: 11

---

## Per-Finding Verification

### [1] [MEDIUM] T-04 Acceptance Criteria が存在しないテストパスを参照している
- **Provenance Ref**: `50ac5402`
- **Status**: FIXED
- **Evidence**: `tasks.md` T-04 Acceptance Criteria (line 75) uses the correct paths:
  `src/adapter/claude-code/__tests__/agent-runner-transient-retry.test.ts` and
  `src/adapter/claude-code/__tests__/agent-runner-report-settles.test.ts` —
  confirmed via `git diff main...HEAD -- specrunner/changes/fresh-session-rollover/tasks.md`.

---

### [2] [LOW] T-04 と T-05 にまたがる rollover 実行シーケンスの暗黙的な順序依存
- **Provenance Ref**: `5c9da054`
- **Status**: FIXED
- **Evidence**: `tasks.md` T-04 (line 62) explicitly states "まず **T-05 の `snapshot()` と
  sessionId キャプチャを先行させてから**（順序依存: T-05 参照）, `extractedSessionId = undefined` …"
  and T-05 (line 82) adds the symmetric constraint "**この `snapshot()` および
  `extractedSessionId` からの sessionId キャプチャは、T-04 の `extractedSessionId = undefined`
  リセットより必ず前に実行すること**". Order dependency is bidirectionally explicit. The
  implementation at `agent-runner.ts` lines 1145–1176 confirms the correct order:
  `capturedSessionId` and `snapshot()` are captured before `extractedSessionId = undefined`.

---

### [3] [LOW] throw 経路の error 詳細保全を検証する TC が存在しない
- **Provenance Ref**: `25102dba`
- **Status**: FIXED
- **Evidence**: `test-cases.md` TC-035 (lines 427–438) added:
  "throw 経路で exhaustion と判定された場合 error.message と cause チェーンが保全される"
  with GIVEN/WHEN/THEN verifying that `error.code === "CONTEXT_WINDOW_EXHAUSTED"`,
  `error.message` contains the original throw message, and `error.cause` chain is preserved.

---

### [4] [HIGH] executor.ts の agent step 成功経路に sessionRollovers の pass-through が欠落
- **Provenance Ref**: `7d4bb838`
- **Status**: FIXED
- **Evidence**: `src/core/step/executor.ts` diff (line ~530) adds:
  ```ts
  ...(runResult.sessionRollovers && runResult.sessionRollovers.length > 0
    ? { sessionRollovers: runResult.sessionRollovers } : {}),
  ```
  to the success `StepExecutionResult` return block, immediately after the `contextMetrics` spread.
  `StepExecutionResult` success variant also gains `sessionRollovers?: AgentSessionRollover[]`
  in `commit-orchestrator.ts` (line ~125).

---

### [5] [HIGH] SDK throw 経路のコンテキスト枯渇が rollover ループを素通りする
- **Provenance Ref**: `fb5eacfa`
- **Status**: FIXED
- **Evidence**: `agent-runner.ts` rollover for-loop (lines 1003–1225) wraps both
  `runMainWorkTurn()` and `retryWithBackoff(runMainWorkTurn, …)` in a try-catch block.
  The catch (lines 1089–1124) uses `collectCauseText()` + `isContextExhaustionError()` to
  identify exhaustion throws and routes them through the same rollover/budget-exhausted logic
  as the error-result path. Non-exhaustion throws and abort-triggered throws re-throw unchanged
  to the outer catch (line 1124).

---

### [6] [MEDIUM] rollover budget 枯渇時に contextObserver.observeResult + markExhaustion が二重呼出しされる
- **Provenance Ref**: `0e1ba369`
- **Status**: FIXED
- **Evidence**: The post-loop handler (lines 1253–1259) guards both calls:
  ```ts
  if (!rolloverExhausted) {
    contextObserver.observeResult(errorResult as Record<string, unknown>);
  }
  if (errorJoined && !rolloverExhausted) contextObserver.markExhaustion(errorJoined);
  ```
  When the budget-exhausted branch fires (`rolloverExhausted = true; break;` at line 1213–1214),
  `observeResult` and `markExhaustion` have already been called once inside the loop body
  (lines 1137–1138), and the post-loop calls are skipped. Net result: exactly one call each.

---

### [7] [LOW] sessionLogWriter.writeSummary がロールオーバー済みセッションの usage を最終 session ID に紐付ける
- **Provenance Ref**: `83c09936`
- **Status**: FIXED
- **Evidence**: `agent-runner.ts` lines 1514–1518:
  ```ts
  sessionLogWriter.writeSummary({
    sessionId: sessionRollovers.length > 0 ? undefined : extractedSessionId,
    model: resolvedConfig.model,
    modelUsage: extractedModelUsage,
  });
  ```
  When rollovers occurred, `sessionId` is `undefined`, avoiding misattribution of
  multi-session cumulative cost to a single session ID.

---

### [8] [HIGH] SDK throw 経路のコンテキスト枯渇が rollover ループを素通りする（未修正）
- **Provenance Ref**: `11515924`
- **Status**: FIXED (same fix as [5])
- **Evidence**: Identical try-catch implementation in the rollover for-loop.
  Both `runMainWorkTurn()` and `retryWithBackoff(runMainWorkTurn, …)` are covered.

---

### [9] [MEDIUM] rollover budget 枯渇時に contextObserver.observeResult + markExhaustion が二重呼出しされる（未修正）
- **Provenance Ref**: `c8c4a458`
- **Status**: FIXED (same fix as [6])
- **Evidence**: Same `if (!rolloverExhausted)` guard in post-loop handler as finding [6].

---

### [10] [LOW] sessionLogWriter.writeSummary がロールオーバー済みセッションの usage を最終 session ID に紐付ける（未修正）
- **Provenance Ref**: `cf5ad0dd`
- **Status**: FIXED (same fix as [7])
- **Evidence**: Same `sessionRollovers.length > 0 ? undefined : extractedSessionId` as finding [7].

---

### [11] [MEDIUM] post-success halt 3 種が runResult.sessionRollovers を転記しない
- **Provenance Ref**: `f404ce08`
- **Status**: FIXED
- **Evidence**:
  - `src/core/step/step-halt.ts`: `makeDriftHalt`, `makeOutputGateHalt`, and `makeCommitFailHalt`
    all now accept a `sessionRollovers?: AgentSessionRollover[]` parameter and spread it into the
    returned `StepHalt` via `...(sessionRollovers && sessionRollovers.length > 0 ? { sessionRollovers } : {})`.
  - `src/core/step/executor.ts` call sites pass `runResult.sessionRollovers` as the final argument
    to all three factory functions (diff lines at ~402, ~422, ~459–473).
  - `src/core/step/commit-orchestrator.ts` `commitHalt` path uses `halt.sessionRollovers` to
    append `contextOnly: true` entries to `usage.json` before the main halt entry (lines ~582–610).
  - Design invariant D7 ("rollover 発生は usage.json の contextOnly エントリとして必ず残る")
    is now satisfied for drift / output-gate / commit-fail halt paths.
