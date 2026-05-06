## 1. StepContext 型の定義と接続

- [x] 1.1 `src/core/types.ts` に `StepContext` interface を定義（`config`, `slug`, `cwd?`, `request`, `repo`）
- [x] 1.2 `PipelineDeps` を `extends StepContext` に変更し、`StepContext` のフィールドを重複定義から除去
- [x] 1.3 `src/core/step/types.ts` の `StepDeps` を `StepContext` への alias に変更（`import type { StepContext } from "../types.js"`）
- [x] 1.4 `bun run typecheck` が通ることを確認（Step メソッドシグネチャは `StepDeps` を使っているため、alias 先変更で自動的に型が狭まる）

## 2. ClaudeCodeRunner の undefined as any 除去

- [x] 2.1 `src/adapter/claude-code/agent-runner.ts` の `buildMessage` 呼び出し箇所の deps 構築を `StepContext` 型に変更し、`client`/`githubClient` を削除
- [x] 2.2 同ファイルの `resultFilePath` 呼び出し箇所の deps 構築を同様に変更
- [x] 2.3 `grep -r "undefined as any" src/` で残存ゼロを確認

## 3. ManagedAgentRunner から JobStateStore 除去

- [x] 3.1 `src/adapter/managed-agent/agent-runner.ts` から `JobStateStore` import を除去
- [x] 3.2 `runProposeStyle` から `store.*` の全呼び出しと `pushStepResult` を除去し、`AgentRunResult` のみ返却に変更
- [x] 3.3 `runPollingStyle` から `store.*` の全呼び出しと `pushStepResult` を除去し、`AgentRunResult` のみ返却に変更
- [x] 3.4 `_updatedState` フィールドの返却を全箇所から除去
- [x] 3.5 `pushStepResult`、`recordFailedStepResult`、`attachStateAndRethrow`、`failStepWithError`、`createSessionWithHistory` の import のうち不要になったものを除去
- [x] 3.6 ManagedAgentRunner が `sessionId` と `agentBranch` を `AgentRunResult` の公式フィールドとして返却していることを確認

## 4. executor の統合

- [x] 4.1 `src/core/step/executor.ts` の `runAgentStep` 冒頭に `store.update(state, { step: step.name })` を追加
- [x] 4.2 `_updatedState` 分岐（L107-116 相当）を削除
- [x] 4.3 `result.sessionId` を step result の session フィールドに記録するロジックを追加
- [x] 4.4 `result.agentBranch` が存在し `state.branch` が未設定の場合に `state.branch` をセットするロジックを追加（`setsBranch` フラグとの整合を確認）
- [x] 4.5 `store.appendHistory` で step 開始/完了の history entry を追加（ManagedAgentRunner が内部でやっていた最低限の観測ポイントを維持）

## 5. テスト修正

- [x] 5.1 `_updatedState` を参照する executor テストを修正（全 adapter が `AgentRunResult` のみ返却するよう mock を変更）
- [x] 5.2 ManagedAgentRunner のテストから `JobStateStore` の mock を除去し、`AgentRunResult` の返り値のみ検証するよう書き換え
- [x] 5.3 ClaudeCodeRunner のテストで `undefined as any` に依存する部分があれば修正
- [x] 5.4 `bun run typecheck` が green であることを確認
- [x] 5.5 `bun run test` で全テスト pass を確認

## 6. 最終検証

- [x] 6.1 `grep -r "undefined as any" src/` で残存ゼロ
- [x] 6.2 `grep -r "_updatedState" src/` で残存ゼロ（comment 参照のみ）
- [x] 6.3 executor.ts の `runAgentStep` 内に managed/local の if 分岐が存在しないことを確認
- [x] 6.4 executor.ts の `runAgentStep` 冒頭で `store.update(state, { step: step.name })` を呼んでいることを確認
