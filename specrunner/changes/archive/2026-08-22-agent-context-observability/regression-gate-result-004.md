# Regression Gate Result — Iteration 004

## Summary

All 10 ledger findings verified. No regressions detected.

## Finding-by-Finding Verification

### [1] LOW — T-02: テストファイル名が未指定
- **File**: specrunner/changes/agent-context-observability/tasks.md:26
- **Status**: FIXED
- **Evidence**: tasks.md T-02 now explicitly names `tests/unit/core/usage/context-metrics-types.test.ts` as the target file and states `invocation-types.test.ts` と同じスタイルで同じファイルを拡張するのではなく別ファイルとして作成すること. Both the filename and the new-file-vs-extend decision are unambiguous.

### [2] LOW — spec.md: contextWindowTokens の multi-model 解決ロジック
- **File**: specrunner/changes/agent-context-observability/spec.md
- **Status**: FIXED
- **Evidence**: A `> **Note: contextWindowTokens の multi-model 解決ロジック**` block has been added after the "同一 message を二重に数えない" scenario (lines 55–59). It documents (1) resolved model key priority and (2) max fallback across observed models, and states this is handled in `context-observer.ts`.

### [3] LOW — spec.md: runner throw 経路での contextMetrics 欠落
- **File**: specrunner/changes/agent-context-observability/spec.md
- **Status**: FIXED
- **Evidence**: A `> **Note: runner throw（予期しない例外）経路での contextMetrics**` block has been added below the "exhaustion で halt した step の metrics が usage.json に残る" scenario (lines 157–161). It clarifies the distinction between the `AgentRunResult`-returning error path and the unexpected-throw path, and marks the latter as an acceptable known limitation.

### [4] MEDIUM — `makeDriftHalt` が contextMetrics を受け取らない
- **File**: src/core/step/step-halt.ts:220–226
- **Status**: FIXED
- **Evidence**: `makeDriftHalt` signature now includes `contextMetrics?: AgentContextMetrics` as a 5th parameter (line 225), and the returned object spreads `contextMetrics` conditionally (line 267). executor.ts calls `makeDriftHalt(drift, step.name, deps.slug, { startedAt }, runResult.contextMetrics)` passing the observed metrics.

### [5] MEDIUM — success 経路の contextMetrics 永続化が modelUsage ガードに従属
- **File**: src/core/step/commit-orchestrator.ts:262
- **Status**: FIXED
- **Evidence**: The guard has been changed from `if (modelUsage && deps.cwd && deps.slug)` to `if ((modelUsage || contextMetrics !== undefined) && deps.cwd && deps.slug)`. The comment explicitly explains that using `modelUsage &&` alone would silently discard contextMetrics when modelUsage is absent.

### [6] LOW — output-repair ターン非成功 result で observeResult/markExhaustion が欠落
- **File**: src/adapter/claude-code/agent-runner.ts:1178–1184
- **Status**: FIXED
- **Evidence**: The for-await loop now has an `else if (message.type === "result")` branch (lines 1178–1185) that calls `contextObserver.observeResult()` and conditionally `contextObserver.markExhaustion()` for non-success result messages. The catch block also calls `contextObserver.markExhaustion(errText)` (lines 1190–1193).

### [7] MEDIUM — success 経路の contextMetrics 永続化が modelUsage ガードに従属（未修正）
- **File**: src/core/step/commit-orchestrator.ts:262
- **Status**: FIXED
- **Evidence**: Same fix as finding [5]. The guard at line 262 is `(modelUsage || contextMetrics !== undefined)`.

### [8] LOW — output-repair ターンの非成功 result / catch 経路で observeResult と markExhaustion が呼ばれない（未修正）
- **File**: src/adapter/claude-code/agent-runner.ts:1178–1193
- **Status**: FIXED
- **Evidence**: Same fix as finding [6]. The for-await loop non-success branch and catch block both invoke the appropriate contextObserver methods.

### [9] MEDIUM — build-attestation.ts の stepHasUnpriced フラグがリジューム再試行シナリオで step cost を誤って null にする
- **File**: src/core/attestation/build-attestation.ts:146–151
- **Status**: FIXED
- **Evidence**: The invocation loop now has an explicit `if (inv.modelUsage === null) { continue; }` guard (lines 146–152) with a comment explaining that halt entries (modelUsage: null) must NOT set `stepHasUnpriced`. This prevents the halt entry from zeroing out priced retry-success invocations in the same step.

### [10] LOW — report_result retry ループが非成功 result の observeResult / markExhaustion を呼ばない
- **File**: src/adapter/claude-code/agent-runner.ts:1048–1054
- **Status**: FIXED
- **Evidence**: After the `runFollowUpQueryWithRetry` call in the report_result retry loop, lines 1048–1054 add an explicit check: `if (retryLastResult && retryLastResult.subtype !== "success")` then calls `contextObserver.observeResult()` and conditionally `contextObserver.markExhaustion()`. This mirrors the postWork and output-repair paths symmetrically.

## Evidence

- **Checked**: 10 findings
- **Skipped**: 0
- **Unverified**: 0
