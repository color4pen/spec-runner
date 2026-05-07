## Why

PR #95 で config.json から model を外出し設定可能にしたが、実際にどの model が使われたかを事後検証する手段がない。SDK の `SDKResultSuccess` には `modelUsage: Record<string, ModelUsage>` が含まれており、モデル別のトークン消費情報が返ってくるが、現在の ClaudeCodeRunner はこの情報を破棄している。

## What Changes

- `AgentRunResult` に `modelUsage?: Record<string, { inputTokens: number; outputTokens: number }>` を追加
- `ClaudeCodeRunner` が `SDKResultSuccess.modelUsage` を `AgentRunResult.modelUsage` に格納する
- `StepRun` に `modelUsage` を追加し、executor が step result に記録する
- ManagedAgentRunner は `modelUsage` を返さない（Managed API に情報なし）→ `undefined` のまま
- `specrunner ps` への表示は不要（state file 直接参照で事後検証）

## Capabilities

### New Capabilities

(none)

### Modified Capabilities

- `agent-runner-port`: `AgentRunResult` に `modelUsage` optional フィールドを追加
- `step-result-schema`: `StepRun` に `modelUsage` optional フィールドを追加
- `claude-code-runner`: SDK result から `modelUsage` を抽出して返す

## Impact

- `src/core/port/agent-runner.ts`: `AgentRunResult` に `modelUsage` フィールド追加
- `src/adapter/claude-code/agent-runner.ts`: `SDKResultSuccess` から `modelUsage` を抽出
- `src/state/schema.ts`: `StepRun` に `modelUsage` optional フィールド追加
- `src/state/helpers.ts`: `StepResultInput` に `modelUsage` を追加、`pushStepResult` で格納
- `src/core/step/executor.ts`: `runResult.modelUsage` を `pushStepResult` に渡す
- 既存テスト: 型変更に伴う修正（optional なので破壊的変更なし）
