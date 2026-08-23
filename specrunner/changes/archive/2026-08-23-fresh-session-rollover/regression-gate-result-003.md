# Regression Gate Result — fresh-session-rollover (Iteration 3)

## Verification Summary

- **Checked**: 14 ledger findings
- **Regressions found**: 1 (finding [14])
- **Fixed / closed**: 13

---

## Per-Finding Verification

### [1] [MEDIUM] T-04 Acceptance Criteria が存在しないテストパスを参照している
- **Provenance Ref**: `50ac5402`
- **Status**: FIXED
- **Evidence**: `tasks.md` T-04 Acceptance Criteria (line 75) uses the correct paths:
  `src/adapter/claude-code/__tests__/agent-runner-transient-retry.test.ts` and
  `src/adapter/claude-code/__tests__/agent-runner-report-settles.test.ts`.
  Confirmed via `git diff main...HEAD -- specrunner/changes/fresh-session-rollover/tasks.md`.

---

### [2] [LOW] T-04 と T-05 にまたがる rollover 実行シーケンスの暗黙的な順序依存
- **Provenance Ref**: `5c9da054`
- **Status**: FIXED
- **Evidence**: `tasks.md` T-04 explicitly states "まず **T-05 の `snapshot()` と sessionId キャプチャを
  先行させてから**（順序依存: T-05 参照）, `extractedSessionId = undefined`…" and T-05 adds the
  matching constraint "**この `snapshot()` および `extractedSessionId` からの sessionId キャプチャは、
  T-04 の `extractedSessionId = undefined` リセットより必ず前に実行すること**".
  The implementation in `agent-runner.ts` (rollover loop) confirms: `capturedSessionId` and
  `sessionSnapshot = contextObserver.snapshot()` are captured before `extractedSessionId = undefined`.

---

### [3] [LOW] throw 経路の error 詳細保全を検証する TC が存在しない
- **Provenance Ref**: `25102dba`
- **Status**: FIXED
- **Evidence**: `test-cases.md` TC-035 (lines 427–438) verifies:
  - `error.code === "CONTEXT_WINDOW_EXHAUSTED"` for throw path with exhaustion cause
  - `error.message` contains original throw message (preserved)
  - `error.cause` chain preserves the original cause (no message degradation)
  Corresponding test at `tests/unit/adapter/claude-code/agent-runner-rollover.test.ts` implements
  "TC-035: throw 経路で exhaustion と判定された場合 error.message と cause チェーンが保全される"
  with concrete assertions.

---

### [4] [HIGH] executor.ts の agent step 成功経路に sessionRollovers の pass-through が欠落
- **Provenance Ref**: `7d4bb838`
- **Status**: FIXED
- **Evidence**: `src/core/step/executor.ts` diff (line ~530) adds:
  ```ts
  ...(runResult.sessionRollovers && runResult.sessionRollovers.length > 0 ? { sessionRollovers: runResult.sessionRollovers } : {}),
  ```
  immediately after the `contextMetrics` spread in the success `StepExecutionResult` return block.
  `StepExecutionResult` success variant also gains `sessionRollovers?: AgentSessionRollover[]` in
  `commit-orchestrator.ts` (line ~127).

---

### [5] [LOW] TC-029: pipeline-logger の step:rollover JSONL 書き出しを検証する unit test が存在しない
- **Provenance Ref**: `204050f7`
- **Status**: FIXED (NEW finding — first appearance in this iteration)
- **Evidence**: `tests/unit/logger/pipeline-logger-rollover.test.ts` exists (5,698 bytes, created
  this iteration). The file has TC-029 header, tests `PipelineLogger.subscribe` handling of
  `step:rollover` event, and verifies JSONL output. `src/logger/pipeline-logger.ts` diff
  confirms the 4-line handler:
  ```ts
  events.on("step:rollover", ({ step, attempt, maxRollovers, reason }) => {
    this.write({ type: "step:rollover", step, attempt, maxRollovers, reason });
  });
  ```

---

### [6] [LOW] TC-027: rollover 後の touchedFileMessages 蓄積継続テストが未実装
- **Provenance Ref**: `784e4c31`
- **Status**: FIXED (NEW finding — first appearance in this iteration)
- **Evidence**: `tests/unit/adapter/claude-code/agent-runner-rollover.test.ts` contains:
  - `describe("TC-027: rollover 後も 1 回目セッションの touchedFileMessages が保持され最終 touchedFiles に含まれる")` (line 1182)
  - Test "files touched in multiple rollover sessions all appear in the final touchedFiles" (line 1212)
  - Test "session 1 touchedFileMessages do NOT leak into session 2 contextMetrics" (line 1241)

---

### [7] [HIGH] SDK throw 経路のコンテキスト枯渇が rollover ループを素通りする
- **Provenance Ref**: `fb5eacfa`
- **Status**: FIXED
- **Evidence**: `agent-runner.ts` rollover for-loop wraps both `runMainWorkTurn()` and
  `retryWithBackoff(runMainWorkTurn, …)` in a try-catch block. The catch uses
  `collectCauseText()` + `isContextExhaustionError()` to identify exhaustion throws and routes
  them through the rollover/budget-exhausted logic. Non-exhaustion throws and abort-triggered
  throws re-throw unchanged to the outer catch.

---

### [8] [MEDIUM] rollover budget 枯渇時に contextObserver.observeResult + markExhaustion が二重呼出しされる
- **Provenance Ref**: `0e1ba369`
- **Status**: FIXED
- **Evidence**: Post-loop handler guards with `if (!rolloverExhausted)` before calling
  `contextObserver.observeResult()` and `contextObserver.markExhaustion()`. When budget
  is exhausted (`rolloverExhausted = true; break` fired in the loop), post-loop calls are
  skipped, ensuring exactly one call each to `observeResult` and `markExhaustion`.

---

### [9] [LOW] sessionLogWriter.writeSummary がロールオーバー済みセッションの usage を最終 session ID に紐付ける
- **Provenance Ref**: `83c09936`
- **Status**: FIXED
- **Evidence**: `agent-runner.ts` writeSummary call:
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

### [10] [HIGH] SDK throw 経路のコンテキスト枯渇が rollover ループを素通りする（未修正）
- **Provenance Ref**: `11515924`
- **Status**: FIXED (same fix as [7])
- **Evidence**: Same try-catch implementation in the rollover for-loop covers both
  `runMainWorkTurn()` and `retryWithBackoff(runMainWorkTurn, …)`.

---

### [11] [MEDIUM] rollover budget 枯渇時に contextObserver.observeResult + markExhaustion が二重呼出しされる（未修正）
- **Provenance Ref**: `c8c4a458`
- **Status**: FIXED (same fix as [8])
- **Evidence**: Same `if (!rolloverExhausted)` guard in post-loop handler.

---

### [12] [LOW] sessionLogWriter.writeSummary がロールオーバー済みセッションの usage を最終 session ID に紐付ける（未修正）
- **Provenance Ref**: `cf5ad0dd`
- **Status**: FIXED (same fix as [9])
- **Evidence**: Same `sessionRollovers.length > 0 ? undefined : extractedSessionId` fix.

---

### [13] [MEDIUM] post-success halt 3 種が runResult.sessionRollovers を転記しない
- **Provenance Ref**: `f404ce08`
- **Status**: FIXED
- **Evidence**:
  - `src/core/step/step-halt.ts`: `makeDriftHalt`, `makeOutputGateHalt`, and `makeCommitFailHalt`
    all gain a `sessionRollovers?: AgentSessionRollover[]` parameter and spread it via
    `...(sessionRollovers && sessionRollovers.length > 0 ? { sessionRollovers } : {})`.
  - `src/core/step/executor.ts` call sites pass `runResult.sessionRollovers` as final argument
    to all three factory functions (diff lines at ~402, ~422, ~461–473).
  - `src/core/step/commit-orchestrator.ts` `commitHalt` path (line ~587) processes
    `halt.sessionRollovers` to append `contextOnly: true` entries to `usage.json`.
  - Design invariant D7 is satisfied for drift / output-gate / commit-fail halt paths.

---

### [14] [LOW] commitRound の halt メンバーが sessionRollovers の contextOnly エントリを usage.json に書かない
- **Provenance Ref**: `b3c359eb`
- **Status**: **STILL PRESENT** (NEW finding — first appearance in this iteration)
- **Evidence**: `src/core/step/commit-orchestrator.ts` `commitRound()` halt member branch
  (lines 730–741) only calls `recordFailedStepResult` and optionally appends halt history.
  There is no code to iterate `result.halt.sessionRollovers` or append contextOnly entries
  to usage.json. The `halt.sessionRollovers` handling added in this iteration (line ~587)
  is inside `commitHalt` (the sequential halt path), NOT inside `commitRound`.
  `applySuccessPostPersistEffects` (line 768–769) handles sessionRollovers for success members
  but there is no symmetric path for halt members in the parallel round context.
  Confirmed: the grep for `sessionRollovers` in `commit-orchestrator.ts` returns only
  lines 122, 127 (type), 262, 268, 270 (`applySuccessPostPersistEffects`), 587, 590 (`commitHalt`);
  none appear in the commitRound halt branch.
