## 1. ModelUsage 型定義と AgentRunResult 拡張

- [x] 1.1 `src/core/port/agent-runner.ts` に `ModelUsage` interface を追加（inputTokens, outputTokens, cacheReadInputTokens, cacheCreationInputTokens の 4 フィールド）
- [x] 1.2 `AgentRunResult` に `modelUsage?: Record<string, ModelUsage>` を追加

## 2. ClaudeCodeRunner で modelUsage を抽出

- [x] 2.1 `src/adapter/claude-code/agent-runner.ts` の import に `SDKResultSuccess` を追加（既存の `SDKResultMessage` import に併記）
- [x] 2.2 success path で `lastResult` を `SDKResultSuccess` にキャストし、`modelUsage` を port 層の `ModelUsage` 型にマッピング
- [x] 2.3 return 文に `modelUsage` を含める
- [x] 2.4 error path（`lastResult.subtype !== "success"` / catch）では `modelUsage` を含めない（undefined）

## 3. StepRun schema 拡張

- [x] 3.1 `src/state/schema.ts` の `StepRun` に `modelUsage?: Record<string, ModelUsage>` を追加（import は `../core/port/agent-runner.js` から、または同ファイルに再定義）
- [x] 3.2 `ModelUsage` の re-export または同型定義を `src/state/schema.ts` に配置（循環 import 回避のため state 層に独自定義が望ましい）

## 4. pushStepResult で modelUsage を格納

- [x] 4.1 `src/state/helpers.ts` の `StepResultInput` に `modelUsage?: Record<string, ModelUsage>` を追加
- [x] 4.2 `pushStepResult()` 内で `partial.modelUsage` が存在する場合のみ `StepRun.modelUsage` に含める（undefined なら省略）

## 5. executor から modelUsage を引き渡す

- [x] 5.1 `src/core/step/executor.ts` の `pushStepResult` 呼び出しに `modelUsage: runResult.modelUsage` を追加

## 6. 検証

- [x] 6.1 `bun run typecheck` が green
- [x] 6.2 `bun run test` が green
- [x] 6.3 既存テストで `AgentRunResult` を直接構築している箇所が型エラーにならないことを確認（optional なので問題ないはず）
