## Why

agent が受け取る情報は request.md の内容と branch 名だけで、リポジトリの動的な状態（最近の commit、変更差分、既存 spec 一覧）が含まれていない。agent は毎回 `git log` や `ls` を自力で実行する必要があり、ターン消費と情報漏れの原因になっている。CLI がリポジトリ情報を事前に収集し各 step の buildMessage に注入することで、agent は初手から正確なコンテキストを持って作業できる。この基盤は request-create（対話コマンド C）の前提でもある。

## What Changes

- `DynamicContext` 型と `collectDynamicContext()` 収集関数を新規作成する
- `StepContext` に optional フィールド `dynamicContext` を追加する
- `CommandRunner.execute()` で workspace セットアップ後に 1 回 collect し、`PipelineDeps` に注入する
- `AgentRunContext` に `dynamicContext` を追加し、StepExecutor → AgentRunner → buildMessage の全経路で転送する
- propose / implementer / code-review の `buildMessage` が動的コンテキストを含むセクションを出力する
- `dynamicContext` が undefined の場合は既存動作を維持する（後方互換）
- git コマンド失敗時は空値にフォールバックし pipeline を止めない

## Capabilities

### New Capabilities
- `dynamic-context`: リポジトリの動的状態（git log、diff stat、spec/change 一覧）を収集し、pipeline step に注入する機能

### Modified Capabilities
- `step-execution-architecture`: StepContext に dynamicContext フィールドを追加。AgentRunContext の転送経路を拡張

## Impact

- `src/core/types.ts` — StepContext, PipelineDeps の型変更
- `src/core/port/agent-runner.ts` — AgentRunContext の型変更
- `src/core/step/executor.ts` — ctx 組み立てに dynamicContext 追加
- `src/core/command/runner.ts` — buildDeps 後に collect → 注入
- `src/adapter/claude-code/agent-runner.ts` — stepCtx に dynamicContext 転送
- `src/adapter/managed-agent/agent-runner.ts` — stepCtx に dynamicContext 転送
- `src/prompts/propose-system.ts` — 動的コンテキストセクション追加
- `src/core/step/implementer.ts` — 動的コンテキストセクション追加
- `src/core/step/code-review.ts` — 動的コンテキストセクション追加
- 新規ファイル: `src/git/dynamic-context.ts`
