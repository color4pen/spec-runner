# Request Review Result

<!-- EVIDENCE REPORT FORMAT:
     verdict は CLI が typed findings から導出する。この file に verdict 行を書かない。
     findings は report_result（typed）で報告し、この file はその補足の evidence report である。
     decision-needed の finding がある場合は escalation（needs-discussion）として扱われる。
-->

## 検証した項目

以下のコードアサーションをすべて Read / Grep で実測確認した。

### 1. `src/adapter/claude-code/agent-runner.ts` — main work は 1 SDK query / 1 session

`ClaudeCodeRunner.run()` 内で `runQuery()` → `runMainWorkTurn()` が 1 回の SDK `query()` 呼び出しとして実行されることを確認。`retryWithBackoff` は transient エラー時の retry であり、session を新規に立ち上げる機構はない（`resumeFallbackDone` による resume → new-session フォールバックは存在するが、context exhaustion 向けの rollover はない）。

確認箇所: `agent-runner.ts` lines 835–865（`runMainWorkTurn`）、lines 693–798（`runQuery`）。

### 2. `src/core/step/implementer.ts` — `maxTurns: 60`

`ImplementerStep.maxTurns = 60`（line 204）を確認。

### 3. `src/prompts/fragments.ts` — `COMMIT_DISCIPLINE` で `git add / git commit / git push` を禁止

`COMMIT_DISCIPLINE` の内容を確認。"あなたは file edit のみ行ってください。`git add` / `git commit` / `git push` の実行は禁止です。commit / push は pipeline executor が一括で行います。" と明記されており、"executor が一括 commit" 契約を確認。

確認箇所: `fragments.ts` lines 16–26。

### 4. `src/core/step/executor.ts` — `finalizeStepArtifacts` は `completionReason: "success"` 後のみ

`runAgentStep` 内で `runResult.completionReason !== "success"` のとき `makeNonSuccessHalt` を返して early return する（lines 377–385）。`finalizeStepArtifacts` 呼び出し（line 453）はその後のパスにしか到達しない。non-success では途中成果が commit されないことを確認。

### 5. `src/adapter/shared/artifact-bundle.ts` — 64KiB 超で bundle 全体を空にする

`MAX_ARTIFACT_BUNDLE_BYTES = 64 * 1024` （line 25）、`if (totalBytes > MAX_ARTIFACT_BUNDLE_BYTES) return ""` （line 56）を確認。サイズオーバー時は partial bundle ではなく全体を空にする動作を確認。

### 6. `src/adapter/claude-code/agent-runner.ts` — non-success error は generic `CLAUDE_CODE_QUERY_FAILED`

error result path（lines 993–1006）: `code: "CLAUDE_CODE_QUERY_FAILED"` のみ。
SDK throw path（lines 1317–1329）: 同じく `code: "CLAUDE_CODE_QUERY_FAILED"` のみ。
`CONTEXT_WINDOW_EXHAUSTED` typed code は存在しないことを Grep で確認（全 `src/` でマッチなし）。

### 7. `src/adapter/claude-code/context-observer.ts` — `isContextExhaustionError()` が正本として存在

`isContextExhaustionError(text: string): boolean`（line 34）を確認。fail-closed allowlist 照合：
- `"prompt is too long"`
- `"context length exceeded"`
- `"context window exceeded"`

の 3 パターンのみで、それ以外は false（fail-closed）であることを確認。

### 8. context metrics の usage.json 永続化

`src/kernel/context-metrics.ts` の `AgentContextMetrics` 型に `exhaustionAtTokens`, `compactionCount`, `peakActiveContextTokens` 等を確認。`src/core/usage/types.ts` の `CommandInvocation.contextMetrics?: AgentContextMetrics` で usage.json への永続化スキーマを確認。

### 9. transient retry の既存挙動

`isTransientAgentError()` のトークンリスト（`src/adapter/shared/transient-error.ts`）を確認。`"prompt is too long"` 等の context exhaustion 文字列は `TRANSIENT_TOKENS` に含まれておらず、context exhaustion は transient として扱われない（fail-closed）。

### 10. `#1070` の観測基盤

`context-observer.ts` の `createContextObserver()`, `observe()`, `observeResult()`, `markExhaustion()`, `snapshot()` が実装済であり、`agent-runner.ts` で各 message / result に対してこれらが呼ばれていることを確認（lines 739, 895, 989–991, 1029, 1316）。

## 検証できなかった項目

- C2 の実測データ（18.5 分動作・成果物 100KB・未 commit）: observational context であり、コードから検証不可。ただしコードベースの挙動（non-success 時の commit スキップ）とは整合する。

## Findings 詳細

None（blocking な finding なし）。

request のコードアサーションは全て実測で確認できた。受け入れ条件は明確・テスト可能であり、実装境界（rollover loop を `ClaudeCodeRunner.run()` 内に置く）も既存 adapter lifecycle 契約と整合する。
