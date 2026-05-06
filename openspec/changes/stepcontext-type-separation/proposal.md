## Why

PR #80 で AgentRunner port を導入した際、Step メソッド（`buildMessage`/`resultFilePath`/`parseResult`）が `PipelineDeps` を要求する型設計と、ManagedAgentRunner が `JobStateStore` を内部操作して `_updatedState` 経由で state を返す責務二重化の 2 つの設計負債が残った（Issue #81）。ClaudeCodeRunner は `SessionClient`/`GitHubClient` を持たないため `undefined as any` で 4 箇所迂回しており、executor は managed/local で 2 系統の state 管理パスを持つ。

## What Changes

- `StepContext` interface を `src/core/types.ts` に新設し、Step メソッドが必要とする最小フィールド（`config`, `slug`, `cwd`, `request`, `repo`）のみを公開する
- `PipelineDeps extends StepContext` に変更し、既存コードとの後方互換を維持
- `StepDeps` 型を `StepContext` への alias に変更し、Step の全メソッドシグネチャは `StepDeps`（= `StepContext`）を受け取るよう統一
- ClaudeCodeRunner の `undefined as any` を全除去（`client`/`githubClient` が `StepContext` に含まれないため不要になる）
- ManagedAgentRunner から `JobStateStore` の全操作を除去し、`AgentRunResult` のみ返すよう変更
- `_updatedState` フィールドを完全廃止
- executor の managed/local 分岐を消し、1 本道の state 管理に統合
- `runAgentStep` 冒頭で `store.update(state, { step: step.name })` を呼び出す（`specrunner ps` の step 表示バグ修正）

## Capabilities

### New Capabilities

(なし — 本変更は既存機能のリファクタリング)

### Modified Capabilities

- `step-execution-architecture`: `StepDeps` 型を `PipelineDeps` alias から `StepContext` alias に変更。Step メソッドシグネチャの型が狭まる
- `job-state-store`: ManagedAgentRunner による直接操作を禁止し、JobStateStore の唯一の書き込み元を executor に統一。`_updatedState` 廃止に伴い executor の state 管理パスが 1 本化

## Impact

- **src/core/types.ts**: `StepContext` interface 追加、`PipelineDeps extends StepContext` に変更
- **src/core/step/types.ts**: `StepDeps` を `StepContext` alias に変更
- **src/core/step/executor.ts**: `_updatedState` 分岐削除、managed/local 統合、`store.update` 追加
- **src/adapter/claude-code/agent-runner.ts**: `undefined as any` 4 箇所を除去、deps 構築を `StepContext` 型に変更
- **src/adapter/managed-agent/agent-runner.ts**: `JobStateStore` import と全操作を除去、`_updatedState` 返却を除去、`AgentRunResult` のみ返却に変更
- **テストファイル**: `_updatedState` 参照と `JobStateStore` mock の修正
- **外部 API/依存の変更なし**: 振る舞いは不変、型のみ狭まる
