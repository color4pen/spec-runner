# StepExecutor の成功パスを finalizeStep に統合する

## Meta

- **type**: refactoring
- **slug**: refactor-executor-finalize-step
- **base-branch**: main

## 背景

`src/core/step/executor.ts` の `runAgentStep`（L165-226）と `runCliStep`（L282-330）の成功パスが構造的にほぼ同一:

1. `step.resultFilePath()` で結果ファイルパスを取得
2. resultContent から `step.parseResult()` で verdict をパース
3. verdict null 時の warning + escalation フォールバック
4. `events.emit("verdict:parsed")` を発火
5. `pushStepResult()` で state に結果を追加
6. `store.appendHistory()` で verdict を記録
7. `store.persist()` で永続化

差分は resultContent の取得方法のみ:
- Agent step: `AgentRunResult.resultContent` から取得
- CLI step: `step.run()` 後にファイルシステムから読み取り

また agent step には `agentBranch` / `setsBranch` / `modelUsage` / `sessionId` の追加処理があるが、これらは finalizeStep の引数で吸収できる。

## 要件

1. `StepExecutor` に private メソッド `finalizeStep` を追加する。引数は state, step, resultContent, completedAt, および agent step 固有のオプショナルフィールド（sessionId, agentBranch, modelUsage）
2. `runAgentStep` の L165-226 を `finalizeStep` 呼び出しに置き換える
3. `runCliStep` の L282-330 を `finalizeStep` 呼び出しに置き換える
4. `setsBranch` と `agentBranch` による `state.branch` 設定ロジックも `finalizeStep` 内に移動する（agent step のみの処理だがパラメータの有無で判定可能）

## スコープ外

- runAgentStep / runCliStep のエラーパスの統合（エラーハンドリングは各 step kind で異なるため現状維持）
- StepExecutor 以外のモジュールの変更
- executor-helpers.ts の `failStepWithError` 活用（別課題）

## 受け入れ基準

- [ ] `finalizeStep` メソッドが存在し、runAgentStep と runCliStep の両方から呼ばれている
- [ ] executor.ts が 280 行以下に縮小している
- [ ] verdict パース → pushStepResult → appendHistory → persist のシーケンスが 1 箇所に集約されている
- [ ] 全既存テストが pass する（振る舞い不変）
- [ ] `bun run typecheck && bun run test` が green

## Workflow Options

- enabled: []
