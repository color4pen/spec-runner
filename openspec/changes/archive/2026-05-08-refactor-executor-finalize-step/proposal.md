## Why

`StepExecutor` の `runAgentStep`（L165-226）と `runCliStep`（L282-330）の成功パスが構造的にほぼ同一のコードを持つ。差分は resultContent の取得方法（agent: `AgentRunResult.resultContent`、CLI: ファイルシステム読み取り）と agent 固有のオプショナルフィールド（`sessionId`, `agentBranch`, `modelUsage`, `setsBranch`）のみ。

7 ステップのシーケンス（verdict パース → warning → event emit → pushStepResult → appendHistory → branch 設定 → persist）が 2 箇所に複製されており、将来の変更（新フィールド追加、verdict ログ形式変更等）でドリフトするリスクがある。

## What Changes

- `StepExecutor` に private メソッド `finalizeStep` を新設し、成功パスの共通シーケンスを集約
- `runAgentStep` の L165-226 を `finalizeStep` 呼び出しに置き換え
- `runCliStep` の L282-330 を `finalizeStep` 呼び出しに置き換え
- `setsBranch` / `agentBranch` による `state.branch` 設定ロジックも `finalizeStep` 内に移動

## Capabilities

### New Capabilities

(なし — 既存機能のリファクタリング)

### Modified Capabilities

- `step-execution-architecture`: `StepExecutor` の内部構造変更。公開 API (`execute`) は不変。成功パスの verdict パース → persist シーケンスが `finalizeStep` に集約される

## Impact

- **src/core/step/executor.ts**: `finalizeStep` 追加、`runAgentStep`/`runCliStep` の成功パスを置き換え。ファイル行数が ~332 → ~280 以下に縮小
- **テストファイル**: 変更なし（振る舞い不変のため既存テストがそのまま pass する）
- **外部 API/依存の変更なし**: 公開インターフェース・振る舞いともに不変
