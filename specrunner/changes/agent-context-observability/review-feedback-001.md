# Code Review Feedback — iteration 1

<!-- EVIDENCE REPORT FORMAT:
     verdict は CLI が typed findings から導出する。この file に verdict 行を書かない。
     findings は report_result（typed）で報告し、この file はその補足の evidence report である。
-->

## 検証した項目

### diff 規模確認
- `git diff main...HEAD --stat`: 32 files changed, 5649 insertions (+), 8 deletions (−)
- 変更ファイル: 新規カーネル型・context-observer・adapter wiring・StepHalt・CommitOrchestrator・usage-show・テスト群

### 型分離（TC-001, TC-002, TC-021, TC-022）
- `src/kernel/context-metrics.ts`: `import` 文なし（pure type module）。`AgentContextMetrics` は `provider`（必須）+ 7 optional field の 8 field 構成 ✓
- `src/kernel/model-usage.ts`: diff なし（`ModelUsage` の 4 field は無変更）✓
- `src/core/port/agent-runner.ts`: `AgentContextMetrics` を re-export し `AgentRunResult.contextMetrics?: AgentContextMetrics` を追加 ✓

### Context Observer（TC-003〜TC-010, TC-025, TC-026, TC-027）
- `src/adapter/claude-code/context-observer.ts`: `node:fs` / `child_process` / SDK runtime value の import なし ✓
- `observe()`: `type === "assistant"` かつ `parent_tool_use_id` が null/undefined かつ `isReplay !== true` のみ peak/last を更新 ✓
- `observe()`: `type === "system", subtype === "compact_boundary"` で `compactionCount` +1、`post_tokens` 欠落時は `contextTokensAfterCompaction` を undefined にリセット（後勝ち）✓
- `isContextExhaustionError()`: `"prompt is too long"` / `"context length exceeded"` / `"context window exceeded"` の case-insensitive allowlist、fail-closed ✓
- `snapshot()`: 6 観測 field が全 undefined なら `undefined` を返す ✓

### Agent Runner 配線（TC-028, TC-029）
- `createContextObserver` を `run()` 冒頭で生成 ✓
- main work loop (`runQuery` の `for await`): `contextObserver.observe(message)` を `observeMessage` とは独立して呼ぶ ✓
- `runFollowUpQueryWithRetry`: 同 for-await 内で `contextObserver.observe(message)` を呼ぶ（report-retry / postWork 双方が経由）✓
- output-repair ループ: 明示的に `contextObserver.observe(message)` を呼ぶ ✓
- success result と error result の双方で `contextObserver.observeResult(...)` を呼ぶ ✓
- 非 success result で `contextObserver.markExhaustion(errorJoined)` を呼ぶ ✓
- catch 節でも `contextObserver.markExhaustion(cause.message)` を呼ぶ ✓
- 全 8 return 経路（agent redirect 超過 / 非 success result / postWork error / result file not found / success / grace-abort success / timeout / catch error）で `contextMetrics: contextObserver.snapshot()` を付ける ✓

### StepHalt / Executor（TC-030, TC-031）
- `StepHalt` の `failed` / `awaiting-resume` 両 variant に `contextMetrics?: AgentContextMetrics` を追加 ✓
- `makeNonSuccessHalt` / `makeTimeoutHalt` が `Pick<AgentRunResult, "error" | "contextMetrics">` を受け取り、`runResult.contextMetrics` を spread ✓
- executor の success return で `runResult.contextMetrics` を `StepExecutionResult` に forward ✓
- `apply()` が `commitHalt(step, state, result.halt, deps)` に `deps` を渡す ✓
- `makeAgentThrowHalt` は `contextMetrics` を持たない（SDK throw 経路はランナー外なので設計上正当）✓

### CommitOrchestrator 永続化（TC-013, TC-014, TC-017, TC-018, TC-032, TC-033）
- success path: `applySuccessPostPersistEffects` が `contextMetrics` を `appendInvocation` に include ✓
- halt path: `halt.contextMetrics !== undefined && deps?.cwd && deps?.slug` の 3 条件が揃うときのみ `appendInvocation`（`modelUsage: null`, invocation metrics なし）✓
- best-effort: try/catch で握りつぶし、FSM 遷移・rethrow に影響させない ✓
- `contextMetrics` のない halt では usage.json に entry を追加しない（TC-019 互換維持）✓

### Usage Show（TC-015, TC-016, TC-034, TC-035）
- `context:` 行を `metrics:` 行の直後に出力 ✓
- 値が undefined の field は出さない ✓
- `contextMetrics` が absent の entry では `context:` 行を出さない ✓
- `modelUsage: null` の halt 由来 entry でも `context:` 行が出て例外にならない ✓

### 非対応 Provider（TC-011, TC-012）
- `src/adapter/codex/agent-runner.ts`: `agent-context-observability` キーワード + `contextMetrics` not-set 説明 + contextObserver import なし ✓
- `src/adapter/managed-agent/agent-runner.ts`: 同上 ✓
- `src/adapter/managed-agent/usage.ts`: `contextMetrics is NOT populated` 説明 ✓

### テスト全体（TC-036, TC-037, TC-038, TC-039）
- `bun run typecheck`: 0 errors ✓
- `bun run test`: 826 passed (826), Tests 12283 passed | 1 skipped | 2 todo ✓
- architecture invariants / dead-code テスト: pass ✓

## 検証できなかった項目

None

## Findings 詳細

指摘すべき高 / 中 severity の問題なし。以下、観察として記録する。

### 観察 1: success path の contextMetrics 永続化が modelUsage の存在に依存する

`applySuccessPostPersistEffects` の `appendInvocation` 呼び出しは `if (modelUsage && deps.cwd && deps.slug)` で保護されている。
ClaudeCodeRunner が success で返すとき `modelUsage` は実質的に常に存在するが、SDK が `modelUsage` を空 object で返した場合（`{}` → extractedModelUsage が undefined のまま）、`contextMetrics` も usage.json に書かれない。
この挙動は既存の `invocationMetrics` と同一であり design D7 の明示的な設計判断。実運用上 Claude Code SDK はこのケースを返さないため影響なし。

### 観察 2: observe() が全-zero 明示値を activeContext=0 として記録する

assistant message が `input_tokens: 0, cache_read_input_tokens: 0, cache_creation_input_tokens: 0` を明示的に返した場合、`anyPresent = true` なので `lastActiveContextTokens = 0` が設定される。exhaustion が続けて発火すると `exhaustionAtTokens = 0` になる。
Claude Code SDK がこのような応答を返すケースは実質存在しないが、数値としては misleading。context-observer の doc comment に「provider 報告値そのままであり 0 は有効な観測値」と追記すると将来の混乱を防げる（将来拡張時の任意改善）。

### 観察 3: `makeAgentThrowHalt` で contextMetrics が失われる経路

executor の `runner.run(ctx)` が `SpecRunnerError` を throw した場合（runner 内の `if (err instanceof SpecRunnerError) throw err`）、`makeAgentThrowHalt` が生成されるが `contextMetrics` は付かない。ただし ClaudeCodeRunner はその他の全例外を内部で catch して `AgentRunResult` として返すので、実用上のロスは SpecRunnerError（プログラミングエラー）のみ。設計上意図されたトレードオフ。
